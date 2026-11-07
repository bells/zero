use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileConversionDirection {
    PdfToDocx,
    DocxToPdf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileConversionProviderId {
    ZeroFilePdfToDocx,
    ZeroFileDocxToPdfMacos,
    ZeroFileDocxToPdfWindows,
    LibreOffice,
    MicrosoftWordMacos,
    MicrosoftWordWindows,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileConversionProviderOrigin {
    BuiltIn,
    Compatibility,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileConversionQualityProfile {
    EditableReconstruction,
    LayoutPreserving,
    WebRenderedPdf,
    CompatibilityProvider,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileConversionErrorCode {
    InvalidInput,
    UnsupportedFormat,
    DuplicateSource,
    EngineUnavailable,
    EngineVersionUnsupported,
    AutomationPermissionDenied,
    ProviderActivationFailed,
    PasswordRequired,
    OcrRequired,
    UnsupportedInput,
    PermissionDenied,
    Timeout,
    Cancelled,
    OutputConflict,
    OutputNotWritable,
    ProviderFailed,
    InvalidProviderOutput,
    OutputMissing,
    UnknownJob,
    InvalidJobState,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionError {
    pub code: FileConversionErrorCode,
    pub message: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<FileConversionProviderId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub quality_issues: Vec<FileConversionQualityIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileConversionProviderAvailability {
    Available,
    Unavailable { error: FileConversionError },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionProvider {
    pub id: FileConversionProviderId,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub origin: FileConversionProviderOrigin,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_minimum: Option<String>,
    pub quality_profiles: Vec<FileConversionQualityProfile>,
    pub directions: Vec<FileConversionDirection>,
    pub availability: FileConversionProviderAvailability,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionDirectionCapability {
    pub direction: FileConversionDirection,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_provider_id: Option<FileConversionProviderId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preferred_provider_id: Option<FileConversionProviderId>,
    pub providers: Vec<FileConversionProvider>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailability: Option<FileConversionError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionCapabilitySnapshot {
    #[serde(default)]
    pub preference_revision: u64,
    #[serde(default)]
    pub capability_revision: u64,
    #[serde(default)]
    pub invalid_preference_directions: Vec<FileConversionDirection>,
    pub directions: Vec<FileConversionDirectionCapability>,
    pub refreshed_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum FileConversionCandidateValidation {
    Valid {
        direction: FileConversionDirection,
        proposed_output_name: String,
    },
    Rejected {
        error: FileConversionError,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionCandidate {
    pub source_path: String,
    pub source_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    pub validation: FileConversionCandidateValidation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileConversionEnqueueItem {
    pub source_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_directory: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileConversionEnqueueRequest {
    pub items: Vec<FileConversionEnqueueItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileConversionInspectRequest {
    pub source_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileConversionJobRequest {
    pub job_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileConversionProviderSelectionRequest {
    pub direction: FileConversionDirection,
    pub provider_id: FileConversionProviderId,
    pub expected_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileConversionRetryRequest {
    pub job_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<FileConversionProviderId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileConversionStage {
    Validating,
    WaitingForProvider,
    Converting,
    Finalizing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileConversionProgress {
    Indeterminate {
        stage: FileConversionStage,
    },
    Percentage {
        stage: FileConversionStage,
        percent: u8,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionResult {
    pub output_path: String,
    pub output_name: String,
    pub size_bytes: u64,
    pub completed_at_ms: u64,
    pub provider_id: FileConversionProviderId,
    pub provider_origin: FileConversionProviderOrigin,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_version: Option<String>,
    pub quality_profile: FileConversionQualityProfile,
    pub warning_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub quality_issues: Vec<FileConversionQualityIssue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_count: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum FileConversionJobState {
    Queued,
    Preparing { stage: FileConversionStage },
    Running { progress: FileConversionProgress },
    Completed { result: FileConversionResult },
    Failed { error: FileConversionError },
    Cancelled { error: FileConversionError },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionJobSnapshot {
    #[serde(default)]
    pub queue_revision: u64,
    #[serde(default)]
    pub revision: u64,
    pub id: String,
    pub source_path: String,
    pub source_name: String,
    pub size_bytes: u64,
    pub direction: FileConversionDirection,
    pub target_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<FileConversionProviderId>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub state: FileConversionJobState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionBatchResult {
    pub jobs: Vec<FileConversionJobSnapshot>,
    pub rejected_candidates: Vec<FileConversionCandidate>,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn serializes_running_job_state_as_a_camel_case_discriminated_union() {
        let state = FileConversionJobState::Running {
            progress: FileConversionProgress::Percentage {
                stage: FileConversionStage::Converting,
                percent: 42,
            },
        };

        assert_eq!(
            serde_json::to_value(state).unwrap(),
            json!({
                "status": "running",
                "progress": {
                    "kind": "percentage",
                    "stage": "converting",
                    "percent": 42
                }
            })
        );
    }

    #[test]
    fn serializes_structured_errors_without_absent_optional_diagnostics() {
        let error = FileConversionError {
            code: FileConversionErrorCode::EngineVersionUnsupported,
            message: "The detected provider version is not supported.".into(),
            retryable: false,
            provider_id: Some(FileConversionProviderId::LibreOffice),
            diagnostic: None,
            quality_issues: Vec::new(),
        };

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            json!({
                "code": "engineVersionUnsupported",
                "message": "The detected provider version is not supported.",
                "retryable": false,
                "providerId": "libreOffice"
            })
        );
    }

    #[test]
    fn deserializes_explicit_enqueue_items() {
        let request: FileConversionEnqueueRequest = serde_json::from_value(json!({
            "items": [
                {
                    "sourcePath": "/tmp/report.pdf",
                    "outputDirectory": "/tmp/converted"
                }
            ]
        }))
        .unwrap();

        assert_eq!(request.items.len(), 1);
        assert_eq!(request.items[0].source_path, "/tmp/report.pdf");
        assert_eq!(
            request.items[0].output_directory.as_deref(),
            Some("/tmp/converted")
        );
    }

    #[test]
    fn provider_selection_and_retry_serialize_only_known_identity_and_revision() {
        let request: FileConversionProviderSelectionRequest = serde_json::from_value(
            json!({"direction":"docxToPdf","providerId":"libreOffice","expectedRevision":7}),
        )
        .unwrap();
        assert_eq!(request.expected_revision, 7);
        assert_eq!(
            serde_json::to_value(request).unwrap(),
            json!({"direction":"docxToPdf","providerId":"libreOffice","expectedRevision":7})
        );
        let legacy: FileConversionRetryRequest =
            serde_json::from_value(json!({"jobId":"one"})).unwrap();
        assert_eq!(legacy.provider_id, None);
        let explicit: FileConversionRetryRequest =
            serde_json::from_value(json!({"jobId":"one","providerId":"microsoftWordMacos"}))
                .unwrap();
        assert_eq!(
            explicit.provider_id,
            Some(FileConversionProviderId::MicrosoftWordMacos)
        );
        assert!(serde_json::from_value::<FileConversionRetryRequest>(
            json!({"jobId":"one","providerId":"/tmp/provider.exe"})
        )
        .is_err());
        assert!(serde_json::from_value::<FileConversionProviderSelectionRequest>(json!({"direction":"docxToPdf","providerId":"libreOffice","expectedRevision":7,"sourcePath":"/tmp/private.docx"})).is_err());
    }

    #[test]
    fn rejects_missing_fields_unknown_result_paths_and_invalid_enums() {
        assert!(
            serde_json::from_value::<FileConversionEnqueueRequest>(json!({
                "items": [{ "outputDirectory": "/tmp" }]
            }))
            .is_err()
        );
        assert!(serde_json::from_value::<FileConversionJobRequest>(json!({
            "jobId": "job-1",
            "resultPath": "/tmp/arbitrary.pdf"
        }))
        .is_err());
        assert!(serde_json::from_value::<FileConversionDirection>(json!("pdfToWord")).is_err());
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileConversionQualityIssue {
    pub code: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub page_numbers: Vec<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub section_indexes: Vec<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub font_families: Vec<String>,
    pub occurrences: u64,
    pub truncated: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFontInspection {
    pub available_families: Vec<String>,
    pub missing_families: Vec<String>,
    pub embedded_families: Vec<String>,
    pub incomplete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionQueueSnapshot {
    pub revision: u64,
    pub jobs: Vec<FileConversionJobSnapshot>,
}
