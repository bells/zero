use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};
use zero_lib::plugins::publisher::{
    official_package_signature_payload, verify_official_package, OfficialPackageSignature,
    PublisherVerificationError as Error, TrustedPublisher,
};

const DIGEST: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

// Public, synthetic fixture seed; never use this key to authorize real releases.
fn signing_key() -> SigningKey {
    SigningKey::from_bytes(&[42; 32])
}

fn payload() -> Vec<u8> {
    let mut bytes = b"zero.official-plugin-package\0\0\0\0\x01\0\0\0\x08test-key\0\0\0\x0azero.awake\0\0\0\x051.2.3".to_vec();
    bytes.extend_from_slice(&[
        0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae, 0x22,
        0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00,
        0x15, 0xad,
    ]);
    bytes
}

fn envelope() -> OfficialPackageSignature {
    OfficialPackageSignature {
        schema_version: 1,
        key_id: "test-key".into(),
        plugin_id: "zero.awake".into(),
        plugin_version: "1.2.3".into(),
        sha256: DIGEST.into(),
        signature: STANDARD.encode(signing_key().sign(&payload()).to_bytes()),
    }
}

fn trust() -> Vec<TrustedPublisher> {
    vec![TrustedPublisher {
        key_id: "test-key".into(),
        public_key: signing_key().verifying_key().to_bytes(),
        allowed_plugin_ids: vec!["zero.awake".into()],
    }]
}

fn verify(value: &OfficialPackageSignature) -> Result<(), Error> {
    verify_official_package(Some(value), "zero.awake", "1.2.3", DIGEST, &trust()).map(|_| ())
}

#[test]
fn accepts_a_real_signature_over_the_fixed_versioned_wire_payload() {
    let measured = format!("{:x}", Sha256::digest(b"abc"));
    let value = envelope();
    let verified =
        verify_official_package(Some(&value), "zero.awake", "1.2.3", &measured, &trust()).unwrap();
    assert_eq!(verified.plugin_id(), "zero.awake");
    assert_eq!(verified.plugin_version(), "1.2.3");
    assert_eq!(verified.sha256(), DIGEST);
    assert_eq!(verified.key_id(), "test-key");
    assert_eq!(
        official_package_signature_payload(&value).unwrap(),
        payload()
    );
}

#[test]
fn rejects_missing_authority_even_for_an_official_name() {
    assert_eq!(
        verify_official_package(None, "zero.awake", "1.2.3", DIGEST, &trust()),
        Err(Error::MissingAuthority)
    );
    assert_eq!(
        verify_official_package(Some(&envelope()), "zero.awake", "1.2.3", DIGEST, &[]),
        Err(Error::UnknownKey)
    );
}

#[test]
fn binds_signature_to_the_actual_package_identity_version_and_measured_bytes() {
    for (id, version, digest) in [
        ("zero.paper", "1.2.3", DIGEST.to_owned()),
        ("zero.awake", "1.2.4", DIGEST.to_owned()),
        (
            "zero.awake",
            "1.2.3",
            format!("{:x}", Sha256::digest(b"abd")),
        ),
    ] {
        assert_eq!(
            verify_official_package(Some(&envelope()), id, version, &digest, &trust()),
            Err(Error::PackageMismatch)
        );
    }
}

#[test]
fn refuses_tampered_signed_fields_even_when_expected_package_matches() {
    for field in ["keyId", "pluginId", "pluginVersion", "sha256"] {
        let mut value = envelope();
        let mut publishers = trust();
        match field {
            "keyId" => {
                value.key_id = "test-alt".into();
                publishers[0].key_id = value.key_id.clone();
            }
            "pluginId" => {
                value.plugin_id = "zero.paper".into();
                publishers[0]
                    .allowed_plugin_ids
                    .push(value.plugin_id.clone());
            }
            "pluginVersion" => value.plugin_version = "1.2.4".into(),
            "sha256" => value.sha256 = "ab".repeat(32),
            _ => unreachable!(),
        }
        assert_eq!(
            verify_official_package(
                Some(&value),
                &value.plugin_id,
                &value.plugin_version,
                &value.sha256,
                &publishers
            ),
            Err(Error::InvalidSignature),
            "{field}"
        );
    }
}

#[test]
fn keys_are_authorized_only_for_exact_plugin_ids() {
    for allowed in [
        vec![],
        vec!["zero.*".into()],
        vec!["zero.paper".into()],
        vec!["zero.awake.extra".into()],
    ] {
        let mut publishers = trust();
        publishers[0].allowed_plugin_ids = allowed;
        assert_eq!(
            verify_official_package(
                Some(&envelope()),
                "zero.awake",
                "1.2.3",
                DIGEST,
                &publishers
            ),
            Err(Error::UnauthorizedPlugin)
        );
    }
}

#[test]
fn rejects_unknown_schema_key_wrong_key_and_ambiguous_trust_configuration() {
    let mut value = envelope();
    value.schema_version = 2;
    assert_eq!(verify(&value), Err(Error::UnsupportedSchema));
    value = envelope();
    value.key_id = "unknown".into();
    assert_eq!(verify(&value), Err(Error::UnknownKey));
    let mut publishers = trust();
    publishers[0].public_key = SigningKey::from_bytes(&[43; 32]).verifying_key().to_bytes();
    assert_eq!(
        verify_official_package(
            Some(&envelope()),
            "zero.awake",
            "1.2.3",
            DIGEST,
            &publishers
        ),
        Err(Error::InvalidSignature)
    );
    publishers = trust();
    publishers.push(publishers[0].clone());
    assert_eq!(
        verify_official_package(
            Some(&envelope()),
            "zero.awake",
            "1.2.3",
            DIGEST,
            &publishers
        ),
        Err(Error::InvalidTrustConfiguration)
    );
}

#[test]
fn rejects_noncanonical_digest_version_and_identity_before_verification() {
    for digest in [
        "",
        "sha256:abc",
        &"a".repeat(63),
        &"g".repeat(64),
        &DIGEST.to_uppercase(),
    ] {
        let mut value = envelope();
        value.sha256 = digest.into();
        assert_eq!(verify(&value), Err(Error::InvalidDigest));
        assert_eq!(
            verify_official_package(Some(&envelope()), "zero.awake", "1.2.3", digest, &trust()),
            Err(Error::InvalidDigest)
        );
    }
    for version in [
        "1.2",
        "v1.2.3",
        "01.2.3",
        " 1.2.3",
        "1.2.3\n",
        "9007199254740992.0.0",
    ] {
        let mut value = envelope();
        value.plugin_version = version.into();
        assert_eq!(verify(&value), Err(Error::InvalidVersion));
        assert_eq!(
            verify_official_package(Some(&envelope()), "zero.awake", version, DIGEST, &trust()),
            Err(Error::InvalidVersion)
        );
    }
    for id in ["", "zero.*", "Zero.awake", "zero.awake\0", "../zero.awake"] {
        let mut value = envelope();
        value.plugin_id = id.into();
        assert_eq!(verify(&value), Err(Error::InvalidIdentity));
        assert_eq!(
            verify_official_package(Some(&envelope()), id, "1.2.3", DIGEST, &trust()),
            Err(Error::InvalidIdentity)
        );
    }
}

#[test]
fn rejects_invalid_signature_encoding_size_and_signature_bytes() {
    for signature in [
        "!".into(),
        "".into(),
        STANDARD.encode([0; 63]),
        STANDARD.encode([0; 64]),
        format!("{}\n", envelope().signature),
        envelope().signature.trim_end_matches('=').into(),
    ] {
        let mut value = envelope();
        value.signature = signature;
        assert_eq!(verify(&value), Err(Error::InvalidSignature));
    }
}

#[test]
fn rejects_signatures_from_another_protocol_domain() {
    let mut value = envelope();
    let mut other_payload = b"zero.file-engine-package\0".to_vec();
    other_payload.extend_from_slice(&payload()[b"zero.official-plugin-package\0".len()..]);
    value.signature = STANDARD.encode(signing_key().sign(&other_payload).to_bytes());
    assert_eq!(verify(&value), Err(Error::InvalidSignature));
}

#[test]
fn rejects_weak_or_invalid_authority_keys() {
    let mut publishers = trust();
    publishers[0].public_key = [0; 32];
    assert_eq!(
        verify_official_package(
            Some(&envelope()),
            "zero.awake",
            "1.2.3",
            DIGEST,
            &publishers
        ),
        Err(Error::InvalidTrustConfiguration)
    );
    publishers[0].key_id = "key/one".into();
    assert_eq!(
        verify_official_package(
            Some(&envelope()),
            "zero.awake",
            "1.2.3",
            DIGEST,
            &publishers
        ),
        Err(Error::InvalidTrustConfiguration)
    );
}

#[test]
fn rejects_malformed_key_ids_and_unknown_or_duplicate_envelope_fields() {
    for id in ["", "key/one", "key\0one", " key", &"a".repeat(129)] {
        let mut value = envelope();
        value.key_id = id.into();
        assert_eq!(verify(&value), Err(Error::InvalidKeyId));
    }
    let mut json = serde_json::to_value(envelope()).unwrap();
    json["official"] = true.into();
    assert!(serde_json::from_value::<OfficialPackageSignature>(json).is_err());
    let duplicate =
        serde_json::to_string(&envelope())
            .unwrap()
            .replacen("{", "{\"schemaVersion\":1,", 1);
    assert!(serde_json::from_str::<OfficialPackageSignature>(&duplicate).is_err());
}

#[test]
fn valid_publisher_identity_does_not_grant_session_permissions() {
    use std::time::Instant;
    use zero_lib::plugins::{
        protocol::PluginRequest,
        session::{SessionOwner, Sessions},
    };
    let verified =
        verify_official_package(Some(&envelope()), "zero.awake", "1.2.3", DIGEST, &trust())
            .unwrap();
    let owner = SessionOwner {
        plugin_id: verified.plugin_id().into(),
        version: verified.plugin_version().into(),
        digest: verified.sha256().into(),
        root: std::env::temp_dir().join("publisher-test"),
        view_id: "main".into(),
        revision: 1,
        permissions: vec![],
    };
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let info = sessions.issue(owner.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let request: PluginRequest = serde_json::from_value(serde_json::json!({"protocolVersion":"1.0.0","requestId":"r1","sessionId":info.session_id,"generation":info.generation,"method":"storage.set","payload":{"key":"notes","value":"hello"}})).unwrap();
    assert_eq!(
        sessions
            .begin(&caller, &request, &owner, true, now)
            .unwrap_err()
            .code,
        "permission.denied"
    );
}
