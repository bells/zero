use std::{fs, io::Write};
use zero_lib::plugins::{contracts::InstallPluginPackageInput, registry::PluginRegistry};
use zip::{write::SimpleFileOptions, ZipWriter};

#[test]
fn legacy_manifest_cannot_claim_reserved_identity_without_authority() {
    let root = std::env::temp_dir().join(format!(
        "zero-legacy-official-install-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let package = root.join("impostor.zplugin");
    let mut zip = ZipWriter::new(fs::File::create(&package).unwrap());
    zip.start_file("manifest.json", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(br#"{"name":"zero.custom","version":"0.1.0","author":"impostor","main":"index.html","permissions":[]}"#).unwrap();
    zip.start_file("index.html", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"<!doctype html><title>Impostor</title>")
        .unwrap();
    zip.finish().unwrap();
    let mut registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
    let before = registry.records().to_vec();
    let input: InstallPluginPackageInput = serde_json::from_value(serde_json::json!({
        "packagePath":package,"approvedPermissions":[],"enabled":true
    }))
    .unwrap();
    let error = registry
        .install_local_package(input)
        .expect_err("legacy reserved identity must be rejected");
    assert!(
        error.contains("publisher authority"),
        "unexpected rejection: {error}"
    );
    assert_eq!(registry.records(), before);
    assert!(!root.join("plugins/zero.custom").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn unsigned_official_web_package_is_rejected_before_registry_mutation() {
    let root = std::env::temp_dir().join(format!("zero-official-install-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let package = root.join("zero.example-0.1.0.zplugin");
    let manifest = serde_json::json!({
        "schemaVersion":2,"name":"zero.example","id":"zero.example",
        "displayName":"Example","description":"Official identity test","author":"bells",
        "version":"0.1.0","engines":{"zero":">=0.1.0 <0.3.0","api":"^1.0.0"},
        "platforms":["macos","windows","linux"],"runtime":"webview","main":"index.html",
        "permissions":[],"contributes":{"views":[{"id":"zero.example.main","title":"Example","surface":"main"}]},
        "activationEvents":["onView:zero.example.main"]
    });
    let mut zip = ZipWriter::new(fs::File::create(&package).unwrap());
    zip.start_file("manifest.json", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(manifest.to_string().as_bytes()).unwrap();
    zip.start_file("index.html", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"<!doctype html><title>Example</title>")
        .unwrap();
    zip.finish().unwrap();
    let mut registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
    let before = registry.records().to_vec();
    let revision = registry.revision();
    let digest = registry.validate_package(&package).unwrap().sha256;
    let input: InstallPluginPackageInput = serde_json::from_value(serde_json::json!({
        "packagePath":package,"expectedSha256":digest,"approvedPermissions":[],"enabled":true
    }))
    .unwrap();
    let error = registry.install_local_package(input).unwrap_err();
    assert!(
        error.contains("publisher authority"),
        "unexpected rejection: {error}"
    );
    assert_eq!(registry.records(), before);
    assert_eq!(registry.revision(), revision);
    assert!(!root.join("plugins/zero.example").exists());
    fs::remove_dir_all(root).unwrap();
}
