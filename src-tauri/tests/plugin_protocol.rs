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
