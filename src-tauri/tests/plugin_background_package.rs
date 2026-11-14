// The developer runtime override is intentionally supported only on debug macOS.
#![cfg(all(debug_assertions, target_os = "macos"))]

use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use zero_lib::plugins::{
    package::{extract_zplugin_package, validate_zplugin_package},
    protocol::PUBLIC_WEB_RUNTIME_ENABLED,
};
use zip::{write::SimpleFileOptions, ZipWriter};

enum BackgroundEntry {
    Missing,
    File,
    Directory,
    Symlink,
    Fifo,
}

fn package(background: &str, entry: BackgroundEntry, main: &str, extra: Option<&str>) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "zero-background-package-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    let path = root.join("notes.zplugin");
    let mut manifest: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/example.manifest.json"
    ))
    .unwrap();
    manifest["engines"]["zero"] = ">=0.1.0 <0.2.0".into();
    manifest["main"] = main.into();
    manifest["background"] = serde_json::json!({"main":background,"events":["schedule.refresh"]});
    let mut archive = ZipWriter::new(fs::File::create(&path).unwrap());
    let options = SimpleFileOptions::default().unix_permissions(0o644);
    archive.start_file("manifest.json", options).unwrap();
    archive
        .write_all(&serde_json::to_vec(&manifest).unwrap())
        .unwrap();
    archive.start_file("dist/index.html", options).unwrap();
    archive.write_all(b"<main>notes</main>").unwrap();
    match entry {
        BackgroundEntry::Missing => (),
        BackgroundEntry::File | BackgroundEntry::Fifo => {
            archive.start_file(background, options).unwrap();
            archive
                .write_all(b"export const background = true;")
                .unwrap();
        }
        BackgroundEntry::Directory => {
            archive.add_directory(background, options).unwrap();
        }
        BackgroundEntry::Symlink => {
            archive
                .add_symlink(background, "index.html", options)
                .unwrap();
        }
    }
    if let Some(extra) = extra {
        archive.start_file(extra, options).unwrap();
        archive.write_all(b"unexpected").unwrap();
    }
    archive.finish().unwrap();
    if matches!(entry, BackgroundEntry::Fifo) {
        // ZIP writer deliberately masks type bits. Model an untrusted Unix FIFO
        // by setting its central directory mode in the real archive bytes.
        let mut bytes = fs::read(&path).unwrap();
        let header = bytes
            .windows(4)
            .enumerate()
            .find_map(|(index, magic)| {
                if magic != b"PK\x01\x02" {
                    return None;
                }
                let len = u16::from_le_bytes([bytes[index + 28], bytes[index + 29]]) as usize;
                (&bytes[index + 46..index + 46 + len] == background.as_bytes()).then_some(index)
            })
            .unwrap();
        bytes[header + 5] = 3;
        bytes[header + 38..header + 42].copy_from_slice(&(0o010644_u32 << 16).to_le_bytes());
        fs::write(&path, bytes).unwrap();
    }
    path
}

#[test]
fn background_archive_entries_require_real_safe_regular_scripts() {
    const CHILD: &str = "ZERO_BACKGROUND_PACKAGE_TEST_CHILD";
    if std::env::var(CHILD).as_deref() != Ok("1") {
        for runtime_override in ["0", "1"] {
            let output = Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "background_archive_entries_require_real_safe_regular_scripts",
                    "--nocapture",
                ])
                .env(CHILD, "1")
                .env("ZERO_PLUGIN_WEB_DEV", runtime_override)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "child with runtime override {runtime_override} failed:\n{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
        return;
    }
    assert!(!PUBLIC_WEB_RUNTIME_ENABLED);
    for (label, background, entry, main, extra, code) in [
        (
            "missing background",
            "dist/background.js",
            BackgroundEntry::Missing,
            "dist/index.html",
            None,
            Some("package.background.missing"),
        ),
        (
            "regular background",
            "dist/background.js",
            BackgroundEntry::File,
            "dist/index.html",
            None,
            None,
        ),
        (
            "directory background",
            "dist/background.js",
            BackgroundEntry::Directory,
            "dist/index.html",
            None,
            Some("package.background.missing"),
        ),
        (
            "symlink background",
            "dist/background.js",
            BackgroundEntry::Symlink,
            "dist/index.html",
            None,
            Some("package.archive.symlink"),
        ),
        (
            "FIFO background",
            "dist/background.js",
            BackgroundEntry::Fifo,
            "dist/index.html",
            None,
            Some("package.archive.specialFile"),
        ),
        (
            "unsafe background path",
            "../background.js",
            BackgroundEntry::File,
            "dist/index.html",
            None,
            Some("package.archive.unsafePath"),
        ),
        (
            "nonscript background",
            "dist/background.html",
            BackgroundEntry::File,
            "dist/index.html",
            None,
            Some("manifest.invalid"),
        ),
        (
            "missing HTML",
            "dist/background.js",
            BackgroundEntry::File,
            "dist/missing.html",
            None,
            Some("package.main.missing"),
        ),
        (
            "unsafe HTML",
            "dist/background.js",
            BackgroundEntry::File,
            "../index.html",
            None,
            Some("manifest.invalid"),
        ),
        (
            "unsafe unrelated entry",
            "dist/background.js",
            BackgroundEntry::File,
            "dist/index.html",
            Some("../escape.txt"),
            Some("package.archive.unsafePath"),
        ),
    ] {
        let path = package(background, entry, main, extra);
        let report = validate_zplugin_package(&path).unwrap();
        assert!(
            !report.valid,
            "{label}: package cannot run background events"
        );
        let destination = path.parent().unwrap().join("installed");
        assert!(extract_zplugin_package(&path, &destination).is_err());
        assert!(!destination.exists());
        if let Some(code) = code {
            assert!(
                report.issues.iter().any(|issue| issue.code == code),
                "{label}: {:#?}",
                report.issues
            );
        } else {
            assert!(
                report
                    .issues
                    .iter()
                    .any(|issue| issue.code == "capability.missing" && issue.path == "background"),
                "{label}: {:#?}",
                report.issues
            );
            assert!(
                report
                    .issues
                    .iter()
                    .all(|issue| (issue.code == "capability.missing"
                        && issue.path == "background")
                        || (issue.code == "runtime.unsupported" && issue.path == "runtime")),
                "{label}: ordinary script introduced archive errors: {:#?}",
                report.issues
            );
            assert!(report.protocol_manifest.unwrap().background.is_some());
        }
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
