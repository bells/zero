use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Level {
    Info,
    Warn,
    Error,
    Debug,
    Trace,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Started,
    Succeeded,
    Failed,
    Cancelled,
    Unsupported,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Host,
    Native,
    Frontend,
    Engine,
    Extension,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PersistenceStatus {
    Healthy,
    MemoryOnly,
    Degraded,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    Normal,
    Verbose,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SupportTarget {
    Github,
    Website,
    Issues,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewCopyInput {
    pub preview_id: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModeInput {
    pub mode: Mode,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupportLinkInput {
    pub target: SupportTarget,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Backend {
    Macos,
    Windows,
    Unsupported,
    BuiltIn,
    Compatibility,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SafeMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend: Option<Backend>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_hit: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_fallback: Option<bool>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmitInput {
    pub level: Level,
    pub code: String,
    pub phase: String,
    pub outcome: Outcome,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrontendInput {
    pub plugin_id: Option<String>,
    pub event: EmitInput,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    pub schema_version: u32,
    pub timestamp: String,
    pub level: Level,
    pub source: Source,
    pub plugin_id: Option<String>,
    pub code: String,
    pub phase: String,
    pub outcome: Outcome,
    pub run_id: String,
    pub operation_id: Option<String>,
    pub metadata: SafeMetadata,
    pub repeat_count: u32,
    pub storage_epoch: u32,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutInfo {
    pub app_name: String,
    pub app_version: String,
    pub github_url: String,
    pub website_url: String,
    pub issues_url: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsError {
    pub code: String,
    pub message_key: String,
    pub retryable: bool,
}
impl DiagnosticsError {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.into(),
            message_key: format!("diagnostics.error.{code}"),
            retryable: !matches!(code, "callerDenied" | "invalidInput"),
        }
    }
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsStatus {
    pub persistence: PersistenceStatus,
    pub dropped_events: u32,
    pub mode: Mode,
    pub verbose_remaining_seconds: u32,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsPreview {
    pub schema_version: u32,
    pub preview_id: String,
    pub generated_at: String,
    pub persistence: PersistenceStatus,
    pub dropped_events: u32,
    pub truncated: bool,
    pub omissions: Vec<String>,
    pub text: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthState {
    Ready,
    Active,
    Disabled,
    NotInitialized,
    Unsupported,
    Degraded,
    Unknown,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub state: HealthState,
    pub metadata: SafeMetadata,
    pub providers: Vec<ProviderSnapshot>,
}
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Provider {
    ZeroFilePdfToDocx,
    ZeroFileDocxToPdfMacos,
    LibreOffice,
    MicrosoftWordMacos,
    MicrosoftWordWindows,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub provider: Provider,
    pub available: bool,
    pub version: Option<String>,
    pub engine_version: Option<String>,
    pub package_version: Option<String>,
}
impl HealthSnapshot {
    pub fn state(state: HealthState) -> Self {
        Self {
            state,
            metadata: SafeMetadata::default(),
            providers: Vec::new(),
        }
    }
}
