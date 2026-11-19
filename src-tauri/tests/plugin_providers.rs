use zero_lib::plugins::{
    compatibility::{check_manifest, check_manifest_for_host_with_capabilities, current_platform},
    providers::plugin_host_capabilities,
};

#[test]
fn core_capability_snapshot_never_promises_unimplemented_providers() {
    let snapshot = plugin_host_capabilities();
    assert_eq!(snapshot.host_version, env!("CARGO_PKG_VERSION"));
    assert_eq!(snapshot.api_version, "1.0.0");
    let capabilities: Vec<_> = snapshot
        .capabilities
        .iter()
        .map(|p| p.id.as_str())
        .collect();
    for id in [
        "storage.plugin",
        "ui.message",
        "diagnostics.emit",
        "network.fetch",
    ] {
        assert!(capabilities.contains(&id));
    }
    assert_eq!(
        capabilities.len(),
        if cfg!(any(target_os = "macos", target_os = "windows")) {
            9
        } else {
            4
        }
    );
    assert!(capabilities.contains(&"network.fetch"));
    assert_eq!(
        capabilities.contains(&"power.lease"),
        cfg!(any(target_os = "macos", target_os = "windows"))
    );
    for id in ["media.image", "system.wallpaper", "files.export"] {
        assert_eq!(
            capabilities.contains(&id),
            cfg!(any(target_os = "macos", target_os = "windows")),
            "{id}"
        );
    }
    assert!(!capabilities.contains(&"capture"));
    assert!(snapshot.capabilities.iter().all(|p| p.version
        == if p.id == "power.lease" || p.id == "storage.plugin" {
            "1.1.0"
        } else {
            "1.0.0"
        }));
}

#[test]
fn actual_host_validation_uses_the_same_capability_catalog() {
    let mut manifest: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/example.manifest.json"
    ))
    .unwrap();
    manifest["engines"]["zero"] = serde_json::json!(">=0.1.0 <0.2.0");
    manifest["requiredCapabilities"] = serde_json::json!([
        {"id": "storage.plugin", "version": "^1.0.0"}
    ]);
    let report = zero_lib::plugins::compatibility::check_manifest(&manifest);
    assert!(!report
        .issues
        .iter()
        .any(|issue| issue.code.starts_with("capability.")));
    manifest["requiredCapabilities"] = serde_json::json!([
        {"id": "network.fetch", "version": "^1.0.0"}
    ]);
    let report = zero_lib::plugins::compatibility::check_manifest(&manifest);
    assert!(!report
        .issues
        .iter()
        .any(|issue| issue.code.starts_with("capability.")));
}

#[test]
fn canonical_paper_manifest_matches_the_native_provider_catalog() {
    let manifest = serde_json::from_str(include_str!(
        "../../src/plugins/bingWallpaper/package/manifest.json"
    ))
    .unwrap();
    let snapshot = plugin_host_capabilities();
    let platform = current_platform();
    let expected = matches!(platform, "macos" | "windows");
    let capability_admission = check_manifest_for_host_with_capabilities(
        &manifest,
        &snapshot.host_version,
        platform,
        true,
        &snapshot.capabilities,
    );
    assert_eq!(
        capability_admission.compatible, expected,
        "{:?}",
        capability_admission.issues
    );
    let actual_admission = check_manifest(&manifest);
    assert_eq!(
        actual_admission.compatible,
        expected && snapshot.runtime_enabled,
        "{:?}",
        actual_admission.issues
    );
    assert_eq!(
        actual_admission
            .issues
            .iter()
            .any(|issue| issue.code == "runtime.unsupported"),
        !snapshot.runtime_enabled
    );
    assert_eq!(
        actual_admission
            .issues
            .iter()
            .filter(|issue| issue.code != "runtime.unsupported")
            .collect::<Vec<_>>(),
        capability_admission.issues.iter().collect::<Vec<_>>()
    );
}

#[test]
fn background_entry_needs_an_implemented_background_provider() {
    let mut manifest: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/example.manifest.json"
    ))
    .unwrap();
    manifest["background"] = serde_json::json!({
        "main": "dist/background.js", "events": ["daily"]
    });
    let report = zero_lib::plugins::compatibility::check_manifest(&manifest);
    assert_eq!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "capability.missing" && issue.path == "background"),
        !cfg!(any(target_os = "macos", target_os = "windows"))
    );
}

#[test]
fn historical_core_catalog_cannot_satisfy_new_power_packages() {
    use zero_lib::plugins::capabilities::{
        compare_capabilities, HostCapability, RequiredCapability,
    };
    let old = ["storage.plugin", "ui.message", "diagnostics.emit"]
        .into_iter()
        .map(|id| HostCapability {
            id: id.into(),
            version: "1.0.0".into(),
        })
        .collect::<Vec<_>>();
    let required = [RequiredCapability {
        id: "power.lease".into(),
        version: "^1.0.0".into(),
    }];
    let report = compare_capabilities(&required, &old);
    assert!(!report.compatible);
    assert_eq!(report.issues[0].code, "capability.missing");
}
