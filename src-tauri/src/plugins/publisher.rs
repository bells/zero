use std::{collections::HashSet, fmt};

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

use super::versions::is_protocol_version;

const SIGNATURE_DOMAIN: &[u8] = b"zero.official-plugin-package\0";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfficialPackageSignature {
    pub schema_version: u32,
    pub key_id: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub sha256: String,
    pub signature: String,
}

/// Host-distributed authority. Package metadata and installation origin are not trust inputs.
#[derive(Debug, Clone)]
pub struct TrustedPublisher {
    pub key_id: String,
    pub public_key: [u8; 32],
    pub allowed_plugin_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PublisherConfig {
    key_id: String,
    public_key: String,
    allowed_plugin_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TrustConfig {
    schema_version: u32,
    publishers: Vec<PublisherConfig>,
}

/// Only public release authority compiled into the host is trusted.
pub fn trusted_publishers() -> Result<Vec<TrustedPublisher>, PublisherVerificationError> {
    parse_trusted_publishers(include_str!("../../plugin-publishers.json"))
}

pub fn parse_trusted_publishers(
    json: &str,
) -> Result<Vec<TrustedPublisher>, PublisherVerificationError> {
    let config: TrustConfig = serde_json::from_str(json)
        .map_err(|_| PublisherVerificationError::InvalidTrustConfiguration)?;
    if config.schema_version != 1 || config.publishers.len() > 32 {
        return Err(PublisherVerificationError::InvalidTrustConfiguration);
    }
    let mut keys = HashSet::new();
    config
        .publishers
        .into_iter()
        .map(|publisher| {
            let invalid = || PublisherVerificationError::InvalidTrustConfiguration;
            if !valid_key_id(&publisher.key_id)
                || !keys.insert(publisher.key_id.clone())
                || publisher.allowed_plugin_ids.is_empty()
                || publisher.allowed_plugin_ids.len() > 64
            {
                return Err(invalid());
            }
            let mut ids = HashSet::new();
            if publisher
                .allowed_plugin_ids
                .iter()
                .any(|id| !valid_plugin_id(id) || !id.starts_with("zero.") || !ids.insert(id))
            {
                return Err(invalid());
            }
            let bytes = STANDARD
                .decode(&publisher.public_key)
                .map_err(|_| invalid())?;
            if STANDARD.encode(&bytes) != publisher.public_key {
                return Err(invalid());
            }
            let public_key: [u8; 32] = bytes.try_into().map_err(|_| invalid())?;
            let key = VerifyingKey::from_bytes(&public_key).map_err(|_| invalid())?;
            if key.is_weak() {
                return Err(invalid());
            }
            Ok(TrustedPublisher {
                key_id: publisher.key_id,
                public_key,
                allowed_plugin_ids: publisher.allowed_plugin_ids,
            })
        })
        .collect()
}

pub fn verify_web_package_authority(
    plugin_id: &str,
    version: &str,
    measured_sha256: &str,
    envelope: Option<&OfficialPackageSignature>,
) -> Result<(), PublisherVerificationError> {
    if plugin_id.starts_with("zero.") {
        verify_official_package(
            envelope,
            plugin_id,
            version,
            measured_sha256,
            &trusted_publishers()?,
        )?;
    }
    Ok(())
}

pub fn verify_package_authority(
    report: &super::contracts::PluginPackageValidationReport,
    envelope: Option<&OfficialPackageSignature>,
) -> Result<(), PublisherVerificationError> {
    if let Some(manifest) = &report.protocol_manifest {
        return verify_web_package_authority(
            &manifest.id,
            &manifest.version,
            &report.sha256,
            envelope,
        );
    }
    if report.manifest.as_ref().is_some_and(|manifest| {
        manifest.name.starts_with("zero.")
            && !(manifest.name == "zero.file" && manifest.first_party_engine.is_some())
    }) {
        return Err(PublisherVerificationError::MissingAuthority);
    }
    Ok(())
}

pub fn read_signature_sidecar(path: &std::path::Path) -> Result<OfficialPackageSignature, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|_| {
        "Official package needs its .zplugin.signature.json sidecar beside the archive".to_string()
    })?;
    let metadata = file
        .metadata()
        .map_err(|_| "Cannot inspect publisher signature".to_string())?;
    if !metadata.is_file() || metadata.len() > 16 * 1024 {
        return Err("Publisher signature must be a file of at most 16 KiB".into());
    }
    let mut bytes = Vec::new();
    file.take(16 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read publisher signature".to_string())?;
    if bytes.len() > 16 * 1024 {
        return Err("Publisher signature exceeds 16 KiB".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid publisher signature sidecar".into())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PublisherVerificationError {
    MissingAuthority,
    UnsupportedSchema,
    InvalidKeyId,
    InvalidIdentity,
    InvalidVersion,
    InvalidDigest,
    PackageMismatch,
    UnknownKey,
    UnauthorizedPlugin,
    InvalidTrustConfiguration,
    InvalidSignature,
}

impl fmt::Display for PublisherVerificationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::MissingAuthority => "Official package publisher authority is required",
            Self::UnsupportedSchema => "Unsupported official package signature schema",
            Self::InvalidKeyId => "Invalid publisher key identity",
            Self::InvalidIdentity => "Invalid package identity",
            Self::InvalidVersion => "Invalid package SemVer",
            Self::InvalidDigest => "Expected a lowercase hexadecimal SHA-256 digest",
            Self::PackageMismatch => "Publisher signature does not match the measured package",
            Self::UnknownKey => "Publisher key is not trusted by this host",
            Self::UnauthorizedPlugin => "Publisher key is not authorized for this exact plugin ID",
            Self::InvalidTrustConfiguration => "Invalid publisher trust configuration",
            Self::InvalidSignature => "Invalid official package publisher signature",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for PublisherVerificationError {}

/// Proof of package identity only; it carries no session or permission authority.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedOfficialPackage {
    key_id: String,
    plugin_id: String,
    plugin_version: String,
    sha256: String,
}

impl VerifiedOfficialPackage {
    pub fn key_id(&self) -> &str {
        &self.key_id
    }
    pub fn plugin_id(&self) -> &str {
        &self.plugin_id
    }
    pub fn plugin_version(&self) -> &str {
        &self.plugin_version
    }
    pub fn sha256(&self) -> &str {
        &self.sha256
    }
}

/// V1 wire payload: ASCII domain including NUL, u32-BE schema version, then
/// key ID, plugin ID and version as u32-BE byte length + exact UTF-8 bytes,
/// followed by the fixed 32 raw SHA-256 bytes. No JSON serialization or signature
/// bytes are included. String grammar and bounds are validated before encoding.
pub fn official_package_signature_payload(
    envelope: &OfficialPackageSignature,
) -> Result<Vec<u8>, PublisherVerificationError> {
    if envelope.schema_version != 1 {
        return Err(PublisherVerificationError::UnsupportedSchema);
    }
    if !valid_key_id(&envelope.key_id) {
        return Err(PublisherVerificationError::InvalidKeyId);
    }
    validate_identity_version(&envelope.plugin_id, &envelope.plugin_version)?;
    let digest = decode_digest(&envelope.sha256)?;
    let mut payload = SIGNATURE_DOMAIN.to_vec();
    payload.extend_from_slice(&envelope.schema_version.to_be_bytes());
    for value in [
        &envelope.key_id,
        &envelope.plugin_id,
        &envelope.plugin_version,
    ] {
        payload.extend_from_slice(&(value.len() as u32).to_be_bytes());
        payload.extend_from_slice(value.as_bytes());
    }
    payload.extend_from_slice(&digest);
    Ok(payload)
}

/// Expected identity/version must come from the validated archive manifest and
/// digest from the actual archive bytes, rather than the market entry's claims.
pub fn verify_official_package(
    envelope: Option<&OfficialPackageSignature>,
    expected_plugin_id: &str,
    expected_plugin_version: &str,
    measured_sha256: &str,
    trusted_publishers: &[TrustedPublisher],
) -> Result<VerifiedOfficialPackage, PublisherVerificationError> {
    let envelope = envelope.ok_or(PublisherVerificationError::MissingAuthority)?;
    let payload = official_package_signature_payload(envelope)?;
    validate_identity_version(expected_plugin_id, expected_plugin_version)?;
    decode_digest(measured_sha256)?;
    if envelope.plugin_id != expected_plugin_id
        || envelope.plugin_version != expected_plugin_version
        || envelope.sha256 != measured_sha256
    {
        return Err(PublisherVerificationError::PackageMismatch);
    }

    let mut key_ids = HashSet::new();
    for publisher in trusted_publishers {
        if !valid_key_id(&publisher.key_id) || !key_ids.insert(&publisher.key_id) {
            return Err(PublisherVerificationError::InvalidTrustConfiguration);
        }
    }
    let publisher = trusted_publishers
        .iter()
        .find(|publisher| publisher.key_id == envelope.key_id)
        .ok_or(PublisherVerificationError::UnknownKey)?;
    if !publisher
        .allowed_plugin_ids
        .iter()
        .any(|id| id == expected_plugin_id)
    {
        return Err(PublisherVerificationError::UnauthorizedPlugin);
    }
    let key = VerifyingKey::from_bytes(&publisher.public_key)
        .map_err(|_| PublisherVerificationError::InvalidTrustConfiguration)?;
    if key.is_weak() {
        return Err(PublisherVerificationError::InvalidTrustConfiguration);
    }
    if envelope.signature.len() != 88 {
        return Err(PublisherVerificationError::InvalidSignature);
    }
    let bytes = STANDARD
        .decode(&envelope.signature)
        .map_err(|_| PublisherVerificationError::InvalidSignature)?;
    if STANDARD.encode(&bytes) != envelope.signature {
        return Err(PublisherVerificationError::InvalidSignature);
    }
    let signature =
        Signature::from_slice(&bytes).map_err(|_| PublisherVerificationError::InvalidSignature)?;
    key.verify_strict(&payload, &signature)
        .map_err(|_| PublisherVerificationError::InvalidSignature)?;
    Ok(VerifiedOfficialPackage {
        key_id: envelope.key_id.clone(),
        plugin_id: envelope.plugin_id.clone(),
        plugin_version: envelope.plugin_version.clone(),
        sha256: envelope.sha256.clone(),
    })
}

fn valid_key_id(value: &str) -> bool {
    (1..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

fn valid_plugin_id(value: &str) -> bool {
    (2..=64).contains(&value.len())
        && value
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
        })
}

fn validate_identity_version(id: &str, version: &str) -> Result<(), PublisherVerificationError> {
    if !valid_plugin_id(id) {
        return Err(PublisherVerificationError::InvalidIdentity);
    }
    if version.len() > 256 || !is_protocol_version(version) {
        return Err(PublisherVerificationError::InvalidVersion);
    }
    Ok(())
}

fn decode_digest(value: &str) -> Result<[u8; 32], PublisherVerificationError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(PublisherVerificationError::InvalidDigest);
    }
    let mut digest = [0; 32];
    for (index, byte) in digest.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .map_err(|_| PublisherVerificationError::InvalidDigest)?;
    }
    Ok(digest)
}
