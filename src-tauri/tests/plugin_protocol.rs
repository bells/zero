use serde_json::Value;
use zero_lib::plugins::{compatibility, protocol, versions};

#[test]
fn shared_version_corpus() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/versions.json"
    ))
    .unwrap();
    for case in cases {
        assert_eq!(
            versions::protocol_version_matches(
                case["version"].as_str().unwrap(),
                case["range"].as_str().unwrap()
            ),
            case["matches"].as_bool().unwrap(),
            "{}",
            case["name"]
        );
    }
}

#[test]
fn shared_manifest_corpus() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/manifests.json"
    ))
    .unwrap();
    for case in cases {
        let report = protocol::check_web_manifest(&case["manifest"], "0.2.3", "1.2.0", "macos");
        assert_eq!(
            report.compatible,
            case["valid"].as_bool().unwrap(),
            "{}: {:?}",
            case["name"],
            report.issues
        );
    }
}

#[test]
fn runtime_gate_and_host_version_are_independent() {
    let manifest: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/example.manifest.json"
    ))
    .unwrap();
    let report = compatibility::check_manifest_for_host(&manifest, "0.1.0", "macos", false);
    assert!(report.issues.iter().any(|i| i.code == "host.incompatible"));
    assert!(report
        .issues
        .iter()
        .any(|i| i.code == "runtime.unsupported"));
    assert!(!compatibility::check_manifest_for_host(&manifest, "0.2.0", "macos", false).compatible);
    assert!(compatibility::check_manifest_for_host(&manifest, "0.2.0", "macos", true).compatible);
}

#[test]
fn legacy_alias_does_not_claim_new_api_or_rewrite_input() {
    let value = serde_json::json!({"name":"legacy", "version":"0.1.0", "author":"bells", "main":"dist/index.html", "permissions":[], "engines":{"zero":"^0.1.0","ztool":"^9.0.0","api":"1"}});
    let report = compatibility::check_manifest_for_host(&value, "0.1.1", "macos", false);
    assert!(report.compatible);
    assert_eq!(report.profile, "legacy");
    assert_eq!(report.api_version, None);
    assert_eq!(value["engines"]["ztool"], "^9.0.0");
}

#[test]
fn requests_are_method_typed_and_unknown_fields_are_rejected() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/requests.json"
    ))
    .unwrap();
    for case in cases {
        let valid = serde_json::from_value::<protocol::PluginRequest>(case["request"].clone())
            .ok()
            .is_some_and(|request| request.decode_method().is_ok());
        assert_eq!(valid, case["valid"].as_bool().unwrap(), "{}", case["name"]);
    }
    let response = protocol::PluginResponse::Success {
        request_id: "r".into(),
        value: Value::Null,
    };
    assert_eq!(
        serde_json::to_value(response).unwrap(),
        serde_json::json!({"requestId":"r","ok":true,"value":null})
    );
}

#[test]
fn web_manifest_roundtrip_preserves_optional_field_absence() {
    let value: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/example.manifest.json"
    ))
    .unwrap();
    let manifest: protocol::PluginManifestV2 = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(manifest).unwrap(), value);
    let report = compatibility::check_manifest(&value);
    let wire = serde_json::to_value(report).unwrap();
    assert!(wire.get("hostVersion").is_some());
    assert!(wire.get("host_version").is_none());
}

#[test]
fn shared_capability_manifest_corpus() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/capability-manifests.json"
    ))
    .unwrap();
    for case in cases {
        let report = protocol::check_web_manifest(&case["manifest"], "0.2.3", "1.2.0", "macos");
        let valid = !report
            .issues
            .iter()
            .any(|issue| issue.code == "manifest.invalid");
        if valid {
            let parsed: protocol::PluginManifestV2 =
                serde_json::from_value(case["manifest"].clone()).unwrap();
            assert_eq!(serde_json::to_value(parsed).unwrap(), case["manifest"]);
        }
        assert_eq!(valid, case["valid"].as_bool().unwrap(), "{}", case["name"]);
    }
}

#[test]
fn shared_capability_comparison_corpus() {
    use zero_lib::plugins::capabilities::{
        compare_capabilities, HostCapability, RequiredCapability,
    };
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/capabilities.json"
    ))
    .unwrap();
    for case in cases {
        let required: Vec<RequiredCapability> =
            serde_json::from_value(case["required"].clone()).unwrap();
        let providers: Vec<HostCapability> =
            serde_json::from_value(case["providers"].clone()).unwrap();
        let report = compare_capabilities(&required, &providers);
        assert_eq!(
            report.compatible,
            case["compatible"].as_bool().unwrap(),
            "{}",
            case["name"]
        );
        let codes: Vec<_> = report
            .issues
            .iter()
            .map(|issue| issue.code.as_str())
            .collect();
        let expected: Vec<_> = case["codes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(codes, expected, "{}", case["name"]);
        if report.compatible {
            assert_eq!(report.capabilities, providers);
        }
        for issue in report.issues.iter().filter(|issue| {
            issue.code == "capability.missing" || issue.code == "capability.incompatible"
        }) {
            let index: usize = issue.path.rsplit('.').next().unwrap().parse().unwrap();
            assert_eq!(issue.required.as_ref(), Some(&required[index].version));
            assert_eq!(
                issue.actual.as_ref(),
                providers.first().map(|provider| &provider.version)
            );
        }
    }
}

#[test]
fn required_provider_is_not_inferred_from_runtime_or_plugin_identity() {
    let mut value: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-protocol/example.manifest.json"
    ))
    .unwrap();
    value["requiredCapabilities"] =
        serde_json::json!([{ "id": "host.power", "version": "^1.0.0" }]);
    let report = protocol::check_web_manifest(&value, "0.2.3", "1.2.0", "macos");
    assert!(!report.compatible);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "capability.missing"));
    let report = protocol::check_web_manifest_with_capabilities(
        &value,
        "0.2.3",
        "1.2.0",
        "macos",
        &[zero_lib::plugins::capabilities::HostCapability {
            id: "host.power".into(),
            version: "1.0.0".into(),
        }],
    );
    assert!(report.compatible);
    assert!(!protocol::PUBLIC_WEB_RUNTIME_ENABLED);
}
