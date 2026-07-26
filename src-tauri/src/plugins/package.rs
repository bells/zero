use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zip::ZipArchive;

use super::contracts::{PluginManifest, PluginPackageValidationReport, PluginValidationIssue};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPackageDownloadRequest {
    pub download_url: String,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPackageDownload {
    pub staged_path: PathBuf,
    pub sha256: String,
    pub bytes_len: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginPackageError {
    pub message: String,
}

pub fn download_package_with_fetcher<F, E>(
    request: &PluginPackageDownloadRequest,
    staging_dir: &Path,
    fetcher: F,
) -> Result<PluginPackageDownload, PluginPackageError>
where
    F: FnOnce(&str) -> Result<Vec<u8>, E>,
    E: std::fmt::Display,
{
    let file_name = zplugin_file_name(&request.download_url)?;
    let bytes = fetcher(&request.download_url)
        .map_err(|error| package_error(format!("failed to download package: {error}")))?;

    stage_package_bytes(staging_dir, file_name, &bytes, request.sha256.as_deref())
}

pub async fn download_package_to_staging(
    request: &PluginPackageDownloadRequest,
    staging_dir: &Path,
) -> Result<PluginPackageDownload, PluginPackageError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| package_error(format!("failed to create http client: {error}")))?;
    let response = client
        .get(&request.download_url)
        .send()
        .await
        .map_err(|error| package_error(format!("failed to download package: {error}")))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|error| package_error(format!("failed to read package bytes: {error}")))?;

    let file_name = zplugin_file_name(&request.download_url)?;
    stage_package_bytes(staging_dir, file_name, &bytes, request.sha256.as_deref())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

pub fn archive_entry_destination(
    install_root: &Path,
    entry_name: &str,
) -> Result<PathBuf, PluginPackageError> {
    let normalized_entry = normalize_archive_entry(entry_name)
        .ok_or_else(|| package_error("unsafe archive entry path"))?;

    if !is_safe_archive_entry(&normalized_entry) {
        return Err(package_error("unsafe archive entry path"));
    }

    let mut destination = install_root.to_path_buf();
    for segment in normalized_entry.split('/') {
        destination.push(segment);
    }

    Ok(destination)
}

pub fn validate_zplugin_package(
    package_path: &Path,
) -> Result<PluginPackageValidationReport, PluginPackageError> {
    let bytes = fs::read(package_path)
        .map_err(|error| package_error(format!("failed to read package: {error}")))?;
    let package_sha256 = sha256_hex(&bytes);
    let mut issues = Vec::new();

    if package_path.extension().and_then(|value| value.to_str()) != Some("zplugin") {
        issues.push(validation_issue(
            "package.extension",
            "",
            "Plugin package must use the .zplugin extension.",
        ));
    }

    let cursor = std::io::Cursor::new(bytes);
    let mut archive = match ZipArchive::new(cursor) {
        Ok(archive) => archive,
        Err(error) => {
            issues.push(validation_issue(
                "package.archive.invalid",
                "",
                format!("Package must be a readable ZIP archive: {error}"),
            ));
            return Ok(package_report(package_path, package_sha256, issues, None));
        }
    };

    let archive_entries = inspect_archive_entries(&mut archive, &mut issues)?;
    let mut manifest = read_manifest_from_archive(&mut archive, &mut issues)?;

    if let Some(manifest) = &mut manifest {
        issues.extend(validate_manifest(manifest));

        if is_safe_package_relative_path(&manifest.main)
            && !archive_entries.contains(&normalize_manifest_path(&manifest.main))
        {
            issues.push(validation_issue(
                "package.main.missing",
                "main",
                "Plugin package is missing the manifest-declared main entrypoint.",
            ));
        }

        normalize_manifest_engines(manifest);
    }

    Ok(package_report(
        package_path,
        package_sha256,
        issues,
        manifest,
    ))
}

pub fn extract_zplugin_package(
    package_path: &Path,
    destination_root: &Path,
) -> Result<PluginPackageValidationReport, PluginPackageError> {
    let report = validate_zplugin_package(package_path)?;
    if !report.valid {
        return Err(package_error(format_validation_issues(&report.issues)));
    }

    if destination_root.exists() {
        return Err(package_error("plugin install destination already exists"));
    }

    let file = fs::File::open(package_path)
        .map_err(|error| package_error(format!("failed to open package: {error}")))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| package_error(format!("failed to read package archive: {error}")))?;

    let result = extract_archive_entries(&mut archive, destination_root);
    if result.is_err() {
        let _ = fs::remove_dir_all(destination_root);
    }

    result?;
    Ok(report)
}

pub fn format_validation_issues(issues: &[PluginValidationIssue]) -> String {
    issues
        .iter()
        .map(|issue| format!("{}: {}", issue.code, issue.message))
        .collect::<Vec<_>>()
        .join("; ")
}

fn stage_package_bytes(
    staging_dir: &Path,
    file_name: &str,
    bytes: &[u8],
    expected_sha256: Option<&str>,
) -> Result<PluginPackageDownload, PluginPackageError> {
    fs::create_dir_all(staging_dir)
        .map_err(|error| package_error(format!("failed to create staging directory: {error}")))?;

    let staged_path = staging_dir.join(file_name);
    let actual_sha256 = sha256_hex(bytes);

    let result = fs::write(&staged_path, bytes)
        .map_err(|error| package_error(format!("failed to write staged package: {error}")))
        .and_then(|_| {
            if let Some(expected) = expected_sha256 {
                if !expected.eq_ignore_ascii_case(&actual_sha256) {
                    return Err(package_error(format!(
                        "package checksum mismatch: expected {expected}, got {actual_sha256}"
                    )));
                }
            }

            Ok(PluginPackageDownload {
                staged_path: staged_path.clone(),
                sha256: actual_sha256,
                bytes_len: bytes.len() as u64,
            })
        });

    if result.is_err() {
        let _ = fs::remove_dir_all(staging_dir);
    }

    result
}

fn is_safe_archive_entry(entry_name: &str) -> bool {
    if entry_name.is_empty() || entry_name.contains('\0') {
        return false;
    }

    if entry_name.starts_with('/')
        || entry_name.starts_with('\\')
        || entry_name.contains('\\')
        || entry_name.contains(':')
    {
        return false;
    }

    entry_name
        .split('/')
        .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

fn inspect_archive_entries<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    issues: &mut Vec<PluginValidationIssue>,
) -> Result<HashSet<String>, PluginPackageError> {
    let mut entries = HashSet::new();

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| package_error(format!("failed to inspect archive entry: {error}")))?;
        let raw_name = file.name().to_string();

        let Some(normalized_name) = normalize_archive_entry(&raw_name) else {
            issues.push(validation_issue(
                "package.archive.unsafePath",
                raw_name,
                "Package archive contains an unsafe entry path.",
            ));
            continue;
        };

        if !is_safe_archive_entry(&normalized_name) {
            issues.push(validation_issue(
                "package.archive.unsafePath",
                raw_name,
                "Package archive contains an unsafe entry path.",
            ));
            continue;
        }

        if is_zip_symlink(file.unix_mode()) {
            issues.push(validation_issue(
                "package.archive.symlink",
                raw_name,
                "Package archive must not contain symlinks.",
            ));
            continue;
        }

        if !file.is_dir() {
            entries.insert(normalized_name);
        }
    }

    Ok(entries)
}

fn read_manifest_from_archive<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    issues: &mut Vec<PluginValidationIssue>,
) -> Result<Option<PluginManifest>, PluginPackageError> {
    let mut manifest_file = match archive.by_name("manifest.json") {
        Ok(file) => file,
        Err(_) => {
            issues.push(validation_issue(
                "package.manifest.missing",
                "manifest.json",
                "Plugin package must contain a root manifest.json.",
            ));
            return Ok(None);
        }
    };

    let mut manifest_json = String::new();
    manifest_file
        .read_to_string(&mut manifest_json)
        .map_err(|error| package_error(format!("failed to read manifest.json: {error}")))?;

    match serde_json::from_str::<PluginManifest>(&manifest_json) {
        Ok(manifest) => Ok(Some(manifest)),
        Err(error) => {
            issues.push(validation_issue(
                "package.manifest.invalid",
                "manifest.json",
                format!("Plugin manifest is invalid: {error}"),
            ));
            Ok(None)
        }
    }
}

fn extract_archive_entries<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    destination_root: &Path,
) -> Result<(), PluginPackageError> {
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| package_error(format!("failed to read archive entry: {error}")))?;

        if is_zip_symlink(file.unix_mode()) {
            return Err(package_error("package archive contains an unsafe symlink"));
        }

        let destination = archive_entry_destination(destination_root, file.name())?;

        if file.is_dir() {
            fs::create_dir_all(&destination).map_err(|error| {
                package_error(format!("failed to create plugin directory: {error}"))
            })?;
            continue;
        }

        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                package_error(format!("failed to create plugin directory: {error}"))
            })?;
        }

        let mut output = fs::File::create(&destination)
            .map_err(|error| package_error(format!("failed to create plugin file: {error}")))?;
        std::io::copy(&mut file, &mut output)
            .map_err(|error| package_error(format!("failed to extract plugin file: {error}")))?;
    }

    Ok(())
}

fn validate_manifest(manifest: &PluginManifest) -> Vec<PluginValidationIssue> {
    let mut issues = Vec::new();

    if !is_valid_plugin_name(&manifest.name) {
        issues.push(validation_issue(
            "manifest.name.invalid",
            "name",
            "Plugin name must use lowercase letters, numbers, dots, underscores, or dashes.",
        ));
    }

    if !is_semver(&manifest.version) {
        issues.push(validation_issue(
            "manifest.version.invalid",
            "version",
            "Plugin version must be a semantic version.",
        ));
    }

    if !is_safe_package_relative_path(&manifest.main) {
        issues.push(validation_issue(
            "manifest.main.unsafe",
            "main",
            "Plugin main must be a safe package-relative path.",
        ));
    }

    if let Some(engines) = &manifest.engines {
        if engines.api.as_deref().is_some_and(|api| api != "1") {
            issues.push(validation_issue(
                "manifest.api.incompatible",
                "engines.api",
                "Plugin targets an unsupported Extension API version.",
            ));
        }

        let (host_range, host_path, issue_code) = if let Some(zero) = engines.zero.as_deref() {
            (Some(zero), "engines.zero", "manifest.zero.incompatible")
        } else {
            (
                engines.ztool.as_deref(),
                "engines.ztool",
                "manifest.ztool.incompatible",
            )
        };

        if host_range.is_some_and(|range| !is_compatible_zero_host_range(range)) {
            issues.push(validation_issue(
                issue_code,
                host_path,
                "Plugin targets an unsupported Zero host version.",
            ));
        }
    }

    issues
}

fn normalize_archive_entry(entry_name: &str) -> Option<String> {
    let normalized = entry_name.trim_end_matches('/');
    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

fn normalize_manifest_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn is_safe_package_relative_path(value: &str) -> bool {
    if value.is_empty() || value.trim() != value || value.contains('\0') {
        return false;
    }

    if value.starts_with('/')
        || value.starts_with('\\')
        || value.contains(':')
        || value.contains('\\')
    {
        return false;
    }

    value
        .split('/')
        .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

fn is_valid_plugin_name(value: &str) -> bool {
    let length_ok = (2..=64).contains(&value.len());
    length_ok
        && value
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        && value.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '.'
                || character == '_'
                || character == '-'
        })
}

fn is_semver(value: &str) -> bool {
    let core = value
        .split_once('-')
        .map(|(core, _)| core)
        .unwrap_or(value)
        .split_once('+')
        .map(|(core, _)| core)
        .unwrap_or(value);
    let parts = core.split('.').collect::<Vec<_>>();

    parts.len() == 3
        && parts.iter().all(|part| {
            !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
        })
}

fn normalize_manifest_engines(manifest: &mut PluginManifest) {
    if let Some(engines) = &mut manifest.engines {
        if engines.zero.is_none() {
            engines.zero = engines.ztool.take();
        } else {
            engines.ztool = None;
        }
    }
}

fn is_compatible_zero_host_range(value: &str) -> bool {
    value == "*"
        || value == env!("CARGO_PKG_VERSION")
        || value == format!("^{}", env!("CARGO_PKG_VERSION"))
        || value == format!(">={}", env!("CARGO_PKG_VERSION"))
}

fn is_zip_symlink(mode: Option<u32>) -> bool {
    mode.is_some_and(|mode| mode & 0o170000 == 0o120000)
}

fn package_report(
    package_path: &Path,
    sha256: String,
    issues: Vec<PluginValidationIssue>,
    manifest: Option<PluginManifest>,
) -> PluginPackageValidationReport {
    PluginPackageValidationReport {
        valid: issues.is_empty(),
        issues,
        manifest,
        package_path: package_path.to_string_lossy().into_owned(),
        sha256,
    }
}

fn validation_issue(
    code: impl Into<String>,
    path: impl Into<String>,
    message: impl Into<String>,
) -> PluginValidationIssue {
    PluginValidationIssue {
        code: code.into(),
        path: path.into(),
        message: message.into(),
    }
}

fn zplugin_file_name(download_url: &str) -> Result<&str, PluginPackageError> {
    let file_name = download_url
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| package_error("download URL must include a .zplugin file name"))?;

    if !file_name.ends_with(".zplugin") {
        return Err(package_error("download URL must point to a .zplugin asset"));
    }

    Ok(file_name)
}

fn package_error(message: impl Into<String>) -> PluginPackageError {
    PluginPackageError {
        message: message.into(),
    }
}
