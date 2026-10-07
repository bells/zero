// Design-only DTO subset, not compiled into the application.
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckPluginCompatibilityInput {
    pub manifest: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompatibilityProfile {
    Legacy,
    WebV1,
    Bundled,
}

#[derive(Debug, Serialize)]
pub enum CompatibilityCode {
    #[serde(rename = "manifest.invalid")]
    ManifestInvalid,
    #[serde(rename = "schema.unsupported")]
    SchemaUnsupported,
    #[serde(rename = "host.incompatible")]
    HostIncompatible,
    #[serde(rename = "api.incompatible")]
    ApiIncompatible,
    #[serde(rename = "platform.unsupported")]
    PlatformUnsupported,
    #[serde(rename = "runtime.unsupported")]
    RuntimeUnsupported,
    #[serde(rename = "permission.unsupported")]
    PermissionUnsupported,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityIssue {
    pub code: CompatibilityCode,
    pub path: String,
    pub message: String,
    pub required: Option<String>,
    pub actual: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReport {
    pub compatible: bool,
    pub profile: CompatibilityProfile,
    pub host_version: String,
    pub api_version: Option<String>,
    pub issues: Vec<CompatibilityIssue>,
}

#[derive(Debug, Serialize)]
pub struct PluginError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}
