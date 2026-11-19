use super::*;
use image::{DynamicImage, ImageFormat, RgbImage};
use std::fs;
use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let path = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "zero-images-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn owner(id: &str) -> SessionOwner {
    SessionOwner {
        plugin_id: id.into(),
        version: "1.0.0".into(),
        digest: "a".repeat(64),
        root: PathBuf::from("/installed/test"),
        view_id: "main".into(),
        revision: 1,
        permissions: vec![],
    }
}
fn fixture(width: u32, height: u32, seed: u8, format: ImageFormat) -> Vec<u8> {
    let pixels = RgbImage::from_fn(width, height, |x, y| {
        image::Rgb([seed.wrapping_add(x as u8), seed.wrapping_add(y as u8), seed])
    });
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(pixels)
        .write_to(&mut bytes, format)
        .unwrap();
    bytes.into_inner()
}
#[test]
fn validated_jpeg_and_png_roundtrip_with_content_id_and_camelcase_descriptor() {
    let temp = Temp::new();
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
    ] {
        let bytes = fixture(32, 24, 7, format);
        let asset = cache.store(&bytes, mime).unwrap();
        assert_eq!(cache.read(&asset.asset_id).unwrap(), bytes);
        assert_eq!(
            (asset.width, asset.height, asset.byte_length),
            (32, 24, bytes.len() as u64)
        );
        assert_eq!(asset.asset_id.len(), 64);
        let value = serde_json::to_value(asset).unwrap();
        assert_eq!(value["mimeType"], mime);
        assert!(value.get("assetId").is_some());
        assert!(value.get("path").is_none());
    }
}
#[test]
fn rejects_empty_spoofed_svg_oversized_and_truncated_inputs_without_disk_assets() {
    let temp = Temp::new();
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    let png = fixture(8, 8, 1, ImageFormat::Png);
    for (bytes, mime) in [
        (vec![], "image/png"),
        (png.clone(), "image/jpeg"),
        (b"<svg/>".to_vec(), "image/svg+xml"),
        (vec![0; 25 * 1024 * 1024 + 1], "image/jpeg"),
        (png[..png.len() / 2].to_vec(), "image/png"),
    ] {
        assert!(cache.store(&bytes, mime).is_err());
    }
    assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 0);
}
#[test]
fn restart_readmits_plugin_version_but_rejects_tamper_and_foreign_namespace() {
    let temp = Temp::new();
    let first = owner("test.images");
    let mut cache = ImageCache::open(&first, &temp.0).unwrap();
    let bytes = fixture(16, 12, 4, ImageFormat::Png);
    let asset = cache.store(&bytes, "image/png").unwrap();
    let mut updated = first.clone();
    updated.version = "2.0.0".into();
    updated.digest = "b".repeat(64);
    let reopened = ImageCache::open(&updated, &temp.0).unwrap();
    assert_eq!(reopened.read(&asset.asset_id).unwrap(), bytes);
    assert!(ImageCache::open(&owner("other.images"), &temp.0).is_err());
    fs::write(
        cache.root.join(format!("{}.image", asset.asset_id)),
        fixture(16, 12, 9, ImageFormat::Png),
    )
    .unwrap();
    assert!(reopened.read(&asset.asset_id).is_err());
    assert!(ImageCache::open(&updated, &temp.0).is_err());
}
#[test]
fn index_schema_unknown_fields_duplicate_size_and_oversize_fail_preserving_original() {
    for change in 0..6 {
        let temp = Temp::new();
        let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
        cache
            .store(&fixture(8, 8, 1, ImageFormat::Png), "image/png")
            .unwrap();
        let path = cache.root.join("index.json");
        let mut json: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        match change {
            0 => json["schema"] = 2.into(),
            1 => json["unknown"] = true.into(),
            2 => json["assets"][0]["byteLength"] = 1.into(),
            3 => {
                let duplicate = json["assets"][0].clone();
                json["assets"].as_array_mut().unwrap().push(duplicate);
            }
            4 => json["assets"][0]["path"] = "../private".into(),
            _ => json["pluginId"] = "x".repeat(20000).into(),
        }
        let original = serde_json::to_vec(&json).unwrap();
        fs::write(&path, &original).unwrap();
        assert!(
            ImageCache::open(&owner("test.images"), &temp.0).is_err(),
            "case {change}"
        );
        assert_eq!(fs::read(path).unwrap(), original);
    }
}
#[test]
fn eviction_retains_ten_assets_and_preserves_unrelated_files() {
    let temp = Temp::new();
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    let mut ids = Vec::new();
    for n in 0..12 {
        ids.push(
            cache
                .store(&fixture(12, 8, n, ImageFormat::Png), "image/png")
                .unwrap()
                .asset_id,
        );
    }
    assert!(cache.read(&ids[0]).is_err());
    assert!(cache.read(&ids[1]).is_err());
    for id in &ids[2..] {
        assert!(cache.read(id).is_ok());
    }
    fs::write(cache.root.join("user-notes.txt"), b"keep").unwrap();
    assert_eq!(
        cache
            .store(&fixture(12, 8, 99, ImageFormat::Png), "image/png")
            .unwrap_err()
            .code,
        "image.recoveryRequired"
    );
    assert_eq!(
        fs::read(cache.root.join("user-notes.txt")).unwrap(),
        b"keep"
    );
    assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 12);
}
#[cfg(unix)]
#[test]
fn refuses_symlink_root_ancestor_cache_index_and_assets() {
    use std::os::unix::fs::symlink;
    let temp = Temp::new();
    let link = temp.0.join("link");
    symlink(&temp.0, &link).unwrap();
    assert!(ImageCache::open(&owner("test.images"), &link).is_err());
    let nested = link.join("child");
    fs::create_dir_all(&nested).unwrap();
    assert!(ImageCache::open(&owner("test.images"), &nested).is_err());
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    let asset = cache
        .store(&fixture(8, 8, 1, ImageFormat::Png), "image/png")
        .unwrap();
    let path = cache.root.join(format!("{}.image", asset.asset_id));
    let original = temp.0.join("original");
    fs::rename(&path, &original).unwrap();
    symlink(&original, &path).unwrap();
    assert!(cache.read(&asset.asset_id).is_err());
    fs::remove_file(&path).unwrap();
    fs::rename(original, path).unwrap();
    let index = cache.root.join("index.json");
    let backup = temp.0.join("index.backup");
    fs::rename(&index, &backup).unwrap();
    symlink(&backup, &index).unwrap();
    assert!(ImageCache::open(&owner("test.images"), &temp.0).is_err());
    fs::remove_file(index).unwrap();
    fs::rename(backup, cache.root.join("index.json")).unwrap();
    let root = cache.root.clone();
    fs::rename(&root, temp.0.join("backup")).unwrap();
    symlink(temp.0.join("backup"), root).unwrap();
    assert!(ImageCache::open(&owner("test.images"), &temp.0).is_err());
}
#[test]
fn rejects_pixel_bomb_before_full_decode_and_jpeg_missing_end_marker() {
    let temp = Temp::new();
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    let mut png = fixture(8, 8, 3, ImageFormat::Png);
    png[16..20].copy_from_slice(&10_000_u32.to_be_bytes());
    png[20..24].copy_from_slice(&10_000_u32.to_be_bytes());
    let mut crc = !0_u32;
    for b in &png[12..29] {
        crc ^= u32::from(*b);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb88320 & 0_u32.wrapping_sub(crc & 1));
        }
    }
    png[29..33].copy_from_slice(&(!crc).to_be_bytes());
    assert_eq!(
        cache.store(&png, "image/png").unwrap_err().code,
        "image.dimensions"
    );
    let mut jpeg = fixture(20, 20, 3, ImageFormat::Jpeg);
    jpeg.truncate(jpeg.len() - 2);
    assert!(cache.store(&jpeg, "image/jpeg").is_err());
}
#[test]
fn failed_asset_or_index_atomic_replace_keeps_old_index_and_all_prior_bytes() {
    for fail_call in [1, 2] {
        let temp = Temp::new();
        let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
        let mut old = Vec::new();
        for n in 0..10 {
            let b = fixture(8, 8, n, ImageFormat::Png);
            let a = cache.store(&b, "image/png").unwrap();
            old.push((a.asset_id, b));
        }
        let before = fs::read(cache.root.join("index.json")).unwrap();
        let mut calls = 0;
        assert!(cache
            .store_with(
                &fixture(8, 8, 99, ImageFormat::Png),
                "image/png",
                |from, to| {
                    calls += 1;
                    if calls == fail_call {
                        Err(std::io::Error::other("injected atomic failure"))
                    } else {
                        atomic_replace_file(from, to)
                    }
                }
            )
            .is_err());
        assert_eq!(fs::read(cache.root.join("index.json")).unwrap(), before);
        for (id, bytes) in old {
            assert_eq!(cache.read(&id).unwrap(), bytes);
        }
        assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 11);
        assert!(ImageCache::open(&owner("test.images"), &temp.0).is_ok());
    }
}
use std::sync::{atomic::AtomicU64 as ClockValue, Arc};
struct FakeClock(ClockValue);
impl PreviewClock for FakeClock {
    fn now_ms(&self) -> Result<u64, NativeResourceError> {
        Ok(self.0.load(Ordering::Relaxed))
    }
}
fn previews() -> (PreviewLeases, Arc<FakeClock>) {
    let clock = Arc::new(FakeClock(ClockValue::new(10)));
    (PreviewLeases::with_clock(clock.clone()), clock)
}
#[test]
fn preview_is_bounded_jpeg_with_native_bytes_and_expires_without_background_work() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    let asset = cache
        .store(&fixture(1600, 1000, 2, ImageFormat::Png), "image/png")
        .unwrap();
    let (pool, clock) = previews();
    let lease = pool
        .issue(&cache, &who, "session", 7, &asset.asset_id)
        .unwrap();
    assert_eq!((lease.width, lease.height), (960, 600));
    assert_eq!(lease.mime_type, "image/jpeg");
    let bytes = pool.read(&who, "session", 7, &lease.lease_id).unwrap();
    assert_eq!(bytes.len() as u64, lease.byte_length);
    assert!(bytes.len() <= 2 * 1024 * 1024);
    let image = image::load_from_memory(&bytes).unwrap();
    assert_eq!((image.width(), image.height()), (960, 600));
    clock.0.store(300_009, Ordering::Relaxed);
    assert!(pool.read(&who, "session", 7, &lease.lease_id).is_ok());
    clock.0.store(300_010, Ordering::Relaxed);
    assert!(pool.read(&who, "session", 7, &lease.lease_id).is_err());
    assert!(cache.read(&asset.asset_id).is_ok());
}
#[test]
fn leases_isolate_all_install_owner_fields_sessions_and_generations() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    let asset = cache
        .store(&fixture(8, 8, 2, ImageFormat::Png), "image/png")
        .unwrap();
    let (pool, _) = previews();
    let lease = pool
        .issue(&cache, &who, "session", 7, &asset.asset_id)
        .unwrap();
    for field in 0..4 {
        let mut other = who.clone();
        match field {
            0 => other.plugin_id = "other.images".into(),
            1 => other.version = "2.0.0".into(),
            2 => other.digest = "b".repeat(64),
            _ => other.root = PathBuf::from("/other"),
        };
        assert!(pool.read(&other, "session", 7, &lease.lease_id).is_err());
        assert!(pool.release(&other, "session", 7, &lease.lease_id).is_err());
        assert!(pool
            .issue(&cache, &other, "session", 7, &asset.asset_id)
            .is_err());
    }
    assert!(pool.read(&who, "other", 7, &lease.lease_id).is_err());
    assert!(pool.read(&who, "session", 8, &lease.lease_id).is_err());
    pool.release(&who, "session", 7, &lease.lease_id).unwrap();
    pool.release(&who, "session", 7, &lease.lease_id).unwrap();
    assert!(pool.read(&who, "session", 7, &lease.lease_id).is_err());
}
#[test]
fn closing_ui_or_revoking_owner_preserves_peer_leases_and_persistent_cache() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    let asset = cache
        .store(&fixture(8, 8, 2, ImageFormat::Png), "image/png")
        .unwrap();
    let other_temp = Temp::new();
    let peer = owner("peer.images");
    let mut other_cache = ImageCache::open(&peer, &other_temp.0).unwrap();
    let other = other_cache
        .store(&fixture(8, 8, 3, ImageFormat::Png), "image/png")
        .unwrap();
    let (pool, _) = previews();
    let a = pool.issue(&cache, &who, "a", 1, &asset.asset_id).unwrap();
    let b = pool.issue(&cache, &who, "b", 2, &asset.asset_id).unwrap();
    let c = pool
        .issue(&other_cache, &peer, "a", 1, &other.asset_id)
        .unwrap();
    pool.release_session(&who, "a", 1).unwrap();
    assert!(pool.read(&who, "a", 1, &a.lease_id).is_err());
    assert!(pool.read(&who, "b", 2, &b.lease_id).is_ok());
    pool.revoke_owner(&who).unwrap();
    assert!(pool.read(&who, "b", 2, &b.lease_id).is_err());
    assert!(pool.read(&peer, "a", 1, &c.lease_id).is_ok());
    assert!(cache.read(&asset.asset_id).is_ok());
}
#[test]
fn preview_token_owner_and_global_counts_are_bounded_and_expiry_reclaims_capacity() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    let asset = cache
        .store(&fixture(8, 8, 2, ImageFormat::Png), "image/png")
        .unwrap();
    let (pool, clock) = previews();
    let mut tokens = std::collections::HashSet::new();
    for _ in 0..16 {
        let lease = pool.issue(&cache, &who, "a", 1, &asset.asset_id).unwrap();
        assert!(tokens.insert(lease.lease_id));
    }
    assert!(pool.issue(&cache, &who, "b", 2, &asset.asset_id).is_err());
    clock.0.store(300_011, Ordering::Relaxed);
    assert!(pool.issue(&cache, &who, "b", 2, &asset.asset_id).is_ok());
    let (pool, _) = previews();
    let mut roots = Vec::new();
    for n in 0..4 {
        let temp = Temp::new();
        let owner = owner(&format!("images.{n}"));
        let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
        let asset = cache
            .store(&fixture(8, 8, n, ImageFormat::Png), "image/png")
            .unwrap();
        for _ in 0..16 {
            pool.issue(&cache, &owner, "a", 1, &asset.asset_id).unwrap();
        }
        roots.push(temp);
    }
    assert!(pool.issue(&cache, &who, "a", 1, &asset.asset_id).is_err());
}
#[test]
fn preview_byte_quotas_bound_owner_and_global_memory_before_token_limits() {
    fn resource() -> PreviewResource {
        let mut bytes = fixture(8, 8, 7, ImageFormat::Jpeg);
        bytes.resize(2 * 1024 * 1024, 0);
        assert!(image::load_from_memory(&bytes).is_ok());
        PreviewResource {
            bytes: bytes.into(),
            width: 8,
            height: 8,
        }
    }
    let (pool, _) = previews();
    let who = owner("test.images");
    for _ in 0..4 {
        pool.admit(&who, "s", 1, resource()).unwrap();
    }
    assert!(pool.admit(&who, "s", 1, resource()).is_err());
    pool.revoke_owner(&who).unwrap();
    for n in 0..4 {
        for _ in 0..4 {
            pool.admit(&owner(&format!("images.{n}")), "s", 1, resource())
                .unwrap();
        }
    }
    assert!(pool.admit(&who, "s", 1, resource()).is_err());
    pool.revoke_owner(&owner("images.2")).unwrap();
    assert!(pool.admit(&who, "s", 1, resource()).is_ok());
}
#[test]
fn host_applier_reads_require_full_installed_owner_and_share_bounded_validation() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    let bytes = fixture(12, 8, 4, ImageFormat::Png);
    let asset = cache.store(&bytes, "image/png").unwrap();
    assert_eq!(cache.read_for_owner(&who, &asset.asset_id).unwrap(), bytes);
    for field in 0..4 {
        let mut stale = who.clone();
        match field {
            0 => stale.plugin_id = "other.images".into(),
            1 => stale.version = "2.0.0".into(),
            2 => stale.digest = "c".repeat(64),
            _ => stale.root = PathBuf::from("/other"),
        }
        assert!(cache.read_for_owner(&stale, &asset.asset_id).is_err());
    }
    assert_eq!(validate_image(&bytes, "image/png").unwrap(), asset);
    assert!(validate_image(&bytes, "image/jpeg").is_err());
}
#[test]
fn host_applier_byte_validation_accepts_supported_bytes_and_denies_mime_spoof() {
    let bytes = fixture(12, 8, 4, ImageFormat::Png);
    let asset = validate_image(&bytes, "image/png").unwrap();
    assert_eq!((asset.width, asset.height), (12, 8));
    assert!(validate_image(&bytes, "image/jpeg").is_err());
}
#[test]
fn failed_retirement_cleanup_survives_restarts_without_admitting_more_originals() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    for n in 0..10 {
        cache
            .store(&fixture(8, 8, n, ImageFormat::Png), "image/png")
            .unwrap();
    }
    let denied = |_: &Path| Err(std::io::Error::other("cleanup denied"));
    assert!(cache
        .store_with_ops(
            &fixture(8, 8, 20, ImageFormat::Png),
            "image/png",
            atomic_replace_file,
            denied
        )
        .is_err());
    let index: serde_json::Value =
        serde_json::from_slice(&fs::read(cache.root.join("index.json")).unwrap()).unwrap();
    assert_eq!(index["assets"].as_array().unwrap().len(), 10);
    assert_eq!(index["retired"].as_array().unwrap().len(), 1);
    let retired = index["retired"][0]["assetId"].as_str().unwrap().to_owned();
    for n in 21..24 {
        let mut restarted = ImageCache::open(&who, &temp.0).unwrap();
        assert!(restarted
            .store_with_ops(
                &fixture(8, 8, n, ImageFormat::Png),
                "image/png",
                atomic_replace_file,
                denied
            )
            .is_err());
        assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 12);
    }
    cache
        .store(&fixture(8, 8, 99, ImageFormat::Png), "image/png")
        .unwrap();
    assert!(!cache.root.join(format!("{retired}.image")).exists());
    assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 11);
}
#[test]
fn failed_retired_metadata_publication_retries_already_removed_path_idempotently() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    for n in 0..10 {
        cache
            .store(&fixture(8, 8, n, ImageFormat::Png), "image/png")
            .unwrap();
    }
    let mut calls = 0;
    assert!(cache
        .store_with_ops(
            &fixture(8, 8, 20, ImageFormat::Png),
            "image/png",
            |from, to| {
                calls += 1;
                if calls == 3 {
                    Err(std::io::Error::other("second metadata publish denied"))
                } else {
                    atomic_replace_file(from, to)
                }
            },
            |path| fs::remove_file(path)
        )
        .is_err());
    let before = fs::read(cache.root.join("index.json")).unwrap();
    let index: serde_json::Value = serde_json::from_slice(&before).unwrap();
    let retired = index["retired"][0]["assetId"].as_str().unwrap();
    assert!(!cache.root.join(format!("{retired}.image")).exists());
    for _ in 0..2 {
        let mut restarted = ImageCache::open(&who, &temp.0).unwrap();
        assert!(restarted
            .store_with_ops(
                &fixture(8, 8, 21, ImageFormat::Png),
                "image/png",
                |_, _| Err(std::io::Error::other("cleanup metadata denied")),
                |path| fs::remove_file(path)
            )
            .is_err());
        assert_eq!(fs::read(cache.root.join("index.json")).unwrap(), before);
        assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 11);
    }
    let mut restarted = ImageCache::open(&who, &temp.0).unwrap();
    restarted
        .store(&fixture(8, 8, 22, ImageFormat::Png), "image/png")
        .unwrap();
    assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 11);
}
#[test]
fn unknown_or_crash_orphan_files_are_preserved_and_block_disk_growth() {
    for filename in ["user-notes.txt", "orphan.image", ".crash.part"] {
        let temp = Temp::new();
        let who = owner("test.images");
        let mut cache = ImageCache::open(&who, &temp.0).unwrap();
        let asset = cache
            .store(&fixture(8, 8, 1, ImageFormat::Png), "image/png")
            .unwrap();
        let before = fs::read(cache.root.join("index.json")).unwrap();
        fs::write(cache.root.join(filename), b"preserve").unwrap();
        for n in 2..5 {
            let mut restarted = ImageCache::open(&who, &temp.0).unwrap();
            assert_eq!(
                restarted
                    .store(&fixture(8, 8, n, ImageFormat::Png), "image/png")
                    .unwrap_err()
                    .code,
                "image.recoveryRequired"
            );
            assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 3);
            assert_eq!(fs::read(cache.root.join("index.json")).unwrap(), before);
        }
        assert_eq!(fs::read(cache.root.join(filename)).unwrap(), b"preserve");
        assert!(cache.read(&asset.asset_id).is_ok());
    }
}
#[test]
fn failed_index_and_failed_new_asset_rollback_block_subsequent_growth_after_restart() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    let prior = cache
        .store(&fixture(8, 8, 1, ImageFormat::Png), "image/png")
        .unwrap();
    let before = fs::read(cache.root.join("index.json")).unwrap();
    let mut calls = 0;
    assert!(cache
        .store_with_ops(
            &fixture(8, 8, 2, ImageFormat::Png),
            "image/png",
            |from, to| {
                calls += 1;
                if calls == 2 {
                    Err(std::io::Error::other("index denied"))
                } else {
                    atomic_replace_file(from, to)
                }
            },
            |_| Err(std::io::Error::other("rollback denied"))
        )
        .is_err());
    assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 3);
    for n in 3..6 {
        let mut restarted = ImageCache::open(&who, &temp.0).unwrap();
        assert_eq!(
            restarted
                .store(&fixture(8, 8, n, ImageFormat::Png), "image/png")
                .unwrap_err()
                .code,
            "image.recoveryRequired"
        );
        assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 3);
        assert_eq!(fs::read(cache.root.join("index.json")).unwrap(), before);
        assert!(restarted.read(&prior.asset_id).is_ok());
    }
}

fn jpeg_with_interrupted_scans() -> (Vec<u8>, Vec<Vec<u8>>) {
    let image = RgbImage::from_fn(128, 128, |x, y| {
        image::Rgb([
            (x * 13 + y * 27) as u8,
            (x * 17 + y * 3) as u8,
            (x * 7 + y * 19) as u8,
        ])
    });
    let mut encoded = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(image)
        .write_to(&mut encoded, ImageFormat::Jpeg)
        .unwrap();
    let full = encoded.into_inner();
    let interrupted = interrupted_scans(&full);
    (full, interrupted)
}

fn interrupted_scans(full: &[u8]) -> Vec<Vec<u8>> {
    let sos = full
        .windows(2)
        .position(|pair| pair == [0xff, 0xda])
        .unwrap();
    let segment_length = u16::from_be_bytes([full[sos + 2], full[sos + 3]]) as usize;
    let scan_start = sos + 2 + segment_length;
    [0, 1, 10, 50, 100, 500, 1000, full.len() / 2]
        .into_iter()
        .map(|kept| {
            assert!(scan_start + kept < full.len() - 2);
            let mut bytes = full[..scan_start + kept].to_vec();
            bytes.extend_from_slice(&[0xff, 0xd9]);
            bytes
        })
        .collect()
}

#[test]
fn progressive_jpeg_control_is_accepted_but_interrupted_entropy_is_rejected() {
    let full = include_bytes!("fixtures/progressive-128.jpg");
    let temp = Temp::new();
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    let asset = cache.store(full, "image/jpeg").unwrap();
    assert_eq!((asset.width, asset.height), (128, 128));
    assert_eq!(cache.read(&asset.asset_id).unwrap(), full);
    assert_eq!(validate_image(full, "image/jpeg").unwrap(), asset);
    for (case, bytes) in interrupted_scans(full).iter().enumerate() {
        assert!(
            cache.store(bytes, "image/jpeg").is_err(),
            "progressive interrupted case {case}"
        );
        assert!(
            validate_image(bytes, "image/jpeg").is_err(),
            "shared validator progressive interrupted case {case}"
        );
    }
}

#[test]
fn cache_rejects_interrupted_jpeg_scan_entropy_even_with_terminal_eoi() {
    let temp = Temp::new();
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    let (full, interrupted) = jpeg_with_interrupted_scans();
    let original = cache.store(&full, "image/jpeg").unwrap();
    for (case, bytes) in interrupted.iter().enumerate() {
        assert!(
            cache.store(bytes, "image/jpeg").is_err(),
            "interrupted scan case {case}, {} bytes",
            bytes.len()
        );
    }
    assert_eq!(cache.read(&original.asset_id).unwrap(), full);
    assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 2);
}

#[test]
fn wallpaper_shared_validator_rejects_interrupted_jpeg_scans_with_terminal_eoi() {
    let (full, interrupted) = jpeg_with_interrupted_scans();
    let asset = validate_image(&full, "image/jpeg").unwrap();
    assert_eq!((asset.width, asset.height), (128, 128));
    for (case, bytes) in interrupted.iter().enumerate() {
        assert!(
            validate_image(bytes, "image/jpeg").is_err(),
            "interrupted scan case {case}, {} bytes",
            bytes.len()
        );
    }
}

#[test]
fn supported_grayscale_and_rgb_jpegs_keep_bounded_preview_support() {
    let temp = Temp::new();
    let who = owner("test.images");
    let mut cache = ImageCache::open(&who, &temp.0).unwrap();
    let mut grayscale = Cursor::new(Vec::new());
    DynamicImage::ImageLuma8(image::GrayImage::from_fn(32, 24, |x, y| {
        image::Luma([(x + y) as u8])
    }))
    .write_to(&mut grayscale, ImageFormat::Jpeg)
    .unwrap();
    let (pool, _) = previews();
    for bytes in [
        grayscale.into_inner(),
        fixture(32, 24, 8, ImageFormat::Jpeg),
    ] {
        let asset = cache.store(&bytes, "image/jpeg").unwrap();
        assert_eq!((asset.width, asset.height), (32, 24));
        let lease = pool
            .issue(&cache, &who, "jpeg", 1, &asset.asset_id)
            .unwrap();
        let preview = pool.read(&who, "jpeg", 1, &lease.lease_id).unwrap();
        let decoded = image::load_from_memory(&preview).unwrap();
        assert!(decoded.width() <= 960 && decoded.height() <= 600);
    }
}

#[test]
fn strict_validation_covers_each_progressive_scan_and_restart_boundaries() {
    let controls: &[&[u8]] = &[
        include_bytes!("fixtures/progressive-128.jpg"),
        include_bytes!("fixtures/restart-baseline-128.jpg"),
        include_bytes!("fixtures/restart-progressive-128.jpg"),
    ];
    for (control, full) in controls.iter().enumerate() {
        let asset = validate_image(full, "image/jpeg").unwrap();
        assert_eq!((asset.width, asset.height), (128, 128));
        for (scan, sos) in full
            .windows(2)
            .enumerate()
            .filter_map(|(pos, pair)| (pair == [0xff, 0xda]).then_some(pos))
            .enumerate()
        {
            let scan_start = sos + 2 + u16::from_be_bytes([full[sos + 2], full[sos + 3]]) as usize;
            let scan_end = (scan_start..full.len() - 1)
                .find(|&pos| {
                    full[pos] == 0xff
                        && full[pos + 1] != 0
                        && !(0xd0..=0xd7).contains(&full[pos + 1])
                })
                .unwrap();
            for kept in [0, (scan_end - scan_start) / 2] {
                let mut interrupted = full[..scan_start + kept].to_vec();
                interrupted.extend_from_slice(&[0xff, 0xd9]);
                assert!(
                    validate_image(&interrupted, "image/jpeg").is_err(),
                    "control {control}, scan {scan}, kept {kept}"
                );
            }
        }
    }
}

#[test]
fn strict_host_validation_preserves_lenient_image_wrapper_compatibility() {
    let (_, interrupted) = jpeg_with_interrupted_scans();
    // Legacy image users retain their upstream lenient decoder behavior.
    assert!(image::load_from_memory(&interrupted[0]).is_ok());
    assert!(validate_image(&interrupted[0], "image/jpeg").is_err());
}

#[test]
fn baseline_cannot_complete_early_through_comment_app_or_sos_transitions() {
    let full = include_bytes!("fixtures/baseline-128.jpg");
    let temp = Temp::new();
    let mut cache = ImageCache::open(&owner("test.images"), &temp.0).unwrap();
    let original = cache.store(full, "image/jpeg").unwrap();
    assert_eq!((original.width, original.height), (128, 128));
    let sos = full
        .windows(2)
        .position(|pair| pair == [0xff, 0xda])
        .unwrap();
    let scan_start = sos + 2 + u16::from_be_bytes([full[sos + 2], full[sos + 3]]) as usize;
    for transition in [
        &[0xff, 0xfe, 0, 2][..],
        &[0xff, 0xed, 0, 6, b'Z', b'E', b'R', b'O'][..],
    ] {
        let mut complete = full[..full.len() - 2].to_vec();
        complete.extend_from_slice(transition);
        complete.extend_from_slice(&[0xff, 0xd9]);
        assert!(validate_image(&complete, "image/jpeg").is_ok());
    }
    for prefix_end in [
        scan_start,
        scan_start + 1,
        1123,
        1623,
        2240,
        2241,
        2242,
        3000,
        full.len() / 2,
    ] {
        for (name, transition) in [
            ("COM", &[0xff, 0xfe, 0, 2][..]),
            ("APP", &[0xff, 0xed, 0, 6, b'Z', b'E', b'R', b'O'][..]),
            ("SOS", &full[sos..scan_start]),
        ] {
            let mut interrupted = full[..prefix_end].to_vec();
            interrupted.extend_from_slice(transition);
            interrupted.extend_from_slice(&[0xff, 0xd9]);
            assert!(
                cache.store(&interrupted, "image/jpeg").is_err(),
                "cache {name} at {prefix_end}"
            );
            assert!(
                validate_image(&interrupted, "image/jpeg").is_err(),
                "shared validator {name} at {prefix_end}"
            );
        }
    }
    assert_eq!(cache.read(&original.asset_id).unwrap(), full);
    assert_eq!(fs::read_dir(&cache.root).unwrap().count(), 2);
}

#[test]
fn complete_baseline_component_scans_are_required_before_eoi() {
    for full in [
        include_bytes!("fixtures/multiscan-baseline-128.jpg").as_slice(),
        include_bytes!("fixtures/restart-multiscan-baseline-128.jpg").as_slice(),
    ] {
        let asset = validate_image(full, "image/jpeg").unwrap();
        assert_eq!((asset.width, asset.height), (128, 128));
        let scans: Vec<_> = full
            .windows(2)
            .enumerate()
            .filter_map(|(pos, pair)| (pair == [0xff, 0xda]).then_some(pos))
            .collect();
        assert_eq!(scans.len(), 3);
        for end in &scans[1..] {
            let mut incomplete = full[..*end].to_vec();
            incomplete.extend_from_slice(&[0xff, 0xd9]);
            assert!(
                validate_image(&incomplete, "image/jpeg").is_err(),
                "absent component scan at {end}"
            );
        }
    }
}

#[test]
fn marker_lookahead_can_retain_real_entropy_for_later_rows() {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageLuma8(image::GrayImage::from_pixel(8, 128, image::Luma([64])))
        .write_to(&mut bytes, ImageFormat::Jpeg)
        .unwrap();
    assert!(validate_image(bytes.get_ref(), "image/jpeg").is_ok());
}

#[test]
fn unsupported_subsampled_sequential_geometry_fails_explicitly() {
    // The pinned backend has incorrect row/offset handling for this valid geometry.
    // Keep its legacy lenient output policy, but never admit that output as verified media.
    let full = include_bytes!("fixtures/unsupported-subsampled-multiscan-128.jpg");
    assert!(image::load_from_memory(full).is_ok());
    assert!(validate_image(full, "image/jpeg").is_err());
}
