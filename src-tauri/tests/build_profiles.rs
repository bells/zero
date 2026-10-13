use std::fs;
use zero_lib::plugins::contracts::{PluginHealth, PluginManifest, PluginRecord, PluginSource};
use zero_lib::plugins::registry::PluginRegistry;

static ROOT_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn root() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "zero-profile-{}-{}-{}",
        std::process::id(),
        ROOT_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    root
}

#[test]
fn clean_profile_seeds_only_compiled_tools() {
    let root = root();
    let registry = PluginRegistry::load_or_seed(&root).unwrap();
    let expected =
        usize::from(cfg!(feature = "bundled-tools")) * 4 + usize::from(cfg!(feature = "file-tool"));
    assert_eq!(registry.records().len(), expected);
    registry.save().unwrap();
    assert_eq!(
        PluginRegistry::load_or_seed(&root).unwrap().records().len(),
        expected
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn repeated_saves_commit_revisions_without_leaving_staging_files() {
    let root = root();
    let registry = PluginRegistry::load_or_seed(&root).unwrap();
    let initial_revision = registry.revision();
    for offset in 1..=3 {
        registry.save().unwrap();
        let reloaded = PluginRegistry::load_or_seed(&root).unwrap();
        assert!(!reloaded.startup_write_performed());
        assert_eq!(reloaded.revision(), initial_revision + offset);
        assert_eq!(reloaded.records(), registry.records());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    }
    fs::remove_dir_all(root).unwrap();
}

#[cfg(windows)]
#[test]
fn locked_registry_save_preserves_committed_state_and_recovers_after_unlock() {
    use std::os::windows::fs::OpenOptionsExt;

    let root = root();
    let registry = PluginRegistry::load_or_seed(&root).unwrap();
    let path = root.join("registry.json");
    let committed = fs::read(&path).unwrap();
    let revision = registry.revision();
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&path)
        .unwrap();

    assert!(registry.save().is_err());
    assert_eq!(registry.revision(), revision);
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    drop(lock);
    assert_eq!(fs::read(&path).unwrap(), committed);

    registry.save().unwrap();
    let reloaded = PluginRegistry::load_or_seed(&root).unwrap();
    assert_eq!(reloaded.revision(), revision + 1);
    assert_eq!(reloaded.records(), registry.records());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn switching_profiles_preserves_excluded_records_and_disabled_state_on_disk() {
    let root = root();
    let records: Vec<PluginRecord> = [
        "screenshot",
        "caffeine",
        "bingWallpaper",
        "quickLauncher",
        "file",
    ]
    .into_iter()
    .map(|name| {
        let metadata = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(format!("../src/plugins/{name}/metadata.json"));
        let manifest: PluginManifest =
            serde_json::from_slice(&fs::read(metadata).unwrap()).unwrap();
        PluginRecord {
            protocol_manifest: None,
            name: manifest.name.clone(),
            version: manifest.version.clone(),
            author: manifest.author.clone(),
            source: PluginSource::Bundled,
            enabled: false,
            health: PluginHealth::Disabled,
            approved_permissions: manifest.permissions.clone(),
            manifest,
            installed_path: None,
            package_sha256: None,
        }
    })
    .collect();
    let disk = serde_json::json!({ "schemaVersion": 6, "revision": 42, "records": records });
    fs::write(
        root.join("registry.json"),
        serde_json::to_vec(&disk).unwrap(),
    )
    .unwrap();
    let registry = PluginRegistry::load_or_seed(&root).unwrap();
    assert!(registry.records().iter().all(|record| !record.enabled));
    assert_eq!(
        registry.records().len(),
        usize::from(cfg!(feature = "bundled-tools")) * 4 + usize::from(cfg!(feature = "file-tool"))
    );
    registry.save().unwrap();
    let saved: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("registry.json")).unwrap()).unwrap();
    let saved = saved["records"].as_array().unwrap();
    assert_eq!(saved.len(), 5);
    assert!(saved.iter().all(|record| record["enabled"] == false));
    assert_eq!(
        PluginRegistry::load_or_seed(&root).unwrap().records().len(),
        registry.records().len()
    );
    fs::remove_dir_all(root).unwrap();
}
