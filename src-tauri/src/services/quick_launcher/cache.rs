use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::model::{current_platform_key, IndexedItem, UsageMap};

const CACHE_SCHEMA_VERSION: u16 = 1;
const USAGE_SCHEMA_VERSION: u16 = 1;
const MAX_USAGE_RECORDS: usize = 1_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexCacheFile {
    schema_version: u16,
    platform: String,
    updated_at: u64,
    items: Vec<IndexedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageCacheFile {
    schema_version: u16,
    records: UsageMap,
}

pub fn default_root() -> PathBuf {
    crate::brand::canonical_data_root(&crate::brand::default_home())
        .join("data")
        .join("quick-launcher")
}

pub fn load_index(root: &Path) -> Result<Option<(Vec<IndexedItem>, u64)>, String> {
    cleanup_partial_files(root)?;
    let path = root.join("apps_cache.json");
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read launcher index cache: {error}"))?;
    let cache = serde_json::from_str::<IndexCacheFile>(&contents)
        .map_err(|error| format!("failed to parse launcher index cache: {error}"))?;
    if cache.schema_version != CACHE_SCHEMA_VERSION {
        return Err(format!(
            "unsupported launcher index schema {}",
            cache.schema_version
        ));
    }
    if cache.platform != current_platform_key() {
        return Err(format!(
            "launcher index platform {} does not match {}",
            cache.platform,
            current_platform_key()
        ));
    }
    if cache.items.iter().any(|item| item.id.is_empty()) {
        return Err("launcher index contains an empty item identity".into());
    }
    Ok(Some((cache.items, cache.updated_at)))
}

pub fn save_index(root: &Path, items: &[IndexedItem], updated_at: u64) -> Result<(), String> {
    let cache = IndexCacheFile {
        schema_version: CACHE_SCHEMA_VERSION,
        platform: current_platform_key().into(),
        updated_at,
        items: items.to_vec(),
    };
    write_json_atomic(root, "apps_cache.json", &cache)
}

pub fn load_usage(root: &Path) -> Result<UsageMap, String> {
    cleanup_partial_files(root)?;
    let path = root.join("usage.json");
    if !path.exists() {
        return Ok(UsageMap::new());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read launcher usage cache: {error}"))?;
    let cache = serde_json::from_str::<UsageCacheFile>(&contents)
        .map_err(|error| format!("failed to parse launcher usage cache: {error}"))?;
    if cache.schema_version != USAGE_SCHEMA_VERSION {
        return Err(format!(
            "unsupported launcher usage schema {}",
            cache.schema_version
        ));
    }
    Ok(cache.records)
}

pub fn record_successful_use(
    root: &Path,
    usage: &mut UsageMap,
    item_id: &str,
    activated_at: u64,
) -> Result<u64, String> {
    let entry = usage.entry(item_id.to_string()).or_default();
    entry.count = entry.count.saturating_add(1);
    entry.last_used_at = activated_at;
    trim_usage(usage);
    let count = usage.get(item_id).map(|entry| entry.count).unwrap_or(1);
    save_usage(root, usage)?;
    Ok(count)
}

pub fn save_usage(root: &Path, usage: &UsageMap) -> Result<(), String> {
    let cache = UsageCacheFile {
        schema_version: USAGE_SCHEMA_VERSION,
        records: usage.clone(),
    };
    write_json_atomic(root, "usage.json", &cache)
}

fn trim_usage(usage: &mut UsageMap) {
    if usage.len() <= MAX_USAGE_RECORDS {
        return;
    }
    let mut records = usage
        .iter()
        .map(|(id, entry)| (id.clone(), entry.last_used_at))
        .collect::<Vec<_>>();
    records.sort_by_key(|(_, last_used_at)| *last_used_at);
    for (id, _) in records.into_iter().take(usage.len() - MAX_USAGE_RECORDS) {
        usage.remove(&id);
    }
}

fn write_json_atomic<T: Serialize>(root: &Path, file_name: &str, value: &T) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("failed to create launcher data directory: {error}"))?;
    let destination = root.join(file_name);
    let temporary = root.join(format!(".{file_name}.{}.part", std::process::id()));
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("failed to serialize launcher data: {error}"))?;
    let result = (|| -> Result<(), String> {
        let mut file = File::create(&temporary)
            .map_err(|error| format!("failed to create launcher staging file: {error}"))?;
        file.write_all(&bytes)
            .map_err(|error| format!("failed to write launcher staging file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("failed to flush launcher staging file: {error}"))?;
        replace_file(&temporary, &destination)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn cleanup_partial_files(root: &Path) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(root)
        .map_err(|error| format!("failed to inspect launcher data directory: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("failed to inspect launcher data entry: {error}"))?;
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if file_name.starts_with('.') && file_name.ends_with(".part") {
            fs::remove_file(entry.path()).map_err(|error| {
                format!("failed to remove stale launcher staging file: {error}")
            })?;
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_file(temporary: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(temporary, destination)
        .map_err(|error| format!("failed to atomically replace launcher data: {error}"))
}

#[cfg(target_os = "windows")]
fn replace_file(temporary: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let moved = unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(format!(
            "failed to atomically replace launcher data: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::quick_launcher::contracts::{
        QuickLauncherItemKind, QuickLauncherRunningState,
    };
    use crate::services::quick_launcher::model::{
        stable_item_id, IndexedItem, LaunchTarget, SearchFields, UsageEntry,
    };

    fn temporary_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "zero-quick-launcher-{name}-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ))
    }

    fn indexed_item(identity: &str) -> IndexedItem {
        IndexedItem {
            id: stable_item_id(
                current_platform_key(),
                QuickLauncherItemKind::Application,
                identity,
            ),
            kind: QuickLauncherItemKind::Application,
            title: identity.into(),
            subtitle: format!("/{identity}.app"),
            search: SearchFields::default(),
            target: LaunchTarget::Application {
                path: identity.into(),
                bundle_id: None,
                executable_path: None,
            },
            icon_source: None,
            icon_key: None,
            source_modified_at: Some(1),
            running: QuickLauncherRunningState::Running,
        }
    }

    #[test]
    fn valid_index_round_trips_without_persisting_running_state() {
        let root = temporary_root("index");
        save_index(&root, &[indexed_item("Example")], 44).unwrap();
        let (items, updated_at) = load_index(&root).unwrap().unwrap();
        assert_eq!(updated_at, 44);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].running, QuickLauncherRunningState::Unknown);
        assert!(!fs::read_to_string(root.join("apps_cache.json"))
            .unwrap()
            .contains("running"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cross_platform_and_incompatible_index_files_are_rejected() {
        let root = temporary_root("platform");
        fs::create_dir_all(&root).unwrap();
        let wrong_platform = if current_platform_key() == "macos" {
            "windows"
        } else {
            "macos"
        };
        fs::write(
            root.join("apps_cache.json"),
            serde_json::to_vec(&serde_json::json!({
                "schemaVersion": CACHE_SCHEMA_VERSION,
                "platform": wrong_platform,
                "updatedAt": 1,
                "items": []
            }))
            .unwrap(),
        )
        .unwrap();
        assert!(load_index(&root).unwrap_err().contains("does not match"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn atomic_index_replacement_publishes_only_the_latest_revision() {
        let root = temporary_root("replace");
        save_index(&root, &[indexed_item("First")], 1).unwrap();
        save_index(&root, &[indexed_item("Second")], 2).unwrap();
        let (items, updated_at) = load_index(&root).unwrap().unwrap();
        assert_eq!(updated_at, 2);
        assert_eq!(items[0].title, "Second");
        assert!(!fs::read_dir(&root)
            .unwrap()
            .flatten()
            .any(|entry| { entry.file_name().to_string_lossy().ends_with(".part") }));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn usage_is_success_based_and_never_stores_queries() {
        let root = temporary_root("usage");
        let mut usage = UsageMap::new();
        let count = record_successful_use(&root, &mut usage, "app:test:1", 42).unwrap();
        assert_eq!(count, 1);
        let disk = fs::read_to_string(root.join("usage.json")).unwrap();
        assert!(disk.contains("app:test:1"));
        assert!(!disk.contains("query"));
        assert_eq!(
            load_usage(&root).unwrap()["app:test:1"],
            UsageEntry {
                count: 1,
                last_used_at: 42
            }
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn corrupt_usage_does_not_modify_existing_file() {
        let root = temporary_root("corrupt");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("usage.json"), "not-json").unwrap();
        assert!(load_usage(&root).is_err());
        assert_eq!(
            fs::read_to_string(root.join("usage.json")).unwrap(),
            "not-json"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stale_partial_files_are_cleaned() {
        let root = temporary_root("partial");
        fs::create_dir_all(&root).unwrap();
        let partial = root.join(".apps_cache.json.1.part");
        fs::write(&partial, "partial").unwrap();
        assert_eq!(load_index(&root).unwrap(), None);
        assert!(!partial.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn usage_retention_keeps_the_most_recent_bounded_records() {
        let root = temporary_root("retention");
        let mut usage = UsageMap::new();
        for index in 0..=MAX_USAGE_RECORDS {
            usage.insert(
                format!("app:test:{index}"),
                UsageEntry {
                    count: 1,
                    last_used_at: index as u64,
                },
            );
        }
        record_successful_use(&root, &mut usage, "app:test:new", 10_000).unwrap();
        assert_eq!(usage.len(), MAX_USAGE_RECORDS);
        assert!(usage.contains_key("app:test:new"));
        assert!(!usage.contains_key("app:test:0"));
        let _ = fs::remove_dir_all(root);
    }
}
