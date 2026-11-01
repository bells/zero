use super::{error, BingWallpaperError};
use crate::services::native_resources::write_plugin_file;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(super) const STATE_FILE: &str = "paper-state.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PaperSettings {
    pub version: u8,
    pub auto_change_daily: bool,
}
impl Default for PaperSettings {
    fn default() -> Self {
        Self {
            version: 1,
            auto_change_daily: false,
        }
    }
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaperSettingsUpdate {
    pub auto_change_daily: bool,
}
#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PaperAutomationPhase {
    #[default]
    Off,
    Idle,
    Checking,
    Applying,
    PausedForManual,
    RetryWaiting,
    Unsupported,
    Error,
}
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperRuntimeSnapshot {
    pub revision: u32,
    pub phase: PaperAutomationPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_checked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_successful_refresh_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_available_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_applied_wallpaper_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_applied_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_applied_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manual_override_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_check_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BingWallpaperError>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Applied {
    pub(super) wallpaper_id: String,
    pub(super) publication_date: Option<String>,
    pub(super) applied_at: DateTime<Utc>,
    pub(super) origin: String,
    pub(super) slot: u8,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApplyIntent {
    pub(super) wallpaper_id: String,
    pub(super) slot: u8,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Stored {
    pub(super) schema_version: u8,
    pub(super) settings: PaperSettings,
    pub(super) last_applied: Option<Applied>,
    pub(super) manual_override_until: Option<DateTime<Utc>>,
    pub(super) pending_intent: Option<ApplyIntent>,
    #[serde(default)]
    pub(super) recovery_slot: Option<u8>,
    #[serde(default)]
    pub(super) owned_slots: [bool; 3],
}
impl Default for Stored {
    fn default() -> Self {
        Self {
            schema_version: 1,
            settings: PaperSettings::default(),
            last_applied: None,
            manual_override_until: None,
            pending_intent: None,
            recovery_slot: None,
            owned_slots: [false; 3],
        }
    }
}
pub(super) fn load(root: &Path) -> Result<Stored, BingWallpaperError> {
    let path = root.join(STATE_FILE);
    // resolve_plugin_file rejects symlinks and paths outside the owner root.
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.file_type().is_symlink() || meta.len() > 64 * 1024 {
            return Err(error(
                "paper.state_invalid",
                "Paper safety state is invalid; the original file was preserved.",
                false,
            ));
        }
    }
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Stored::default()),
        Err(e) => {
            return Err(error(
                "paper.state_read",
                format!("Cannot read Paper settings: {e}"),
                false,
            ))
        }
    };
    let data: Stored = serde_json::from_slice(&bytes).map_err(|_| {
        error(
            "paper.state_invalid",
            "Paper settings are corrupt or use an unknown version. Original data was preserved.",
            false,
        )
    })?;
    if data.schema_version != 1
        || data.settings.version != 1
        || data.last_applied.as_ref().is_some_and(|a| a.slot > 2)
        || data.pending_intent.as_ref().is_some_and(|i| i.slot > 2)
        || data.recovery_slot.is_some_and(|slot| slot > 2)
    {
        return Err(error(
            "paper.state_version",
            "Paper settings use an unsupported version. Original data was preserved.",
            false,
        ));
    }
    Ok(data)
}
pub(super) fn persist(root: &Path, data: &Stored) -> Result<(), BingWallpaperError> {
    let bytes = serde_json::to_vec_pretty(data)
        .map_err(|e| error("paper.state_encode", e.to_string(), false))?;
    write_plugin_file(root, STATE_FILE, &bytes, 64 * 1024).map_err(BingWallpaperError::from)?;
    Ok(())
}
pub(super) async fn save(root: PathBuf, data: Stored) -> Result<(), BingWallpaperError> {
    tauri::async_runtime::spawn_blocking(move || persist(&root, &data))
        .await
        .map_err(|_| error("paper.state_worker", "Paper settings worker stopped.", true))?
}
