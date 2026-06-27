use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ztool_lib::plugins::package::{
    archive_entry_destination, download_package_with_fetcher, sha256_hex,
    validate_zplugin_package, PluginPackageDownloadRequest,
};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn unique_staging_dir() -> PathBuf {
    std::env::temp_dir().join(format!(
        "ztool-plugin-package-test-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    ))
}

fn write_zplugin_package(
    file_name: &str,
    manifest_json: &str,
    files: &[(&str, &str)],
) -> PathBuf {
    let root = unique_staging_dir();
    fs::create_dir_all(&root).expect("package root");
    let package_path = root.join(file_name);
    let file = fs::File::create(&package_path).expect("package file");
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .unix_permissions(0o644);

    zip.start_file("manifest.json", options)
        .expect("manifest entry");
    zip.write_all(manifest_json.as_bytes())
        .expect("manifest bytes");

    for (path, content) in files {
        zip.start_file(path, options).expect("content entry");
        zip.write_all(content.as_bytes()).expect("content bytes");
    }

    zip.finish().expect("finish package");
    package_path
}

fn manifest_with_main(main: &str) -> String {
    format!(
        r#"{{
            "name": "package-tool",
            "version": "0.1.0",
            "author": "watson",
            "main": "{main}",
            "permissions": ["ui.message"]
        }}"#
    )
}

#[test]
fn stages_downloaded_package_when_checksum_matches() {
    let staging_dir = unique_staging_dir();
    let bytes = b"fake zplugin package".to_vec();
    let expected_sha256 = sha256_hex(&bytes);
    let request = PluginPackageDownloadRequest {
        download_url: "https://github.com/watson/plugin/releases/download/v0.1.0/plugin.zplugin"
            .into(),
        sha256: Some(expected_sha256.clone()),
    };

    let result = download_package_with_fetcher(&request, &staging_dir, |_| {
        Ok::<Vec<u8>, String>(bytes.clone())
    })
    .expect("download should be staged");

    assert_eq!(result.sha256, expected_sha256);
    assert_eq!(fs::read(result.staged_path).expect("staged bytes"), bytes);
}

#[test]
fn checksum_mismatch_removes_staged_package() {
    let staging_dir = unique_staging_dir();
    let request = PluginPackageDownloadRequest {
        download_url: "https://github.com/watson/plugin/releases/download/v0.1.0/plugin.zplugin"
            .into(),
        sha256: Some("0000000000000000000000000000000000000000000000000000000000000000".into()),
    };

    let error = download_package_with_fetcher(&request, &staging_dir, |_| {
        Ok::<Vec<u8>, String>(b"fake zplugin package".to_vec())
    })
    .expect_err("checksum mismatch should fail");

    assert!(error.message.contains("checksum"));
    assert!(!staging_dir.exists());
}

#[test]
fn download_failure_does_not_create_staging_dir() {
    let staging_dir = unique_staging_dir();
    let request = PluginPackageDownloadRequest {
        download_url: "https://github.com/watson/plugin/releases/download/v0.1.0/plugin.zplugin"
            .into(),
        sha256: None,
    };

    let error = download_package_with_fetcher(&request, &staging_dir, |_| {
        Err::<Vec<u8>, _>("network unavailable")
    })
    .expect_err("download failure should fail");

    assert!(error.message.contains("failed to download"));
    assert!(!staging_dir.exists());
}

#[test]
fn rejects_non_zplugin_download_url() {
    let staging_dir = unique_staging_dir();
    let request = PluginPackageDownloadRequest {
        download_url: "https://github.com/watson/plugin/releases/download/v0.1.0/plugin.zip"
            .into(),
        sha256: None,
    };

    let error = download_package_with_fetcher(&request, &staging_dir, |_| {
        Ok::<Vec<u8>, String>(b"fake zip package".to_vec())
    })
    .expect_err("non-zplugin asset should fail");

    assert!(error.message.contains(".zplugin"));
    assert!(!staging_dir.exists());
}

#[test]
fn archive_entry_destination_stays_inside_install_root() {
    let root = unique_staging_dir();
    let destination = archive_entry_destination(&root, "dist/index.html")
        .expect("entry path should be accepted");

    assert_eq!(destination, root.join("dist").join("index.html"));
}

#[test]
fn archive_entry_destination_rejects_unsafe_paths() {
    let root = unique_staging_dir();

    for entry in ["../evil", "/tmp/evil", "dist/../../evil", "", "C:\\\\Temp\\\\evil"] {
        let error = archive_entry_destination(&root, entry)
            .expect_err("unsafe archive entry should fail");

        assert!(error.message.contains("unsafe archive entry"));
    }
}

#[test]
fn package_validation_accepts_valid_zplugin_zip() {
    let package = write_zplugin_package(
        "package-tool.zplugin",
        &manifest_with_main("dist/index.html"),
        &[("dist/index.html", "<main>ok</main>")],
    );

    let report = validate_zplugin_package(&package).expect("package should validate");

    assert_eq!(report.valid, true);
    assert_eq!(report.manifest.expect("manifest").name, "package-tool");
    assert!(report.sha256.len() == 64);
}

#[test]
fn package_validation_rejects_missing_manifest_main_asset() {
    let package = write_zplugin_package(
        "package-tool.zplugin",
        &manifest_with_main("dist/missing.html"),
        &[("dist/index.html", "<main>wrong</main>")],
    );

    let report = validate_zplugin_package(&package).expect("validation report should return");

    assert_eq!(report.valid, false);
    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "package.main.missing")
    );
}

#[test]
fn package_validation_rejects_unsafe_archive_entries() {
    let package = write_zplugin_package(
        "package-tool.zplugin",
        &manifest_with_main("dist/index.html"),
        &[("../evil.txt", "evil"), ("dist/index.html", "<main>ok</main>")],
    );

    let report = validate_zplugin_package(&package).expect("validation report should return");

    assert_eq!(report.valid, false);
    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "package.archive.unsafePath")
    );
}
