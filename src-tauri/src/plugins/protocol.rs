use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

use super::capabilities::{
    compare_capabilities, valid_capability_id, HostCapability, RequiredCapability,
};
use super::versions::{is_protocol_version, protocol_range, protocol_version_matches};

pub const API_VERSION: &str = "1.0.0";
// This is a conformance target, not a release approval.
pub const PUBLIC_WEB_RUNTIME_ENABLED: bool = false;

pub fn web_runtime_enabled() -> bool {
    PUBLIC_WEB_RUNTIME_ENABLED
        || (cfg!(all(debug_assertions, target_os = "macos"))
            && std::env::var("ZERO_PLUGIN_WEB_DEV").as_deref() == Ok("1"))
}

macro_rules! dto {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? }) => {
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        pub struct $name { $(pub $field: $ty),* }
    };
}

dto!(PluginEnginesV2 {
    zero: String,
    api: String
});
dto!(NetworkScope { allowed_origins: Vec<String> });
dto!(PluginBackground { main: String, events: Vec<String> });
dto!(ViewContribution {
    id: String,
    title: String,
    surface: ViewSurface
});
dto!(CommandContribution {
    id: String,
    title: String,
    view_id: String
});
dto!(KeybindingContribution {
    command: String,
    default: String,
    description: String
});
dto!(StatusBarContribution {
    id: String,
    title: String,
    command: String,
    icon: String,
    visible_by_default: bool
});

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewSurface {
    Main,
    Tray,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum SettingContribution {
    Boolean {
        key: String,
        default: bool,
        label: String,
    },
    String {
        key: String,
        default: String,
        label: String,
    },
    Number {
        key: String,
        default: f64,
        label: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContributionsV2 {
    pub views: Vec<ViewContribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<CommandContribution>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keybindings: Option<Vec<KeybindingContribution>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_bar_items: Option<Vec<StatusBarContribution>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<Vec<SettingContribution>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifestV2 {
    #[serde(deserialize_with = "schema_integer")]
    pub schema_version: u16,
    pub name: String,
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub engines: PluginEnginesV2,
    pub platforms: Vec<String>,
    pub runtime: String,
    pub main: String,
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<NetworkScope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_capabilities: Option<Vec<RequiredCapability>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<PluginBackground>,
    pub contributes: ContributionsV2,
    pub activation_events: Vec<String>,
}

dto!(CompatibilityIssue {
    code: String, path: String, message: String, required: Option<String>, actual: Option<String>
});
dto!(CompatibilityReport {
    compatible: bool, profile: String, host_version: String,
    api_version: Option<String>, issues: Vec<CompatibilityIssue>
});
dto!(CheckPluginCompatibilityInput { manifest: Value });
dto!(PluginError {
    code: String,
    message: String,
    retryable: bool
});
dto!(SessionBinding {
    session_id: String,
    generation: u64
});
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginSessionInfo {
    pub session_id: String,
    pub generation: u64,
    pub plugin_id: String,
    pub plugin_version: String,
    pub api_version: String,
    pub surface_id: String,
    pub registry_revision: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<BackgroundEventContext>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackgroundEventContext {
    #[serde(deserialize_with = "schedule_identifier")]
    pub task_id: String,
    #[serde(deserialize_with = "background_event_identifier")]
    pub event_id: String,
    #[serde(deserialize_with = "occurrence_identifier")]
    pub occurrence_id: String,
    #[serde(deserialize_with = "background_attempt")]
    pub attempt: u32,
    #[serde(deserialize_with = "background_payload")]
    pub payload: Value,
    #[serde(deserialize_with = "positive_integer")]
    pub schedule_generation: u64,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScheduleUpsertInput {
    #[serde(deserialize_with = "schedule_identifier")]
    pub task_id: String,
    #[serde(deserialize_with = "background_event_identifier")]
    pub event_id: String,
    #[serde(deserialize_with = "safe_integer")]
    pub next_at_ms: u64,
    #[serde(deserialize_with = "background_payload")]
    pub payload: Value,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScheduleCancelInput {
    #[serde(deserialize_with = "schedule_identifier")]
    pub task_id: String,
}
fn schedule_identifier<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let id = String::deserialize(d)?;
    if id.is_empty()
        || id.len() > 128
        || matches!(id.as_str(), "." | "..")
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return Err(serde::de::Error::custom("invalid task identifier"));
    }
    Ok(id)
}
fn background_event_identifier<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let id = String::deserialize(d)?;
    if !valid_capability_id(&id) {
        return Err(serde::de::Error::custom("invalid event identifier"));
    }
    Ok(id)
}
fn occurrence_identifier<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let id = String::deserialize(d)?;
    if id.len() != 32
        || !id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(serde::de::Error::custom("invalid occurrence identifier"));
    }
    Ok(id)
}
fn background_attempt<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    let value = u32::deserialize(d)?;
    if !(1..=32).contains(&value) {
        return Err(serde::de::Error::custom("invalid attempt"));
    }
    Ok(value)
}
fn positive_integer<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let value = safe_integer(d)?;
    if value == 0 {
        return Err(serde::de::Error::custom("invalid generation"));
    }
    Ok(value)
}
fn background_payload<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Value, D::Error> {
    let payload = Value::deserialize(d)?;
    super::scheduler::validate_schedule(&super::scheduler::Schedule {
        task_id: "payload".into(),
        event_id: "payload".into(),
        next_at_ms: 0,
        payload: payload.clone(),
    })
    .map_err(|_| serde::de::Error::custom("background payload limit"))?;
    Ok(payload)
}
dto!(ScheduleUpsertOutput { generation: u64 });
dto!(ScheduleCancelOutput { cancelled: bool });
dto!(BackgroundCompleteOutput { generation: Option<u64> });
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundOutcome {
    Completed,
    Retry,
    Failed,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackgroundCompleteInput {
    pub outcome: BackgroundOutcome,
    #[serde(deserialize_with = "nullable_time")]
    pub next_at_ms: Option<u64>,
}
fn nullable_time<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<u64>, D::Error> {
    let value = Option::<u64>::deserialize(d)?;
    if value.is_some_and(|n| n > 9_007_199_254_740_991) {
        return Err(serde::de::Error::custom("unsafe time"));
    }
    Ok(value)
}
dto!(MessageInput { message: String });
dto!(StorageGetInput { key: String });
dto!(StorageCompareAndSetInput {
    key: String,
    expected_value: Value,
    value: Value
});
dto!(StorageSetInput {
    key: String,
    value: Value
});
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerAcquireInput {
    #[serde(deserialize_with = "nullable_duration")]
    pub duration_minutes: Option<u32>,
}
fn nullable_duration<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<u32>, D::Error> {
    Option::<u32>::deserialize(deserializer)
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerReleaseInput {
    pub lease_id: String,
    #[serde(deserialize_with = "safe_integer")]
    pub generation: u64,
}
dto!(PowerStatusInput {});
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum PowerTaskSchedule {
    Unlimited,
    Duration {
        minutes: u32,
    },
    Until {
        #[serde(rename = "expiresAtMs", deserialize_with = "safe_integer")]
        expires_at_ms: u64,
    },
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerTaskConditions {
    #[serde(deserialize_with = "nullable_duration")]
    pub battery_threshold_percent: Option<u32>,
    pub stop_on_low_power_mode: bool,
    pub allow_low_battery_start: bool,
}
fn nullable_generation<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<u64>, D::Error> {
    let value = Option::<u64>::deserialize(d)?;
    if value.is_some_and(|n| n == 0 || n > 9_007_199_254_740_991) {
        return Err(serde::de::Error::custom("unsafe generation"));
    }
    Ok(value)
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerStartTaskInput {
    #[serde(deserialize_with = "nullable_generation")]
    pub expected_generation: Option<u64>,
    #[serde(deserialize_with = "nullable_generation")]
    pub expected_conditions_revision: Option<u64>,
    pub schedule: PowerTaskSchedule,
    pub conditions: PowerTaskConditions,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerStopTaskInput {
    #[serde(deserialize_with = "safe_integer")]
    pub generation: u64,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerUpdateTaskConditionsInput {
    #[serde(deserialize_with = "safe_integer")]
    pub generation: u64,
    #[serde(deserialize_with = "safe_integer")]
    pub expected_conditions_revision: u64,
    pub conditions: PowerTaskConditions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicationCatalogPageInput {
    #[serde(deserialize_with = "opaque_token")]
    pub catalog_id: String,
    #[serde(deserialize_with = "catalog_offset")]
    pub offset: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicationActivateInput {
    #[serde(deserialize_with = "opaque_token")]
    pub catalog_id: String,
    #[serde(deserialize_with = "opaque_token")]
    pub item_id: String,
}

fn opaque_token<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(serde::de::Error::custom(
            "Expected an opaque resource token",
        ));
    }
    Ok(value)
}

pub(crate) const MAX_APPLICATION_CATALOG_ITEMS: usize = 4096;

fn catalog_offset<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<usize, D::Error> {
    let offset = safe_integer(deserializer)?;
    if offset > MAX_APPLICATION_CATALOG_ITEMS as u64 {
        return Err(serde::de::Error::custom(
            "Application catalog offset exceeds the limit",
        ));
    }
    Ok(offset as usize)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureExportAction {
    Copy,
    Save,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenCaptureIdInput {
    #[serde(deserialize_with = "opaque_token")]
    pub capture_id: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenPinCaptureInput {
    #[serde(deserialize_with = "opaque_token")]
    pub capture_id: String,
    pub pinned: bool,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenPrepareCaptureExportInput {
    #[serde(deserialize_with = "opaque_token")]
    pub capture_id: String,
    pub action: CaptureExportAction,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenCommitCaptureExportInput {
    #[serde(deserialize_with = "opaque_token")]
    pub lease_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentIdInput {
    #[serde(deserialize_with = "opaque_token")]
    pub id: String,
}

dto!(MediaCacheInput { url: String });
dto!(MediaAssetInput { asset_id: String });
dto!(MediaPreviewReleaseInput { lease_id: String });
dto!(MediaExportInput {
    asset_id: String,
    suggested_name: String
});
dto!(WallpaperPrepareInput {
    asset_id: String,
    claim_id: String
});
dto!(WallpaperIntentInput { intent_id: String });

dto!(NetworkFetchInput {
    url: String,
    method: GetMethod
});

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GetMethod {
    GET,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "method", content = "payload", deny_unknown_fields)]
pub enum PluginMethod {
    #[serde(rename = "screen.openSystemCapture")]
    ScreenOpenSystem(PowerStatusInput),
    #[serde(rename = "screen.captureDisplay")]
    ScreenCaptureDisplay(PowerStatusInput),
    #[serde(rename = "screen.releaseCapture")]
    ScreenReleaseCapture(ScreenCaptureIdInput),
    #[serde(rename = "screen.setCapturePinned")]
    ScreenSetCapturePinned(ScreenPinCaptureInput),
    #[serde(rename = "screen.prepareCaptureExport")]
    ScreenPrepareCaptureExport(ScreenPrepareCaptureExportInput),
    #[serde(rename = "screen.commitCaptureExport")]
    ScreenCommitCaptureExport(ScreenCommitCaptureExportInput),
    #[serde(rename = "documents.chooseInput")]
    DocumentChoose(PowerStatusInput),
    #[serde(rename = "documents.start")]
    DocumentStart(DocumentIdInput),
    #[serde(rename = "documents.status")]
    DocumentStatus(DocumentIdInput),
    #[serde(rename = "documents.cancel")]
    DocumentCancel(DocumentIdInput),
    #[serde(rename = "documents.reveal")]
    DocumentReveal(DocumentIdInput),
    #[serde(rename = "apps.scan")]
    ApplicationScan(PowerStatusInput),
    #[serde(rename = "apps.page")]
    ApplicationPage(ApplicationCatalogPageInput),
    #[serde(rename = "apps.activate")]
    ApplicationActivate(ApplicationActivateInput),
    #[serde(rename = "media.cacheImage")]
    MediaCache(MediaCacheInput),
    #[serde(rename = "media.preview")]
    MediaPreview(MediaAssetInput),
    #[serde(rename = "media.releasePreview")]
    MediaReleasePreview(MediaPreviewReleaseInput),
    #[serde(rename = "media.exportImage")]
    MediaExport(MediaExportInput),
    #[serde(rename = "wallpaper.platform")]
    WallpaperPlatform(PowerStatusInput),
    #[serde(rename = "wallpaper.prepare")]
    WallpaperPrepare(WallpaperPrepareInput),
    #[serde(rename = "wallpaper.apply")]
    WallpaperApply(WallpaperIntentInput),
    #[serde(rename = "wallpaper.cancelPrepared")]
    WallpaperCancel(WallpaperIntentInput),
    #[serde(rename = "wallpaper.recover")]
    WallpaperRecover(PowerStatusInput),
    #[serde(rename = "schedule.upsert")]
    ScheduleUpsert(ScheduleUpsertInput),
    #[serde(rename = "schedule.cancel")]
    ScheduleCancel(ScheduleCancelInput),
    #[serde(rename = "background.complete")]
    BackgroundComplete(BackgroundCompleteInput),
    #[serde(rename = "ui.showMessage")]
    ShowMessage(MessageInput),
    #[serde(rename = "diagnostics.emit")]
    DiagnosticsEmit(crate::services::diagnostics::contracts::EmitInput),
    #[serde(rename = "storage.get")]
    StorageGet(StorageGetInput),
    #[serde(rename = "storage.set")]
    StorageSet(StorageSetInput),
    #[serde(rename = "storage.compareAndSet")]
    StorageCompareAndSet(StorageCompareAndSetInput),
    #[serde(rename = "network.fetch")]
    NetworkFetch(NetworkFetchInput),
    #[serde(rename = "power.acquire")]
    PowerAcquire(PowerAcquireInput),
    #[serde(rename = "power.release")]
    PowerRelease(PowerReleaseInput),
    #[serde(rename = "power.status")]
    PowerStatus(PowerStatusInput),
    #[serde(rename = "power.startTask")]
    PowerStartTask(PowerStartTaskInput),
    #[serde(rename = "power.taskStatus")]
    PowerTaskStatus(PowerStatusInput),
    #[serde(rename = "power.stopTask")]
    PowerStopTask(PowerStopTaskInput),
    #[serde(rename = "power.updateTaskConditions")]
    PowerUpdateTaskConditions(PowerUpdateTaskConditionsInput),
    #[serde(rename = "power.readSnapshot")]
    PowerReadSnapshot(PowerStatusInput),
}

impl PluginMethod {
    pub(crate) fn additional_permissions(&self) -> &[&str] {
        match self {
            Self::ApplicationActivate(_) => &["system.apps.read", "system.window.focus"],
            _ => &[],
        }
    }

    pub(crate) fn view_only(&self) -> bool {
        matches!(
            self,
            Self::ShowMessage(_)
                | Self::MediaPreview(_)
                | Self::MediaReleasePreview(_)
                | Self::MediaExport(_)
                | Self::WallpaperRecover(_)
                | Self::ScreenOpenSystem(_)
                | Self::ScreenCaptureDisplay(_)
                | Self::ScreenReleaseCapture(_)
                | Self::ScreenSetCapturePinned(_)
                | Self::ScreenPrepareCaptureExport(_)
                | Self::ScreenCommitCaptureExport(_)
                | Self::DocumentChoose(_)
                | Self::DocumentStart(_)
                | Self::DocumentStatus(_)
                | Self::DocumentCancel(_)
                | Self::DocumentReveal(_)
                | Self::ApplicationScan(_)
                | Self::ApplicationPage(_)
                | Self::ApplicationActivate(_)
        )
    }

    pub fn permission(&self) -> &'static str {
        match self {
            Self::ScreenOpenSystem(_)
            | Self::ScreenCaptureDisplay(_)
            | Self::ScreenReleaseCapture(_)
            | Self::ScreenSetCapturePinned(_)
            | Self::ScreenPrepareCaptureExport(_)
            | Self::ScreenCommitCaptureExport(_) => "screen.capture",
            Self::DocumentChoose(_)
            | Self::DocumentStart(_)
            | Self::DocumentStatus(_)
            | Self::DocumentCancel(_)
            | Self::DocumentReveal(_) => "documents.convert",
            Self::ApplicationScan(_) | Self::ApplicationPage(_) => "system.apps.read",
            Self::ApplicationActivate(_) => "system.apps.execute",
            Self::ScheduleUpsert(_) | Self::ScheduleCancel(_) | Self::BackgroundComplete(_) => {
                "background.schedule"
            }
            Self::ShowMessage(_) => "ui.message",
            Self::DiagnosticsEmit(_) => "diagnostics.write",
            Self::StorageGet(_) | Self::StorageSet(_) | Self::StorageCompareAndSet(_) => {
                "storage.plugin"
            }
            Self::NetworkFetch(_)
            | Self::MediaCache(_)
            | Self::MediaPreview(_)
            | Self::MediaReleasePreview(_) => "network",
            Self::MediaExport(_) => "files.export",
            Self::WallpaperPlatform(_)
            | Self::WallpaperPrepare(_)
            | Self::WallpaperApply(_)
            | Self::WallpaperCancel(_)
            | Self::WallpaperRecover(_) => "system.wallpaper",
            Self::PowerAcquire(_)
            | Self::PowerRelease(_)
            | Self::PowerStatus(_)
            | Self::PowerStartTask(_)
            | Self::PowerTaskStatus(_)
            | Self::PowerStopTask(_)
            | Self::PowerUpdateTaskConditions(_)
            | Self::PowerReadSnapshot(_) => "power.preventSleep",
        }
    }
}

// Keep the transport envelope and tagged method separate: flatten +
// deny_unknown_fields cannot reliably validate both layers in serde.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginRequest {
    pub protocol_version: String,
    pub request_id: String,
    pub session_id: String,
    #[serde(deserialize_with = "safe_integer")]
    pub generation: u64,
    pub method: String,
    pub payload: Value,
}
fn safe_integer<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let value = Value::deserialize(d)?;
    let number = value
        .as_f64()
        .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 9_007_199_254_740_991.0 && n.fract() == 0.0)
        .ok_or_else(|| serde::de::Error::custom("Expected a nonnegative safe integer"))?;
    Ok(number as u64)
}
fn schema_integer<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u16, D::Error> {
    let value = safe_integer(d)?;
    u16::try_from(value).map_err(|_| serde::de::Error::custom("Invalid schema integer"))
}
dto!(PluginInvokeInput {
    request: PluginRequest
});

impl PluginRequest {
    pub fn decode_method(&self) -> Result<PluginMethod, String> {
        if self.protocol_version != API_VERSION
            || !wire_identifier(&self.request_id)
            || !wire_identifier(&self.session_id)
            || self.generation > 9_007_199_254_740_991
        {
            return Err("Invalid protocol envelope".into());
        }
        if !json_depth_valid(&self.payload, 0) {
            return Err("JSON nesting exceeds limit".into());
        }
        serde_json::from_value(serde_json::json!({"method":self.method,"payload":self.payload}))
            .map_err(|error| error.to_string())
    }
}

fn wire_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}

fn json_depth_valid(value: &Value, depth: usize) -> bool {
    if depth > 33 {
        return false;
    }
    match value {
        Value::Array(values) => values.iter().all(|v| json_depth_valid(v, depth + 1)),
        Value::Object(values) => values.values().all(|v| json_depth_valid(v, depth + 1)),
        _ => true,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum PluginResponse {
    Success {
        request_id: String,
        value: Value,
    },
    Failure {
        request_id: String,
        error: PluginError,
    },
}

impl Serialize for PluginResponse {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Success { request_id, value } => {
                serde_json::json!({"requestId":request_id,"ok":true,"value":value})
            }
            Self::Failure { request_id, error } => {
                serde_json::json!({"requestId":request_id,"ok":false,"error":error})
            }
        }
        .serialize(serializer)
    }
}

pub fn issue(code: &str, path: &str, message: impl Into<String>) -> CompatibilityIssue {
    CompatibilityIssue {
        code: code.into(),
        path: path.into(),
        message: message.into(),
        required: None,
        actual: None,
    }
}

pub fn check_web_manifest(
    value: &Value,
    host: &str,
    api: &str,
    platform: &str,
) -> CompatibilityReport {
    check_web_manifest_with_capabilities(value, host, api, platform, &[])
}

pub fn check_web_manifest_with_capabilities(
    value: &Value,
    host: &str,
    api: &str,
    platform: &str,
    providers: &[HostCapability],
) -> CompatibilityReport {
    let mut report = CompatibilityReport {
        compatible: false,
        profile: "web-v1".into(),
        host_version: host.into(),
        api_version: Some(api.into()),
        issues: Vec::new(),
    };
    // Optional means absent, not null. Keep serde's Option permissiveness from
    // diverging from the author-facing JSON Schema.
    let null_optional = ["network", "requiredCapabilities", "background"]
        .iter()
        .any(|key| value.get(key).is_some_and(Value::is_null))
        || ["commands", "keybindings", "statusBarItems", "settings"]
            .iter()
            .any(|key| {
                value
                    .get("contributes")
                    .and_then(|c| c.get(key))
                    .is_some_and(Value::is_null)
            });
    if null_optional {
        report.issues.push(issue(
            "manifest.invalid",
            "",
            "Optional fields must be omitted rather than null",
        ));
        return report;
    }
    let manifest: PluginManifestV2 = match serde_json::from_value(value.clone()) {
        Ok(manifest) => manifest,
        Err(error) => {
            report
                .issues
                .push(issue("manifest.invalid", "", error.to_string()));
            return report;
        }
    };
    report.issues.extend(validate_web_manifest(&manifest));
    if report.issues.is_empty() {
        report.issues.extend(
            compare_capabilities(
                manifest
                    .required_capabilities
                    .as_deref()
                    .unwrap_or_default(),
                providers,
            )
            .issues,
        );
    }
    for (path, required, actual, code) in [
        (
            "engines.zero",
            manifest.engines.zero.as_str(),
            host,
            "host.incompatible",
        ),
        (
            "engines.api",
            manifest.engines.api.as_str(),
            api,
            "api.incompatible",
        ),
    ] {
        if !protocol_version_matches(actual, required) {
            report.issues.push(CompatibilityIssue {
                required: Some(required.into()),
                actual: Some(actual.into()),
                ..issue(code, path, "Version does not satisfy the required range")
            });
        }
    }
    if !manifest.platforms.iter().any(|p| p == platform) {
        report.issues.push(issue(
            "platform.unsupported",
            "platforms",
            "Plugin does not support this platform",
        ));
    }
    report.compatible = report.issues.is_empty();
    report
}

pub fn validate_web_manifest(m: &PluginManifestV2) -> Vec<CompatibilityIssue> {
    let mut issues = Vec::new();
    let mut check = |condition: bool, path: &str, message: &str| {
        if !condition {
            issues.push(issue("manifest.invalid", path, message));
        }
    };
    check(
        m.schema_version == 2,
        "schemaVersion",
        "Expected schemaVersion 2",
    );
    check(
        valid_id(&m.name) && m.id == m.name,
        "id",
        "Expected a canonical plugin identity",
    );
    check(
        bounded_text(&m.display_name, 256)
            && bounded_text(&m.author, 256)
            && bounded_text(&m.description, 1024),
        "displayName",
        "Metadata must be non-empty and bounded",
    );
    check(
        m.version.len() <= 256 && is_protocol_version(&m.version),
        "version",
        "Expected strict SemVer",
    );
    check(
        m.engines.zero.len() <= 256 && protocol_range(&m.engines.zero).is_some(),
        "engines.zero",
        "Expected a bounded protocol range",
    );
    check(
        m.engines.api.len() <= 256 && protocol_range(&m.engines.api).is_some(),
        "engines.api",
        "Expected a bounded protocol range",
    );
    check(
        m.runtime == "webview",
        "runtime",
        "Only webview is supported",
    );
    check(
        safe_path(&m.main) && m.main.ends_with(".html"),
        "main",
        "Expected a safe packaged HTML path",
    );
    check(
        !m.platforms.is_empty()
            && unique(&m.platforms)
            && m.platforms
                .iter()
                .all(|p| matches!(p.as_str(), "macos" | "windows" | "linux")),
        "platforms",
        "Invalid platform list",
    );
    check(
        unique(&m.permissions)
            && m.permissions.iter().all(|p| {
                matches!(
                    p.as_str(),
                    "storage.plugin"
                        | "ui.message"
                        | "network"
                        | "diagnostics.write"
                        | "power.preventSleep"
                        | "background.schedule"
                        | "system.wallpaper"
                        | "files.export"
                        | "system.apps.read"
                        | "system.apps.execute"
                        | "system.window.focus"
                        | "screen.capture"
                        | "documents.convert"
                )
            }),
        "permissions",
        "Unsupported or duplicate public permission",
    );
    let network_requested = m.permissions.iter().any(|p| p == "network");
    check(
        network_requested == m.network.is_some(),
        "network",
        "Network scope must match the network permission",
    );
    if let Some(scope) = &m.network {
        check(
            !scope.allowed_origins.is_empty()
                && scope.allowed_origins.len() <= 32
                && unique(&scope.allowed_origins)
                && scope.allowed_origins.iter().all(|s| valid_origin(s)),
            "network.allowedOrigins",
            "Expected exact HTTPS origins",
        );
    }
    if let Some(required) = &m.required_capabilities {
        let mut ids = HashSet::new();
        check(
            required.len() <= 64,
            "requiredCapabilities",
            "Too many required capabilities",
        );
        for capability in required {
            check(
                valid_capability_id(&capability.id)
                    && ids.insert(&capability.id)
                    && capability.version.len() <= 256
                    && protocol_range(&capability.version).is_some(),
                "requiredCapabilities",
                "Invalid, duplicate or unbounded capability requirement",
            );
        }
    }
    if let Some(background) = &m.background {
        check(
            safe_path(&background.main)
                && !background.main.chars().any(char::is_control)
                && background.main.ends_with(".js"),
            "background.main",
            "Expected a safe packaged JavaScript path",
        );
        check(
            !background.events.is_empty()
                && background.events.len() <= 64
                && unique(&background.events)
                && background.events.iter().all(|id| valid_capability_id(id)),
            "background.events",
            "Expected bounded unique event identifiers",
        );
    }
    let c = &m.contributes;
    let mut ids = HashSet::new();
    let prefix = format!("{}.", m.id);
    let mut contribution_id = |id: &str| {
        id.starts_with(&prefix)
            && id.len() <= 128
            && id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c))
            && ids.insert(id.to_string())
    };
    check(
        !c.views.is_empty() && c.views.len() <= 8,
        "contributes.views",
        "Expected 1 to 8 views",
    );
    for view in &c.views {
        check(
            contribution_id(&view.id) && bounded_text(&view.title, 256),
            "contributes.views",
            "Invalid or duplicate view",
        );
    }
    let views: HashSet<_> = c.views.iter().map(|v| v.id.as_str()).collect();
    let commands = c.commands.as_deref().unwrap_or_default();
    check(
        commands.len() <= 64,
        "contributes.commands",
        "Too many commands",
    );
    for command in commands {
        check(
            contribution_id(&command.id)
                && bounded_text(&command.title, 256)
                && views.contains(command.view_id.as_str()),
            "contributes.commands",
            "Invalid command or view reference",
        );
    }
    let command_ids: HashSet<_> = commands.iter().map(|v| v.id.as_str()).collect();
    let keys = c.keybindings.as_deref().unwrap_or_default();
    check(
        keys.len() <= 64,
        "contributes.keybindings",
        "Too many keybindings",
    );
    let mut key_ids = HashSet::new();
    for key in keys {
        check(
            command_ids.contains(key.command.as_str())
                && key_ids.insert(&key.command)
                && bounded_text(&key.default, 128)
                && bounded_text(&key.description, 256),
            "contributes.keybindings",
            "Invalid keybinding or command reference",
        );
    }
    let status = c.status_bar_items.as_deref().unwrap_or_default();
    check(
        status.len() <= 8,
        "contributes.statusBarItems",
        "Too many status items",
    );
    for item in status {
        check(
            contribution_id(&item.id)
                && bounded_text(&item.title, 256)
                && item.icon == "extension"
                && !item.visible_by_default
                && command_ids.contains(item.command.as_str()),
            "contributes.statusBarItems",
            "Invalid status contribution",
        );
    }
    let settings = c.settings.as_deref().unwrap_or_default();
    check(
        settings.len() <= 64,
        "contributes.settings",
        "Too many settings",
    );
    let mut setting_ids = HashSet::new();
    for setting in settings {
        let (key, label) = match setting {
            SettingContribution::Boolean { key, label, .. }
            | SettingContribution::String { key, label, .. }
            | SettingContribution::Number { key, label, .. } => (key, label),
        };
        check(
            bounded_text(key, 128) && setting_ids.insert(key) && bounded_text(label, 256),
            "contributes.settings",
            "Invalid or duplicate setting",
        );
    }
    check(
        !m.activation_events.is_empty()
            && m.activation_events.len() <= 64
            && unique(&m.activation_events),
        "activationEvents",
        "Expected bounded unique activation events",
    );
    for event in &m.activation_events {
        let valid = event
            .strip_prefix("onView:")
            .is_some_and(|id| views.contains(id))
            || event
                .strip_prefix("onCommand:")
                .is_some_and(|id| command_ids.contains(id));
        check(
            valid,
            "activationEvents",
            "Activation event references an undeclared contribution",
        );
    }
    issues
}

fn bounded_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}
fn unique(values: &[String]) -> bool {
    values.iter().collect::<HashSet<_>>().len() == values.len()
}
fn valid_id(value: &str) -> bool {
    (2..=64).contains(&value.len())
        && value
            .bytes()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c))
}
pub fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && value.chars().count() <= 512
        && value.trim() == value
        && !value.contains(['\\', '\0', ':', '%', '?', '#'])
        && value
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}
pub fn valid_origin(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    value.len() <= 2048
        && url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.origin().ascii_serialization() == value
        && !value.contains('*')
}

dto!(PluginRegistrySnapshot { revision: u64, records: Vec<super::contracts::PluginRecord> });
dto!(PluginRegistryChanged { revision: u64, plugin_ids: Vec<String>, reason: String });
