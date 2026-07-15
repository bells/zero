use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use ztool_lib::plugins::contracts::NetworkFetchRequest;
use ztool_lib::services::native_resources::{fetch_https, resolve_plugin_file, write_plugin_file};

struct TestDir(PathBuf);

impl TestDir {
    fn new(label: &str) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "ztool-native-resource-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn plugin_storage_writes_replaces_and_resolves_relative_files() {
    let root = TestDir::new("write");

    let first =
        write_plugin_file(root.path(), "images/today.jpg", b"first", 16).expect("first write");
    let second = write_plugin_file(root.path(), "images/today.jpg", b"second", 16)
        .expect("replacement write");
    let resolved =
        resolve_plugin_file(root.path(), "images/today.jpg").expect("stored file should resolve");

    assert_eq!(first.relative_path, "images/today.jpg");
    assert_eq!(first.bytes_written, 5);
    assert_eq!(second.bytes_written, 6);
    assert_eq!(fs::read(resolved).expect("stored content"), b"second");
    assert!(fs::read_dir(root.path().join("images"))
        .expect("image directory")
        .all(|entry| !entry
            .expect("directory entry")
            .file_name()
            .to_string_lossy()
            .ends_with(".part")));
}

#[test]
fn plugin_storage_rejects_oversize_absolute_and_escape_paths() {
    let root = TestDir::new("path-policy");
    let oversized = write_plugin_file(root.path(), "large.bin", b"12345", 4)
        .expect_err("quota should be enforced");
    assert_eq!(oversized.code, "storage.quota");

    for unsafe_path in [
        "../outside.jpg",
        "/tmp/outside.jpg",
        "images/../../outside.jpg",
        "images\\outside.jpg",
        "",
    ] {
        let error = write_plugin_file(root.path(), unsafe_path, b"x", 4)
            .expect_err("unsafe path should be rejected");
        assert_eq!(error.code, "storage.path_invalid", "path: {unsafe_path}");
        assert!(!error.retryable);
    }
}

#[cfg(unix)]
#[test]
fn plugin_storage_rejects_symlink_escape() {
    use std::os::unix::fs::symlink;

    let root = TestDir::new("symlink-root");
    let outside = TestDir::new("symlink-outside");
    symlink(outside.path(), root.path().join("linked")).expect("symlink");

    let error = write_plugin_file(root.path(), "linked/escape.jpg", b"x", 4)
        .expect_err("symlink escape should fail");
    assert_eq!(error.code, "storage.path_escape");
    assert!(!outside.path().join("escape.jpg").exists());
}

#[test]
fn network_policy_rejects_unsafe_requests_before_connecting() {
    let method = tauri::async_runtime::block_on(fetch_https(
        &NetworkFetchRequest {
            url: "https://www.bing.com/".into(),
            method: Some("POST".into()),
        },
        &["www.bing.com"],
        1024,
    ))
    .expect_err("non-GET method should fail");
    assert_eq!(method.code, "network.method_unsupported");

    let insecure = tauri::async_runtime::block_on(fetch_https(
        &NetworkFetchRequest {
            url: "http://www.bing.com/".into(),
            method: Some("GET".into()),
        },
        &["www.bing.com"],
        1024,
    ))
    .expect_err("HTTP should fail");
    assert_eq!(insecure.code, "network.scheme_denied");

    let foreign = tauri::async_runtime::block_on(fetch_https(
        &NetworkFetchRequest {
            url: "https://example.com/".into(),
            method: None,
        },
        &["www.bing.com"],
        1024,
    ))
    .expect_err("foreign host should fail");
    assert_eq!(foreign.code, "network.host_denied");

    let private = tauri::async_runtime::block_on(fetch_https(
        &NetworkFetchRequest {
            url: "https://127.0.0.1/".into(),
            method: None,
        },
        &["127.0.0.1"],
        1024,
    ))
    .expect_err("private address should fail");
    assert_eq!(private.code, "network.private_address_denied");
}
