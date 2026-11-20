use super::*;
use image::{DynamicImage, ImageFormat, RgbImage};
use std::{
    fs,
    io::Cursor,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let path = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "zero-wallpaper-effects-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn owner() -> SessionOwner {
    SessionOwner {
        plugin_id: "test.wallpaper".into(),
        version: "1.0.0".into(),
        digest: "a".repeat(64),
        root: std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join("zero-wallpaper-plugin"),
        view_id: "main".into(),
        revision: 1,
        permissions: vec![],
    }
}
fn image(cache: &mut ImageCache, seed: u8) -> String {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 6, image::Rgb([seed, 2, 3])))
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    cache.store(bytes.get_ref(), "image/png").unwrap().asset_id
}
struct Setter {
    calls: Mutex<Vec<PathBuf>>,
    state: PathBuf,
}
impl WallpaperSetter for Setter {
    fn set_from_path(&self, path: &Path) -> Result<(), NativeResourceError> {
        let state: serde_json::Value =
            serde_json::from_slice(&fs::read(&self.state).unwrap()).unwrap();
        assert_eq!(state["active"]["phase"], "applying");
        assert!(path.is_file());
        self.calls.lock().unwrap().push(path.into());
        Ok(())
    }
}
#[test]
fn prepare_is_durable_before_effect_and_latest_receipt_deduplicates_after_reopen() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let asset = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let prepared = effects.prepare(&owner, &cache, &asset).unwrap();
    assert_eq!(prepared.intent_id.len(), 64);
    assert_eq!(prepared.generation, 1);
    let state_path = temp.0.join("wallpaper-effects-v1/state.json");
    let state: serde_json::Value = serde_json::from_slice(&fs::read(&state_path).unwrap()).unwrap();
    assert_eq!(state["active"]["phase"], "prepared");
    assert_eq!(state["active"]["intentId"], prepared.intent_id);
    assert_eq!(effects.prepare(&owner, &cache, &asset).unwrap(), prepared);
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: state_path,
    };
    assert_eq!(
        effects.apply(&owner, &prepared.intent_id, &setter).unwrap(),
        ApplyOutcome::Applied
    );
    drop(effects);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    assert_eq!(
        effects.apply(&owner, &prepared.intent_id, &setter).unwrap(),
        ApplyOutcome::AlreadyApplied
    );
    assert_eq!(setter.calls.lock().unwrap().len(), 1);
    assert!(setter.calls.lock().unwrap()[0].starts_with(temp.0.join("wallpaper-effects-v1")));
}
#[test]
fn conflicting_prepare_requires_cancel_and_old_tokens_never_become_work() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let b = image(&mut cache, 2);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let first = effects.prepare(&owner, &cache, &a).unwrap();
    assert_eq!(
        effects.prepare(&owner, &cache, &b).unwrap_err().code,
        "wallpaper.prepared_conflict"
    );
    effects.cancel(&owner, &first.intent_id).unwrap();
    let second = effects.prepare(&owner, &cache, &b).unwrap();
    assert_eq!(second.generation, 2);
    assert_ne!(first.intent_id, second.intent_id);
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: temp.0.join("wallpaper-effects-v1/state.json"),
    };
    for token in [&first.intent_id, "forged"] {
        assert_eq!(
            effects.apply(&owner, token, &setter).unwrap_err().code,
            "wallpaper.stale"
        );
    }
    effects.apply(&owner, &second.intent_id, &setter).unwrap();
    let third = effects.prepare(&owner, &cache, &a).unwrap();
    effects.apply(&owner, &third.intent_id, &setter).unwrap();
    assert_eq!(
        effects
            .apply(&owner, &second.intent_id, &setter)
            .unwrap_err()
            .code,
        "wallpaper.stale"
    );
    assert_eq!(setter.calls.lock().unwrap().len(), 2);
}
struct FailingSetter;
impl WallpaperSetter for FailingSetter {
    fn set_from_path(&self, _: &Path) -> Result<(), NativeResourceError> {
        Err(super::super::native_resources::resource_error(
            "system.setWallpaper",
            "backend.private",
            "private backend path",
            true,
        ))
    }
}
#[test]
fn native_error_is_uncertain_and_three_pins_survive_deliberate_recovery() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let b = image(&mut cache, 2);
    let c = image(&mut cache, 3);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: temp.0.join("wallpaper-effects-v1/state.json"),
    };
    let first = effects.prepare(&owner, &cache, &a).unwrap();
    effects.apply(&owner, &first.intent_id, &setter).unwrap();
    let applied_path = setter.calls.lock().unwrap()[0].clone();
    let applied_bytes = fs::read(&applied_path).unwrap();
    let second = effects.prepare(&owner, &cache, &b).unwrap();
    let candidate = effects
        .state
        .lock()
        .unwrap()
        .slots
        .iter()
        .flatten()
        .find(|s| s.asset_id == b)
        .unwrap()
        .clone();
    let candidate_path = effects.slot_path(1, &candidate);
    let candidate_bytes = fs::read(&candidate_path).unwrap();
    let error = effects
        .apply(&owner, &second.intent_id, &FailingSetter)
        .unwrap_err();
    assert_eq!(error.code, "wallpaper.uncertain");
    assert!(!error.message.contains("private"));
    assert!(!error.retryable);
    assert_eq!(
        effects.cancel(&owner, &second.intent_id).unwrap_err().code,
        "wallpaper.uncertain"
    );
    drop(effects);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    assert_eq!(
        effects
            .apply(&owner, &second.intent_id, &setter)
            .unwrap_err()
            .code,
        "wallpaper.uncertain"
    );
    assert_eq!(
        effects.prepare(&owner, &cache, &c).unwrap_err().code,
        "wallpaper.uncertain"
    );
    effects.recover(&owner).unwrap();
    let third = effects.prepare(&owner, &cache, &c).unwrap();
    assert_eq!(fs::read(&applied_path).unwrap(), applied_bytes);
    assert_eq!(fs::read(&candidate_path).unwrap(), candidate_bytes);
    effects.apply(&owner, &third.intent_id, &setter).unwrap();
    assert_eq!(setter.calls.lock().unwrap().len(), 2);
}
#[test]
fn changed_installation_cannot_use_old_tokens_or_erase_unresolved_safety() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let first = effects.prepare(&owner, &cache, &a).unwrap();
    drop(effects);
    let mut replacement = owner.clone();
    replacement.version = "2.0.0".into();
    replacement.digest = "b".repeat(64);
    replacement.root.set_file_name("zero-wallpaper-replacement");
    let effects = WallpaperEffects::open(&replacement, &temp.0).unwrap();
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: temp.0.join("wallpaper-effects-v1/state.json"),
    };
    assert_eq!(
        effects
            .apply(&replacement, &first.intent_id, &setter)
            .unwrap_err()
            .code,
        "wallpaper.stale"
    );
    assert_eq!(
        effects
            .cancel(&replacement, &first.intent_id)
            .unwrap_err()
            .code,
        "wallpaper.stale"
    );
    assert_eq!(
        effects.prepare(&replacement, &cache, &a).unwrap_err().code,
        "wallpaper.owner_pending"
    );
    effects.recover(&replacement).unwrap();
    let replacement_cache = ImageCache::open(&replacement, &temp.0).unwrap();
    let second = effects
        .prepare(&replacement, &replacement_cache, &a)
        .unwrap();
    assert_eq!(second.generation, 2);
    assert_eq!(
        effects.prepare(&replacement, &cache, &a).unwrap_err().code,
        "image.owner"
    );
    assert!(setter.calls.lock().unwrap().is_empty());
}
#[test]
fn applying_publication_failure_prevents_effect_and_keeps_prepared_token() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let intent = effects.prepare(&owner, &cache, &a).unwrap();
    let state = temp.0.join("wallpaper-effects-v1/state.json");
    let backup = temp.0.join("state-backup");
    fs::rename(&state, &backup).unwrap();
    fs::create_dir(&state).unwrap();
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: state.clone(),
    };
    assert!(effects.apply(&owner, &intent.intent_id, &setter).is_err());
    assert!(setter.calls.lock().unwrap().is_empty());
    fs::remove_dir(&state).unwrap();
    fs::rename(&backup, &state).unwrap();
    assert_eq!(
        effects.apply(&owner, &intent.intent_id, &setter).unwrap(),
        ApplyOutcome::Applied
    );
}
struct SabotageSetter {
    state: PathBuf,
    backup: PathBuf,
}
impl WallpaperSetter for SabotageSetter {
    fn set_from_path(&self, _: &Path) -> Result<(), NativeResourceError> {
        fs::rename(&self.state, &self.backup).unwrap();
        fs::create_dir(&self.state).unwrap();
        Ok(())
    }
}
#[test]
fn unpersisted_native_success_is_uncertain_in_memory_and_after_reopen() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let intent = effects.prepare(&owner, &cache, &a).unwrap();
    let state = temp.0.join("wallpaper-effects-v1/state.json");
    let backup = temp.0.join("state-backup");
    let setter = SabotageSetter {
        state: state.clone(),
        backup: backup.clone(),
    };
    assert_eq!(
        effects
            .apply(&owner, &intent.intent_id, &setter)
            .unwrap_err()
            .code,
        "wallpaper.uncertain"
    );
    let safe_setter = Setter {
        calls: Mutex::new(vec![]),
        state: state.clone(),
    };
    assert_eq!(
        effects
            .apply(&owner, &intent.intent_id, &safe_setter)
            .unwrap_err()
            .code,
        "wallpaper.uncertain"
    );
    fs::remove_dir(&state).unwrap();
    fs::rename(&backup, &state).unwrap();
    drop(effects);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let stored: serde_json::Value = serde_json::from_slice(&fs::read(&state).unwrap()).unwrap();
    assert_eq!(stored["active"]["phase"], "uncertain");
    assert_eq!(
        effects
            .apply(&owner, &intent.intent_id, &safe_setter)
            .unwrap_err()
            .code,
        "wallpaper.uncertain"
    );
    assert!(safe_setter.calls.lock().unwrap().is_empty());
}
#[test]
fn failed_preparation_preserves_previous_state_and_only_cleans_its_new_file() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let state = temp.0.join("wallpaper-effects-v1/state.json");
    let backup = temp.0.join("state-backup");
    let previous = fs::read(&state).unwrap();
    fs::rename(&state, &backup).unwrap();
    fs::create_dir(&state).unwrap();
    assert!(effects.prepare(&owner, &cache, &a).is_err());
    fs::remove_dir(&state).unwrap();
    fs::rename(&backup, &state).unwrap();
    assert_eq!(fs::read(&state).unwrap(), previous);
    assert_eq!(fs::read_dir(state.parent().unwrap()).unwrap().count(), 2);
    assert_eq!(effects.prepare(&owner, &cache, &a).unwrap().generation, 1);
}
#[test]
fn corrupted_markers_foreign_orphans_and_unsupported_state_fail_without_rewrites() {
    for mutation in ["foreign", "schema", "hash", "unknown"] {
        let temp = Temp::new();
        let owner = owner();
        let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
        let a = image(&mut cache, 1);
        let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
        effects.prepare(&owner, &cache, &a).unwrap();
        drop(effects);
        let root = temp.0.join("wallpaper-effects-v1");
        let state = root.join("state.json");
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&state).unwrap()).unwrap();
        match mutation {
            "foreign" => fs::write(root.join("slot-2-unowned.png"), b"private bytes").unwrap(),
            "schema" => {
                value["schema"] = 2.into();
                fs::write(&state, serde_json::to_vec(&value).unwrap()).unwrap();
            }
            "hash" => {
                let path = fs::read_dir(&root)
                    .unwrap()
                    .map(|e| e.unwrap().path())
                    .find(|p| p.extension().is_some_and(|e| e == "png"))
                    .unwrap();
                fs::write(path, b"damaged").unwrap();
            }
            _ => {
                value["unknown"] = true.into();
                fs::write(&state, serde_json::to_vec(&value).unwrap()).unwrap();
            }
        }
        let before = fs::read(&state).unwrap();
        assert!(
            WallpaperEffects::open(&owner, &temp.0).is_err(),
            "{mutation}"
        );
        assert_eq!(fs::read(&state).unwrap(), before);
        if mutation == "foreign" {
            assert_eq!(
                fs::read(root.join("slot-2-unowned.png")).unwrap(),
                b"private bytes"
            );
        }
    }
}
#[cfg(unix)]
#[test]
fn symlinked_slot_is_preserved_and_never_applied() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let intent = effects.prepare(&owner, &cache, &a).unwrap();
    let root = temp.0.join("wallpaper-effects-v1");
    let path = fs::read_dir(&root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| p.extension().is_some_and(|e| e == "png"))
        .unwrap();
    let target = temp.0.join("user-image");
    fs::rename(&path, &target).unwrap();
    std::os::unix::fs::symlink(&target, &path).unwrap();
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: root.join("state.json"),
    };
    assert!(effects.apply(&owner, &intent.intent_id, &setter).is_err());
    assert!(setter.calls.lock().unwrap().is_empty());
    assert!(path.is_symlink());
    assert!(target.exists());
    drop(effects);
    assert!(WallpaperEffects::open(&owner, &temp.0).is_err());
}
#[test]
fn crash_child() {
    let Some(root) = std::env::var_os("ZERO_EFFECT_TEST_CHILD_ROOT") else {
        return;
    };
    struct ExitSetter;
    impl WallpaperSetter for ExitSetter {
        fn set_from_path(&self, _: &Path) -> Result<(), NativeResourceError> {
            std::process::exit(91)
        }
    }
    let root = PathBuf::from(root);
    let owner = owner();
    let cache = ImageCache::open(&owner, &root).unwrap();
    let state: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("wallpaper-effects-v1/state.json")).unwrap())
            .unwrap();
    let asset = state["slots"][0]["assetId"].as_str().unwrap();
    let effects = WallpaperEffects::open(&owner, &root).unwrap();
    let intent = effects.prepare(&owner, &cache, asset).unwrap();
    let _ = effects.apply(&owner, &intent.intent_id, &ExitSetter);
}
#[test]
fn process_exit_inside_native_call_reopens_uncertain_without_replay() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let intent = effects.prepare(&owner, &cache, &a).unwrap();
    drop(effects);
    let child = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "services::wallpaper_effects::tests::crash_child",
            "--nocapture",
        ])
        .env("ZERO_EFFECT_TEST_CHILD_ROOT", &temp.0)
        .output()
        .unwrap();
    assert_eq!(
        child.status.code(),
        Some(91),
        "{}",
        String::from_utf8_lossy(&child.stdout)
    );
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: temp.0.join("wallpaper-effects-v1/state.json"),
    };
    assert_eq!(
        effects
            .apply(&owner, &intent.intent_id, &setter)
            .unwrap_err()
            .code,
        "wallpaper.uncertain"
    );
    assert!(setter.calls.lock().unwrap().is_empty());
}
#[test]
fn lifetime_lock_rejects_second_store_and_releases_without_deleting_pins() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let intent = effects.prepare(&owner, &cache, &a).unwrap();
    assert!(WallpaperEffects::open(&owner, &temp.0).is_err());
    drop(effects);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    assert_eq!(effects.prepare(&owner, &cache, &a).unwrap(), intent);
}
#[test]
fn orphan_blocks_further_writes_and_generation_overflow_preserves_state() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let root = temp.0.join("wallpaper-effects-v1");
    fs::write(root.join(".interrupted.part"), b"unowned").unwrap();
    let before = fs::read(root.join("state.json")).unwrap();
    assert!(effects.prepare(&owner, &cache, &a).is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 3);
    assert_eq!(fs::read(root.join("state.json")).unwrap(), before);
    fs::remove_file(root.join(".interrupted.part")).unwrap();
    drop(effects);
    let mut value: serde_json::Value = serde_json::from_slice(&before).unwrap();
    value["generation"] = 9_007_199_254_740_991_u64.into();
    fs::write(root.join("state.json"), serde_json::to_vec(&value).unwrap()).unwrap();
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let before = fs::read(root.join("state.json")).unwrap();
    assert!(effects.prepare(&owner, &cache, &a).is_err());
    assert_eq!(fs::read(root.join("state.json")).unwrap(), before);
}
struct RejectPublication {
    saw_staged_image: Mutex<bool>,
}
impl StatePublication for RejectPublication {
    fn replace(&self, source: &Path, target: &Path) -> std::io::Result<()> {
        let value: serde_json::Value = serde_json::from_slice(&fs::read(source)?).unwrap();
        let slot = value["active"]["slot"].as_u64().unwrap();
        let id = value["slots"][slot as usize]["assetId"].as_str().unwrap();
        *self.saw_staged_image.lock().unwrap() = target
            .parent()
            .unwrap()
            .join(format!("slot-{slot}-{id}.png"))
            .is_file();
        Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "injected atomic replacement rejection",
        ))
    }
}
#[test]
fn rejected_atomic_publication_cleans_only_staged_owned_bytes_and_keeps_disk_and_memory() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let b = image(&mut cache, 2);
    let mut effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let intent = effects.prepare(&owner, &cache, &a).unwrap();
    effects.cancel(&owner, &intent.intent_id).unwrap();
    let root = temp.0.join("wallpaper-effects-v1");
    let before = fs::read(root.join("state.json")).unwrap();
    let original = root.join(format!("slot-0-{a}.png"));
    let original_bytes = fs::read(&original).unwrap();
    let fault = Arc::new(RejectPublication {
        saw_staged_image: Mutex::new(false),
    });
    effects.publication = fault.clone();
    assert!(effects.prepare(&owner, &cache, &b).is_err());
    assert!(*fault.saw_staged_image.lock().unwrap());
    assert_eq!(fs::read(root.join("state.json")).unwrap(), before);
    assert_eq!(fs::read(&original).unwrap(), original_bytes);
    assert_eq!(fs::read_dir(&root).unwrap().count(), 3);
    effects.publication = Arc::new(AtomicPublication);
    assert_eq!(effects.prepare(&owner, &cache, &b).unwrap().generation, 2);
}
#[test]
fn panicking_native_adapter_leaves_typed_uncertainty_without_poisoning_store() {
    struct PanicSetter;
    impl WallpaperSetter for PanicSetter {
        fn set_from_path(&self, _: &Path) -> Result<(), NativeResourceError> {
            panic!("synthetic native panic")
        }
    }
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let intent = effects.prepare(&owner, &cache, &a).unwrap();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        effects.apply(&owner, &intent.intent_id, &PanicSetter)
    }));
    assert!(result.is_ok());
    assert_eq!(result.unwrap().unwrap_err().code, "wallpaper.uncertain");
    assert_eq!(
        effects.cancel(&owner, &intent.intent_id).unwrap_err().code,
        "wallpaper.uncertain"
    );
    effects.recover(&owner).unwrap();
}
#[test]
fn nonempty_reserved_lock_is_foreign_and_preserved() {
    let temp = Temp::new();
    let owner = owner();
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    drop(effects);
    let lock = temp.0.join("wallpaper-effects-v1/.lock");
    fs::write(&lock, b"foreign file").unwrap();
    assert!(WallpaperEffects::open(&owner, &temp.0).is_err());
    assert_eq!(fs::read(lock).unwrap(), b"foreign file");
}
#[test]
fn two_uncertain_candidates_and_previous_applied_image_exhaust_slots_without_overwrite() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let a = image(&mut cache, 1);
    let b = image(&mut cache, 2);
    let c = image(&mut cache, 3);
    let d = image(&mut cache, 4);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: temp.0.join("wallpaper-effects-v1/state.json"),
    };
    let first = effects.prepare(&owner, &cache, &a).unwrap();
    effects.apply(&owner, &first.intent_id, &setter).unwrap();
    for asset in [&b, &c] {
        let intent = effects.prepare(&owner, &cache, asset).unwrap();
        assert_eq!(
            effects
                .apply(&owner, &intent.intent_id, &FailingSetter)
                .unwrap_err()
                .code,
            "wallpaper.uncertain"
        );
        effects.recover(&owner).unwrap();
    }
    let root = temp.0.join("wallpaper-effects-v1");
    let files: Vec<_> = fs::read_dir(&root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "png"))
        .map(|p| {
            let bytes = fs::read(&p).unwrap();
            (p, bytes)
        })
        .collect();
    assert_eq!(files.len(), 3);
    assert_eq!(
        effects.prepare(&owner, &cache, &d).unwrap_err().code,
        "wallpaper.slots_full"
    );
    for (path, bytes) in files {
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
}

#[test]
fn public_workflow_claims_isolate_same_asset_preparations_and_cas_loser_cancellation() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let asset = image(&mut cache, 3);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let claim_a = "4c612626-dd03-40b4-8fc1-96fc75f2980c";
    let claim_b = "4c612626-dd03-40b4-8fc1-96fc75f2980d";
    let prepared = effects
        .prepare_claimed(&owner, &cache, &asset, claim_a, &atomic_replace_file)
        .unwrap();
    assert_eq!(
        effects
            .prepare_claimed(&owner, &cache, &asset, claim_a, &atomic_replace_file)
            .unwrap(),
        prepared
    );
    assert_eq!(
        effects
            .prepare_claimed(&owner, &cache, &asset, claim_b, &atomic_replace_file)
            .unwrap_err()
            .code,
        "wallpaper.busy"
    );
    assert_eq!(
        effects.prepare(&owner, &cache, &asset).unwrap_err().code,
        "wallpaper.busy"
    );
    assert!(effects
        .prepare_claimed(&owner, &cache, &asset, "not-a-uuid", &atomic_replace_file)
        .is_err());
    drop(effects);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    assert_eq!(
        effects
            .prepare_claimed(&owner, &cache, &asset, claim_a, &atomic_replace_file)
            .unwrap(),
        prepared
    );
    assert!(effects.cancel(&owner, &"f".repeat(64)).is_err());
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: temp.0.join("wallpaper-effects-v1/state.json"),
    };
    assert_eq!(
        effects.apply(&owner, &prepared.intent_id, &setter).unwrap(),
        ApplyOutcome::Applied
    );
}
#[test]
fn prepared_publication_rechecks_after_staging_and_aborts_without_orphan_slots() {
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let asset = image(&mut cache, 3);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let state_path = temp.0.join("wallpaper-effects-v1/state.json");
    let before = fs::read(&state_path).unwrap();
    let deny = |source: &Path, _target: &Path| {
        assert!(source.is_file());
        assert!(fs::metadata(source).unwrap().len() > 0);
        Err(std::io::Error::other("revoked"))
    };
    assert!(effects
        .prepare_claimed(
            &owner,
            &cache,
            &asset,
            "4c612626-dd03-40b4-8fc1-96fc75f2980c",
            &deny
        )
        .is_err());
    assert_eq!(fs::read(&state_path).unwrap(), before);
    assert_eq!(
        fs::read_dir(state_path.parent().unwrap()).unwrap().count(),
        2
    );
    let prepared = effects
        .prepare_claimed(
            &owner,
            &cache,
            &asset,
            "4c612626-dd03-40b4-8fc1-96fc75f2980c",
            &atomic_replace_file,
        )
        .unwrap();
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: state_path.clone(),
    };
    assert!(effects
        .apply_authorized(&owner, &prepared.intent_id, &setter, &deny)
        .is_err());
    assert!(setter.calls.lock().unwrap().is_empty());
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&fs::read(state_path).unwrap()).unwrap()
            ["active"]["phase"],
        "prepared"
    );
}

#[test]
fn proven_not_started_native_callback_failure_keeps_prepared_intent_reusable() {
    struct NotStarted;
    impl WallpaperSetter for NotStarted {
        fn set_from_path(&self, _: &Path) -> Result<(), NativeResourceError> {
            Err(resource_error(
                "wallpaper.apply",
                "wallpaper.not_started",
                "The queued invocation was cancelled before any OS effect.",
                false,
            ))
        }
    }
    let temp = Temp::new();
    let owner = owner();
    let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
    let asset = image(&mut cache, 7);
    let effects = WallpaperEffects::open(&owner, &temp.0).unwrap();
    let prepared = effects
        .prepare_claimed(
            &owner,
            &cache,
            &asset,
            "4c612626-dd03-40b4-8fc1-96fc75f2980c",
            &atomic_replace_file,
        )
        .unwrap();
    assert_eq!(
        effects
            .apply_authorized(
                &owner,
                &prepared.intent_id,
                &NotStarted,
                &atomic_replace_file
            )
            .unwrap_err()
            .code,
        "wallpaper.not_started"
    );
    let setter = Setter {
        calls: Mutex::new(vec![]),
        state: temp.0.join("wallpaper-effects-v1/state.json"),
    };
    assert_eq!(
        effects.apply(&owner, &prepared.intent_id, &setter).unwrap(),
        ApplyOutcome::Applied
    );
    assert_eq!(setter.calls.lock().unwrap().len(), 1);
}
