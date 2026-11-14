use base64::{engine::general_purpose::STANDARD, Engine};
use zero_lib::plugins::publisher::{
    official_package_signature_payload, verify_official_package, OfficialPackageSignature,
    TrustedPublisher,
};

#[test]
fn shared_publisher_json_contracts_verify_only_the_matching_synthetic_package() {
    let fixtures: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/plugin-publisher/signatures.json"
    ))
    .unwrap();
    let authority = &fixtures["trustedPublisher"];
    let public_key: [u8; 32] = STANDARD
        .decode(authority["publicKey"].as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    let trusted = [TrustedPublisher {
        key_id: authority["keyId"].as_str().unwrap().into(),
        public_key,
        allowed_plugin_ids: authority["allowedPluginIds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|id| id.as_str().unwrap().to_owned())
            .collect(),
    }];
    let expected = &fixtures["expectedPackage"];
    for fixture in fixtures["cases"].as_array().unwrap() {
        let result =
            serde_json::from_value::<OfficialPackageSignature>(fixture["envelope"].clone());
        let verified = match result {
            Ok(envelope) => {
                assert_eq!(
                    serde_json::to_value(&envelope).unwrap(),
                    fixture["envelope"]
                );
                let verified = verify_official_package(
                    Some(&envelope),
                    expected["pluginId"].as_str().unwrap(),
                    expected["pluginVersion"].as_str().unwrap(),
                    expected["sha256"].as_str().unwrap(),
                    &trusted,
                )
                .is_ok();
                if verified {
                    let payload_hex: String = official_package_signature_payload(&envelope)
                        .unwrap()
                        .iter()
                        .map(|byte| format!("{byte:02x}"))
                        .collect();
                    assert_eq!(payload_hex, fixtures["payloadHex"].as_str().unwrap());
                }
                verified
            }
            Err(_) => false,
        };
        assert_eq!(
            verified,
            fixture["verified"].as_bool().unwrap(),
            "{}",
            fixture["name"]
        );
    }
}
