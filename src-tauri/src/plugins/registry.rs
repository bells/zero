use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::brand::{
    canonical_data_root, canonical_first_party_contribution_id, canonical_first_party_plugin_id,
    default_home, ZERO_FILE_PLUGIN_ID,
};

use super::contracts::{
    InstallPluginPackageInput, PluginHealth, PluginLifecycleResult, PluginManifest,
    PluginMarketEntry, PluginPermission, PluginRecord, PluginSource,
};
use super::package::{
    format_validation_issues, prepare_plugin_package, validate_approved_first_party_engine_package,
    validate_installed_first_party_engine, validate_zplugin_package, PreparedPluginPackage,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginRegistryDiskState {
    #[serde(default)]
    schema_version: u16,
    records: Vec<PluginRecord>,
    #[serde(default)]
    revision: u64,
}

const PLUGIN_REGISTRY_SCHEMA_VERSION: u16 = 6;

pub struct PluginRegistry {
    revision: AtomicU64,
    root: PathBuf,
    records: Vec<PluginRecord>,
    diagnostics: Vec<String>,
    engine_leases: HashMap<(String, String), usize>,
    startup_write_performed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivePluginEngine {
    pub plugin_id: String,
    pub package_version: String,
    pub engine_root: PathBuf,
}

pub struct PluginRegistryState {
    registry: Mutex<PluginRegistry>,
}

impl Default for PluginRegistryState {
    fn default() -> Self {
        Self {
            registry: Mutex::new(
                PluginRegistry::load_or_seed(PluginRegistry::default_root())
                    .expect("plugin registry should initialize"),
            ),
        }
    }
}

impl PluginRegistryState {
    pub fn from_registry(registry: PluginRegistry) -> Self {
        Self {
            registry: Mutex::new(registry),
        }
    }

    pub fn startup_write_performed(&self) -> bool {
        self.registry
            .lock()
            .map(|registry| registry.startup_write_performed())
            .unwrap_or(false)
    }

    pub fn with_registry<T>(
        &self,
        operation: impl FnOnce(&mut PluginRegistry) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut registry = self
            .registry
            .lock()
            .map_err(|_| "plugin registry lock is poisoned".to_string())?;

        operation(&mut registry)
    }

    pub fn try_read_registry<T>(
        &self,
        operation: impl FnOnce(&PluginRegistry) -> T,
    ) -> Result<T, String> {
        self.registry
            .try_lock()
            .map(|registry| operation(&registry))
            .map_err(|_| "plugin registry is busy".into())
    }
}

impl PluginRegistry {
    pub fn load_or_seed(root: impl Into<PathBuf>) -> Result<Self, String> {
        let mut diagnostic = crate::services::diagnostics::Operation::new(None, "registry");
        let result = (|| {
            let root = root.into();
            fs::create_dir_all(&root)
                .map_err(|error| format!("failed to create plugin root: {error}"))?;

            let registry_path = registry_path(&root);
            if !registry_path.exists() {
                let mut registry = Self {
                    revision: AtomicU64::new(0),
                    root,
                    records: bundled_plugin_records(),
                    diagnostics: Vec::new(),
                    engine_leases: HashMap::new(),
                    startup_write_performed: false,
                };
                registry.save()?;
                registry.startup_write_performed = true;
                return Ok(registry);
            }

            match fs::read_to_string(&registry_path)
                .map_err(|error| format!("failed to read plugin registry: {error}"))
                .and_then(|content| {
                    serde_json::from_str::<PluginRegistryDiskState>(&content)
                        .map_err(|error| format!("failed to parse plugin registry: {error}"))
                }) {
                Ok(mut state) => {
                    let original = state.clone();
                    canonicalize_records(&mut state.records);
                    migrate_bundled_records(&mut state.records);
                    for record in &mut state.records {
                        if !super::compatibility::check_record(record).compatible {
                            record.health = PluginHealth::Incompatible;
                        }
                    }
                    state.schema_version = PLUGIN_REGISTRY_SCHEMA_VERSION;
                    let changed = state != original;
                    let mut registry = Self {
                        revision: AtomicU64::new(state.revision),
                        root,
                        records: state.records,
                        diagnostics: Vec::new(),
                        engine_leases: HashMap::new(),
                        startup_write_performed: false,
                    };
                    if changed {
                        registry.save()?;
                        registry.startup_write_performed = true;
                    }
                    Ok(registry)
                }
                Err(error) => {
                    let mut registry = Self {
                        revision: AtomicU64::new(0),
                        root,
                        records: bundled_plugin_records(),
                        diagnostics: vec![format!("registry recovery: {error}")],
                        engine_leases: HashMap::new(),
                        startup_write_performed: false,
                    };
                    registry.save()?;
                    registry.startup_write_performed = true;
                    Ok(registry)
                }
            }
        })();
        diagnostic.finish(&result);
        result
    }

    pub fn default_root() -> PathBuf {
        canonical_data_root(&default_home()).join("plugins")
    }

    pub fn intake_root(&self) -> PathBuf {
        self.root.join(".intake")
    }

    pub fn plugin_data_root(&self, plugin: &str) -> PathBuf {
        self.root
            .parent()
            .unwrap_or(&self.root)
            .join("data/plugins")
            .join(plugin)
    }

    pub fn revision(&self) -> u64 {
        self.revision.load(Ordering::Acquire)
    }

    pub fn records(&self) -> &[PluginRecord] {
        &self.records
    }

    pub fn diagnostics(&self) -> &[String] {
        &self.diagnostics
    }

    pub fn startup_write_performed(&self) -> bool {
        self.startup_write_performed
    }

    pub fn save(&self) -> Result<(), String> {
        let mut diagnostic = crate::services::diagnostics::Operation::new(None, "registry");
        let result = (|| {
            let revision = self
                .revision()
                .checked_add(1)
                .filter(|r| *r <= 9_007_199_254_740_991)
                .ok_or("registry revision exhausted")?;
            let state = PluginRegistryDiskState {
                revision,
                schema_version: PLUGIN_REGISTRY_SCHEMA_VERSION,
                records: self.records.clone(),
            };
            let content = serde_json::to_string_pretty(&state)
                .map_err(|error| format!("failed to serialize plugin registry: {error}"))?;

            let target = registry_path(&self.root);
            let temporary = self.root.join(format!(
                ".registry-{}.tmp",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|duration| duration.as_nanos())
                    .unwrap_or_default()
            ));
            let save_result = (|| -> Result<(), String> {
                let mut file = File::create(&temporary).map_err(|error| {
                    format!("failed to create plugin registry staging file: {error}")
                })?;
                file.write_all(content.as_bytes()).map_err(|error| {
                    format!("failed to write plugin registry staging file: {error}")
                })?;
                file.sync_all().map_err(|error| {
                    format!("failed to sync plugin registry staging file: {error}")
                })?;
                atomic_replace_file(&temporary, &target).map_err(|error| {
                    format!("failed to atomically replace plugin registry: {error}")
                })?;
                if let Ok(directory) = File::open(&self.root) {
                    let _ = directory.sync_all();
                }
                Ok(())
            })();
            if save_result.is_err() {
                let _ = fs::remove_file(&temporary);
            }
            if save_result.is_ok() {
                self.revision.store(revision, Ordering::Release);
            }
            save_result
        })();
        diagnostic.finish(&result);
        result
    }

    pub fn set_enabled_and_save(
        &mut self,
        name: &str,
        enabled: bool,
    ) -> Result<PluginRecord, String> {
        let previous = self.records.clone();
        let result = self.set_enabled(name, enabled).and_then(|record| {
            self.save()?;
            Ok(record)
        });
        if result.is_err() {
            self.records = previous;
        }
        result
    }

    pub fn set_enabled(&mut self, name: &str, enabled: bool) -> Result<PluginRecord, String> {
        let record = self
            .records
            .iter_mut()
            .find(|record| record.name == name)
            .ok_or_else(|| format!("plugin {name} was not found"))?;

        if enabled {
            let report = super::compatibility::check_record(record);
            if !report.compatible {
                record.health = PluginHealth::Incompatible;
                return Err(report
                    .issues
                    .iter()
                    .map(|issue| issue.message.as_str())
                    .collect::<Vec<_>>()
                    .join("; "));
            }
        }
        record.enabled = enabled;
        record.health = if enabled {
            PluginHealth::Ready
        } else {
            PluginHealth::Disabled
        };

        Ok(record.clone())
    }

    pub fn validate_package(
        &self,
        package_path: impl AsRef<Path>,
    ) -> Result<super::contracts::PluginPackageValidationReport, String> {
        validate_zplugin_package(package_path.as_ref()).map_err(|error| error.message)
    }

    pub fn install_local_package(
        &mut self,
        input: InstallPluginPackageInput,
    ) -> Result<PluginRecord, String> {
        self.install_package(input, PluginSource::Local, None)
    }

    pub fn install_market_package_from_path(
        &mut self,
        entry: &PluginMarketEntry,
        input: InstallPluginPackageInput,
    ) -> Result<PluginRecord, String> {
        self.install_package(input, PluginSource::Market, Some(entry))
    }

    pub fn uninstall_plugin(&mut self, name: &str) -> Result<PluginLifecycleResult, String> {
        if is_protected_host_surface(name) {
            return Err(format!("{name} is a protected host surface"));
        }

        if self
            .engine_leases
            .iter()
            .any(|((plugin_id, _), count)| plugin_id == name && *count > 0)
        {
            return Err(format!(
                "plugin {name} has an active document conversion and cannot be uninstalled"
            ));
        }

        let index = self
            .records
            .iter()
            .position(|record| record.name == name)
            .ok_or_else(|| format!("plugin {name} was not found"))?;
        let record = self.records.remove(index);
        if let Err(error) = self.save() {
            self.records.insert(index, record);
            return Err(error);
        }

        if record.source != PluginSource::Bundled {
            self.remove_plugin_assets(&record)?;
        }

        Ok(PluginLifecycleResult {
            plugin: Some(record),
            message: format!("plugin {name} uninstalled"),
        })
    }

    pub fn restore_bundled_defaults(&mut self) -> Result<Vec<PluginRecord>, String> {
        let previous = self.records.clone();
        for bundled in bundled_plugin_records() {
            match self
                .records
                .iter_mut()
                .find(|record| record.name == bundled.name)
            {
                Some(record) if record.source == PluginSource::Bundled => {
                    record.enabled = true;
                    record.health = PluginHealth::Ready;
                }
                Some(_) => {}
                None => self.records.push(bundled),
            }
        }

        if let Err(error) = self.save() {
            self.records = previous;
            return Err(error);
        }

        Ok(self.records.clone())
    }

    fn install_package(
        &mut self,
        input: InstallPluginPackageInput,
        source: PluginSource,
        market_entry: Option<&PluginMarketEntry>,
    ) -> Result<PluginRecord, String> {
        let prepared = prepare_plugin_package(Path::new(&input.package_path), &self.intake_root())
            .map_err(|e| e.message)?;
        self.install_prepared(input, source, market_entry, prepared)
    }

    pub fn preflight_prepared(
        &self,
        input: &InstallPluginPackageInput,
        market_entry: Option<&PluginMarketEntry>,
        prepared: &PreparedPluginPackage,
    ) -> Result<(), String> {
        let report = &prepared.report;
        if !report.valid {
            return Err(format_validation_issues(&report.issues));
        }
        let expected = input
            .expected_sha256
            .as_deref()
            .or_else(|| market_entry.and_then(|e| e.sha256.as_deref()));
        if expected.is_some_and(|hash| !hash.eq_ignore_ascii_case(&report.sha256))
            || (report.protocol_manifest.is_some() && expected.is_none())
        {
            return Err(
                "Package digest differs from the reviewed package or approval has no digest".into(),
            );
        }
        let manifest = report
            .manifest
            .clone()
            .ok_or_else(|| "package manifest was not available after validation".to_string())?;

        if let Some(entry) = market_entry {
            validate_market_entry_matches_manifest(entry, &manifest)?;
        }

        let existing = self
            .records
            .iter()
            .find(|record| record.name == manifest.name);
        if existing
            .as_ref()
            .is_some_and(|record| record.version == manifest.version)
        {
            return Err(format!(
                "plugin {} version {} is already installed",
                manifest.name, manifest.version
            ));
        }
        if existing.as_ref().is_some_and(|record| {
            record.source == PluginSource::Bundled
                && (manifest.name != ZERO_FILE_PLUGIN_ID || manifest.first_party_engine.is_none())
        }) {
            return Err(format!("plugin {} is already installed", manifest.name));
        }

        if !permissions_are_approved(&manifest.permissions, &input.approved_permissions) {
            return Err(format!(
                "permissions were not approved for plugin {}",
                manifest.name
            ));
        }

        let compatibility = if let Some(manifest) = &report.protocol_manifest {
            super::compatibility::check_manifest(
                &serde_json::to_value(manifest).map_err(|e| e.to_string())?,
            )
        } else {
            super::compatibility::check_legacy(
                &manifest,
                env!("CARGO_PKG_VERSION"),
                super::compatibility::current_platform(),
                false,
            )
        };
        if !compatibility.compatible {
            return Err(compatibility
                .issues
                .iter()
                .map(|i| i.message.as_str())
                .collect::<Vec<_>>()
                .join("; "));
        }
        Ok(())
    }

    pub fn install_prepared(
        &mut self,
        input: InstallPluginPackageInput,
        source: PluginSource,
        market_entry: Option<&PluginMarketEntry>,
        prepared: PreparedPluginPackage,
    ) -> Result<PluginRecord, String> {
        self.preflight_prepared(&input, market_entry, &prepared)?;
        let report = &prepared.report;
        let manifest = report.manifest.clone().ok_or("Missing prepared manifest")?;
        let existing_index = self
            .records
            .iter()
            .position(|record| record.name == manifest.name);
        let existing = existing_index.map(|index| self.records[index].clone());
        let enabled = existing
            .as_ref()
            .map(|record| record.enabled)
            .unwrap_or_else(|| input.enabled.unwrap_or(true));
        let final_root = plugin_version_root(&self.root, &manifest.name, &manifest.version);
        let reuse_existing_version = final_root.exists()
            && manifest.name == ZERO_FILE_PLUGIN_ID
            && manifest.first_party_engine.is_some();
        if final_root.exists() && !reuse_existing_version {
            return Err(format!(
                "plugin {} version {} is already extracted",
                manifest.name, manifest.version
            ));
        }

        let staging_root = prepared.extracted_root.clone();
        let install_result = (|| -> Result<(), String> {
            if reuse_existing_version {
                validate_installed_first_party_engine(&final_root, &manifest)?;
                return Ok(());
            }

            if let Some(parent) = final_root.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("failed to create plugin directory: {error}"))?;
            }

            fs::rename(&staging_root, &final_root)
                .map_err(|error| format!("failed to activate plugin install: {error}"))?;

            Ok(())
        })();

        if install_result.is_err() {
            let _ = fs::remove_dir_all(&staging_root);
            if !reuse_existing_version {
                let _ = fs::remove_dir_all(&final_root);
            }
        }
        install_result?;

        let activated_manifest =
            if manifest.name == ZERO_FILE_PLUGIN_ID && manifest.first_party_engine.is_some() {
                merge_zero_file_engine_manifest(&bundled_file_record().manifest, &manifest)
            } else {
                manifest.clone()
            };
        let record = PluginRecord {
            protocol_manifest: report.protocol_manifest.clone(),
            name: activated_manifest.name.clone(),
            version: activated_manifest.version.clone(),
            author: activated_manifest.author.clone(),
            source,
            enabled,
            health: if enabled {
                PluginHealth::Ready
            } else {
                PluginHealth::Disabled
            },
            manifest: activated_manifest.clone(),
            installed_path: Some(final_root.to_string_lossy().into_owned()),
            approved_permissions: activated_manifest.permissions.clone(),
            package_sha256: Some(report.sha256.clone()),
        };

        let prior_records = self.records.clone();
        if let Some(index) = existing_index {
            self.records[index] = record.clone();
        } else {
            self.records.push(record.clone());
        }
        if let Err(error) = self.save() {
            self.records = prior_records;
            if !reuse_existing_version {
                let _ = fs::remove_dir_all(&final_root);
            }
            return Err(error);
        }

        if let Err(error) = self.cleanup_inactive_versions(&record.name, &record.version) {
            self.diagnostics.push(format!(
                "inactive plugin version cleanup for {}: {error}",
                record.name
            ));
        }

        Ok(record)
    }

    pub fn acquire_active_engine(&mut self, name: &str) -> Result<ActivePluginEngine, String> {
        let engine = self.active_engine(name)?;
        let key = (name.to_string(), engine.package_version.clone());
        *self.engine_leases.entry(key).or_default() += 1;
        Ok(engine)
    }

    pub fn active_engine(&self, name: &str) -> Result<ActivePluginEngine, String> {
        self.active_engine_with_guards(name, validate_installed_first_party_engine, |record| {
            let package_sha256 = record
                .package_sha256
                .as_deref()
                .ok_or_else(|| format!("plugin {} has no verified package digest", record.name))?;
            validate_approved_first_party_engine_package(
                &record.name,
                &record.version,
                package_sha256,
            )
        })
    }

    #[cfg(test)]
    fn active_engine_with_validator(
        &self,
        name: &str,
        validate_installed: impl FnOnce(&Path, &PluginManifest) -> Result<(), String>,
    ) -> Result<ActivePluginEngine, String> {
        self.active_engine_with_guards(name, validate_installed, |_| Ok(()))
    }

    fn active_engine_with_guards(
        &self,
        name: &str,
        validate_installed: impl FnOnce(&Path, &PluginManifest) -> Result<(), String>,
        validate_approval: impl FnOnce(&PluginRecord) -> Result<(), String>,
    ) -> Result<ActivePluginEngine, String> {
        if name != ZERO_FILE_PLUGIN_ID {
            crate::services::diagnostics::native(
                Some("zero.file"),
                "identity",
                crate::services::diagnostics::contracts::Outcome::Failed,
            );
            return Err(format!("plugin {name} has no trusted document engine"));
        }
        let record = self
            .records
            .iter()
            .find(|record| record.name == name)
            .ok_or_else(|| format!("plugin {name} is not installed"))?;
        if !record.enabled || record.health == PluginHealth::Disabled {
            return Err(format!("plugin {name} is disabled"));
        }
        if record.manifest.name != ZERO_FILE_PLUGIN_ID
            || record.manifest.id.as_deref() != Some(ZERO_FILE_PLUGIN_ID)
            || record.manifest.first_party_engine.is_none()
            || !record
                .approved_permissions
                .contains(&PluginPermission::DocumentConvert)
        {
            crate::services::diagnostics::native(
                Some("zero.file"),
                "identity",
                crate::services::diagnostics::contracts::Outcome::Failed,
            );
            return Err(format!("plugin {name} has no trusted document engine"));
        }
        let installed_path = record.installed_path.as_deref().ok_or_else(|| {
            crate::services::diagnostics::native(
                Some("zero.file"),
                "assets",
                crate::services::diagnostics::contracts::Outcome::Failed,
            );
            format!("plugin {name} has no activated package assets")
        })?;
        let version_root = PathBuf::from(installed_path);
        if !version_root.starts_with(&self.root) {
            return Err(format!(
                "plugin {name} has an invalid activated package path"
            ));
        }
        validate_installed(&version_root, &record.manifest).map_err(|error| {
            format!("plugin {name} installed engine integrity verification failed: {error}")
        })?;
        validate_approval(record)?;
        let engine_root = version_root.join("engine");
        if !engine_root.is_dir() {
            crate::services::diagnostics::native(
                Some("zero.file"),
                "assets",
                crate::services::diagnostics::contracts::Outcome::Failed,
            );
            return Err(format!("plugin {name} engine assets are missing"));
        }
        Ok(ActivePluginEngine {
            plugin_id: name.to_string(),
            package_version: record.version.clone(),
            engine_root,
        })
    }

    pub fn release_engine(&mut self, name: &str, version: &str) -> Result<(), String> {
        let key = (name.to_string(), version.to_string());
        let Some(count) = self.engine_leases.get_mut(&key) else {
            return Err(format!(
                "plugin {name} engine version {version} has no active lease"
            ));
        };
        *count = count.saturating_sub(1);
        if *count == 0 {
            self.engine_leases.remove(&key);
        }
        let active_version = self
            .records
            .iter()
            .find(|record| record.name == name)
            .map(|record| record.version.clone())
            .unwrap_or_default();
        self.cleanup_inactive_versions(name, &active_version)
    }

    pub fn engine_asset_root(&self, name: &str, version: &str) -> Result<PathBuf, String> {
        let active = self.records.iter().any(|record| {
            record.name == name
                && record.version == version
                && record.enabled
                && record.manifest.first_party_engine.is_some()
        });
        let leased = self
            .engine_leases
            .get(&(name.to_string(), version.to_string()))
            .is_some_and(|count| *count > 0);
        if !active && !leased {
            return Err(format!(
                "plugin {name} engine version {version} is not active"
            ));
        }
        let root = plugin_version_root(&self.root, name, version).join("engine");
        if !root.is_dir() {
            return Err(format!(
                "plugin {name} engine version {version} assets are missing"
            ));
        }
        Ok(root)
    }

    fn cleanup_inactive_versions(&self, name: &str, active_version: &str) -> Result<(), String> {
        let plugin_root = plugin_name_root(&self.root, name);
        let Ok(entries) = fs::read_dir(&plugin_root) else {
            return Ok(());
        };
        let mut inactive = Vec::new();
        for entry in entries {
            let entry =
                entry.map_err(|error| format!("failed to inspect plugin versions: {error}"))?;
            let version = entry.file_name().to_string_lossy().into_owned();
            if !entry
                .file_type()
                .map_err(|error| format!("failed to inspect plugin version: {error}"))?
                .is_dir()
                || version == active_version
                || self
                    .engine_leases
                    .get(&(name.to_string(), version.clone()))
                    .is_some_and(|count| *count > 0)
            {
                continue;
            }
            inactive.push((version, entry.path()));
        }
        inactive.sort_by(|left, right| right.0.cmp(&left.0));
        for (_, path) in inactive.into_iter().skip(1) {
            fs::remove_dir_all(path)
                .map_err(|error| format!("failed to remove inactive plugin version: {error}"))?;
        }
        Ok(())
    }

    fn remove_plugin_assets(&self, record: &PluginRecord) -> Result<(), String> {
        let Some(installed_path) = &record.installed_path else {
            return Ok(());
        };
        let installed_path = PathBuf::from(installed_path);
        if !installed_path.starts_with(&self.root) {
            return Err(format!(
                "plugin {} has an unsafe installed path",
                record.name
            ));
        }
        if plugin_name_root(&self.root, &record.name).exists() {
            fs::remove_dir_all(plugin_name_root(&self.root, &record.name)).map_err(|error| {
                format!(
                    "failed to remove plugin assets for {}: {error}",
                    record.name
                )
            })?;
        }
        Ok(())
    }
}

fn merge_zero_file_engine_manifest(
    bundled: &PluginManifest,
    package: &PluginManifest,
) -> PluginManifest {
    let mut merged = bundled.clone();
    merged.version = package.version.clone();
    merged.permissions = package.permissions.clone();
    merged.engines = package.engines.clone();
    merged.platforms = package
        .platforms
        .clone()
        .or_else(|| bundled.platforms.clone());
    merged.first_party_engine = package.first_party_engine.clone();
    merged
}

fn registry_path(root: &Path) -> PathBuf {
    root.join("registry.json")
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn atomic_replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

#[cfg(target_os = "windows")]
pub(crate) fn atomic_replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, ReplaceFileW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        REPLACEFILE_IGNORE_MERGE_ERRORS,
    };

    let target_exists = target.exists();
    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let result = unsafe {
        if target_exists {
            ReplaceFileW(
                PCWSTR(target.as_ptr()),
                PCWSTR(source.as_ptr()),
                PCWSTR::null(),
                REPLACEFILE_IGNORE_MERGE_ERRORS,
                None,
                None,
            )
        } else {
            MoveFileExW(
                PCWSTR(source.as_ptr()),
                PCWSTR(target.as_ptr()),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
    };
    result.map_err(|error| std::io::Error::other(error.to_string()))
}

fn plugin_name_root(root: &Path, name: &str) -> PathBuf {
    root.join(name)
}

fn plugin_version_root(root: &Path, name: &str, version: &str) -> PathBuf {
    plugin_name_root(root, name).join(version)
}

fn bundled_plugin_records() -> Vec<PluginRecord> {
    crate::bundled_metadata::manifests()
        .into_iter()
        .map(bundled_record)
        .collect()
}

fn bundled_file_record() -> PluginRecord {
    bundled_plugin_records()
        .into_iter()
        .find(|r| r.name == ZERO_FILE_PLUGIN_ID)
        .unwrap()
}

fn bundled_record(manifest: PluginManifest) -> PluginRecord {
    let approved_permissions = manifest.permissions.clone();
    let author = manifest.author.clone();
    let version = manifest.version.clone();

    PluginRecord {
        protocol_manifest: None,
        name: manifest.name.clone(),
        version,
        author,
        source: PluginSource::Bundled,
        enabled: true,
        health: PluginHealth::Ready,
        manifest,
        installed_path: None,
        approved_permissions,
        package_sha256: None,
    }
}

fn migrate_bundled_records(records: &mut Vec<PluginRecord>) {
    for bundled in bundled_plugin_records() {
        if let Some(record) = records
            .iter_mut()
            .find(|record| record.name == bundled.name && record.source == PluginSource::Bundled)
        {
            let enabled = record.enabled;
            let health = record.health.clone();
            *record = bundled;
            record.enabled = enabled;
            record.health = if enabled {
                health
            } else {
                PluginHealth::Disabled
            };
        } else if !records.iter().any(|record| record.name == bundled.name) {
            records.push(bundled);
        }
    }
}

fn canonicalize_records(records: &mut Vec<PluginRecord>) {
    let mut canonical = Vec::<(PluginRecord, bool)>::new();

    for mut record in std::mem::take(records) {
        let original_name = record.name.clone();
        canonicalize_record(&mut record);
        let was_already_canonical = original_name == record.name;

        if let Some((existing, existing_was_canonical)) = canonical
            .iter_mut()
            .find(|(existing, _)| existing.name == record.name)
        {
            if was_already_canonical || !*existing_was_canonical {
                *existing = record;
                *existing_was_canonical = was_already_canonical;
            }
        } else {
            canonical.push((record, was_already_canonical));
        }
    }

    *records = canonical.into_iter().map(|(record, _)| record).collect();
}

fn canonicalize_record(record: &mut PluginRecord) {
    record.name = canonical_first_party_plugin_id(&record.name).to_string();
    record.manifest.name = canonical_first_party_plugin_id(&record.manifest.name).to_string();
    if let Some(id) = &mut record.manifest.id {
        *id = canonical_first_party_plugin_id(id).to_string();
    }

    let Some(contributes) = &mut record.manifest.contributes else {
        return;
    };
    if let Some(views) = &mut contributes.views {
        for view in views {
            view.id = canonical_first_party_contribution_id(&view.id);
        }
    }
    if let Some(commands) = &mut contributes.commands {
        for command in commands {
            command.id = canonical_first_party_contribution_id(&command.id);
        }
    }
    if let Some(items) = &mut contributes.status_bar_items {
        for item in items {
            item.id = canonical_first_party_contribution_id(&item.id);
            if let Some(command_id) = &mut item.action.command_id {
                *command_id = canonical_first_party_contribution_id(command_id);
            }
        }
    }
}

fn permissions_are_approved(requested: &[PluginPermission], approved: &[PluginPermission]) -> bool {
    requested
        .iter()
        .all(|permission| approved.iter().any(|approved| approved == permission))
}

fn validate_market_entry_matches_manifest(
    entry: &PluginMarketEntry,
    manifest: &PluginManifest,
) -> Result<(), String> {
    if entry.name != manifest.name
        || entry.version != manifest.version
        || entry.author != manifest.author
    {
        return Err(format!(
            "market metadata does not match package manifest for {}",
            entry.name
        ));
    }

    Ok(())
}

fn is_protected_host_surface(name: &str) -> bool {
    matches!(name, "preferences" | "about" | "quit")
}

#[cfg(test)]
mod tests {
    use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};

    use super::*;
    use crate::plugins::contracts::{
        PluginDocumentDirection, PluginEngineAsset, PluginEnginePlatformMinimum,
        PluginFirstPartyEngine, PluginPlatform,
    };
    use crate::plugins::package::{
        first_party_engine_signature_payload, sha256_hex,
        validate_installed_first_party_engine_with_key,
    };

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "zero-registry-lease-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn unchanged_registry_load_does_not_rewrite_or_sync() {
        let root = unique_root();
        let first = PluginRegistry::load_or_seed(root.clone()).unwrap();
        assert!(first.startup_write_performed());
        let path = registry_path(&root);
        let before_bytes = fs::read(&path).unwrap();
        let before_modified = fs::metadata(&path).unwrap().modified().unwrap();

        std::thread::sleep(std::time::Duration::from_millis(20));
        let second = PluginRegistry::load_or_seed(root.clone()).unwrap();
        assert!(!second.startup_write_performed());
        assert_eq!(fs::read(&path).unwrap(), before_bytes);
        assert_eq!(
            fs::metadata(&path).unwrap().modified().unwrap(),
            before_modified
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn active_version_lease_blocks_uninstall_and_inactive_cleanup() {
        let root = unique_root();
        let mut registry = PluginRegistry::load_or_seed(root.clone()).unwrap();
        fs::create_dir_all(root.join("zero.file/0.8.0/engine")).unwrap();
        fs::create_dir_all(root.join("zero.file/0.9.0/engine")).unwrap();
        fs::create_dir_all(root.join("zero.file/1.0.0/engine")).unwrap();
        registry
            .engine_leases
            .insert((ZERO_FILE_PLUGIN_ID.into(), "0.9.0".into()), 1);

        assert!(registry
            .uninstall_plugin(ZERO_FILE_PLUGIN_ID)
            .expect_err("active lease must block uninstall")
            .contains("active document conversion"));
        registry
            .cleanup_inactive_versions(ZERO_FILE_PLUGIN_ID, "1.0.0")
            .unwrap();
        assert!(root.join("zero.file/0.9.0").exists());
        registry
            .release_engine(ZERO_FILE_PLUGIN_ID, "0.9.0")
            .unwrap();
        assert!(!root.join("zero.file/0.8.0").exists());
        assert!(root.join("zero.file/0.9.0").exists());
        assert!(root.join("zero.file/1.0.0").exists());
    }

    #[test]
    fn approved_signed_zero_file_engine_is_ready_and_other_plugins_cannot_impersonate_it() {
        let root = unique_root();
        let mut registry = PluginRegistry::load_or_seed(root.clone()).unwrap();
        let signing_key = SigningKey::from_bytes(&[19; 32]);
        let version_root = root.join("zero.file/1.0.0");
        let index = b"<!doctype html><title>Zero File engine</title>";
        let notice = b"test-only engine notice";
        fs::create_dir_all(version_root.join("engine/licenses")).unwrap();
        fs::write(version_root.join("engine/index.html"), index).unwrap();
        fs::write(version_root.join("engine/licenses/NOTICE.txt"), notice).unwrap();

        let mut manifest = bundled_file_record().manifest;
        manifest.version = "1.0.0".into();
        manifest.permissions = vec![PluginPermission::DocumentConvert];
        manifest.first_party_engine = Some(PluginFirstPartyEngine {
            protocol_version: 1,
            package_version: "1.0.0".into(),
            host_api_range: ">=0.1.0".into(),
            directions: vec![
                PluginDocumentDirection::PdfToDocx,
                PluginDocumentDirection::DocxToPdf,
            ],
            platform_minimums: vec![PluginEnginePlatformMinimum {
                platform: PluginPlatform::Macos,
                version: "11.0".into(),
            }],
            assets: vec![
                PluginEngineAsset {
                    path: "engine/index.html".into(),
                    sha256: sha256_hex(index),
                    bytes: index.len() as u64,
                    media_type: "text/html".into(),
                },
                PluginEngineAsset {
                    path: "engine/licenses/NOTICE.txt".into(),
                    sha256: sha256_hex(notice),
                    bytes: notice.len() as u64,
                    media_type: "text/plain".into(),
                },
            ],
            notices: vec!["engine/licenses/NOTICE.txt".into()],
            signature: String::new(),
        });
        let payload = first_party_engine_signature_payload(
            &manifest,
            manifest.first_party_engine.as_ref().unwrap(),
        );
        manifest.first_party_engine.as_mut().unwrap().signature =
            BASE64_STANDARD.encode(signing_key.sign(&payload).to_bytes());
        fs::write(
            version_root.join("manifest.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let zero_file = registry
            .records
            .iter_mut()
            .find(|record| record.name == ZERO_FILE_PLUGIN_ID)
            .unwrap();
        zero_file.version = "1.0.0".into();
        zero_file.source = PluginSource::Local;
        zero_file.enabled = true;
        zero_file.health = PluginHealth::Ready;
        zero_file.manifest = manifest.clone();
        zero_file.installed_path = Some(version_root.to_string_lossy().into_owned());
        zero_file.approved_permissions = vec![PluginPermission::DocumentConvert];
        zero_file.package_sha256 = Some("ab".repeat(32));

        let engine = registry
            .active_engine_with_validator(ZERO_FILE_PLUGIN_ID, |root, manifest| {
                validate_installed_first_party_engine_with_key(
                    root,
                    manifest,
                    signing_key.verifying_key().as_bytes(),
                )
            })
            .expect("a compatible signed Zero File install should expose its engine");
        assert_eq!(engine.plugin_id, ZERO_FILE_PLUGIN_ID);
        assert_eq!(engine.package_version, "1.0.0");
        assert_eq!(engine.engine_root, version_root.join("engine"));

        let mut impostor = registry
            .records
            .iter()
            .find(|record| record.name == ZERO_FILE_PLUGIN_ID)
            .unwrap()
            .clone();
        impostor.name = "third.party.impostor".into();
        impostor.manifest.name = "third.party.impostor".into();
        impostor.manifest.id = Some("third.party.impostor".into());
        registry.records.push(impostor);
        let error = registry
            .active_engine_with_validator("third.party.impostor", |_, _| Ok(()))
            .expect_err("a different plugin identity must never receive engine trust");
        assert!(error.contains("no trusted document engine"));

        fs::remove_dir_all(root).unwrap();
    }
}
