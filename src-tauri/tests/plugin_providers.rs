use zero_lib::plugins::providers::plugin_host_capabilities;

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
    assert_eq!(
        capabilities,
        vec!["storage.plugin", "ui.message", "diagnostics.emit"]
    );
    assert!(!capabilities.contains(&"network.fetch"));
    assert!(!capabilities.contains(&"power.lease"));
    assert!(!capabilities.contains(&"capture"));
    assert!(snapshot.capabilities.iter().all(|p| p.version == "1.0.0"));
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
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "capability.missing"));
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
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "capability.missing" && issue.path == "background"));
}
