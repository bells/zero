use super::{screenshot_error, ScreenshotError};
use crate::services::performance::PerformanceTrace;

pub fn entry(app: &tauri::AppHandle, entry: &'static str) {
    let phase = match entry {
        "menu" => "snap_entry:menu",
        "shortcut" => "snap_entry:shortcut",
        "tray" => "snap_entry:tray",
        _ => "snap_entry:main",
    };
    if let Some(trace) = app
        .try_state::<PerformanceTrace>()
        .filter(|t| t.emits_logs())
    {
        trace.mark(phase, "triggered");
    }
}
use serde::Deserialize;
use std::time::Duration;
use tauri::Manager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FrontendStage {
    Mount,
    MediaRead,
    ImageDecode,
    DisplayDecode,
    ReadyAck,
}
impl FrontendStage {
    fn phase(&self) -> &'static str {
        match self {
            Self::Mount => "snap_startup:frontend_mount",
            Self::MediaRead => "snap_startup:media_read",
            Self::ImageDecode => "snap_startup:image_decode",
            Self::DisplayDecode => "snap_startup:display_decode",
            Self::ReadyAck => "snap_startup:ready_ack",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrontendMeasurement {
    pub session_id: String,
    pub stage: FrontendStage,
    pub duration_us: u64,
}

pub fn record_frontend(
    app: &tauri::AppHandle,
    label: &str,
    input: FrontendMeasurement,
) -> Result<(), ScreenshotError> {
    super::require_capture_window(label)?;
    super::validate_session(app, Some(&input.session_id))?;
    if input.duration_us > 60_000_000 {
        return Err(screenshot_error(
            "screenshot.measurement",
            "Invalid capture measurement",
            false,
        ));
    }
    if let Some(trace) = app
        .try_state::<PerformanceTrace>()
        .filter(|t| t.emits_logs())
    {
        trace.record_duration(
            input.stage.phase(),
            "ok",
            Duration::from_micros(input.duration_us),
        );
    }
    Ok(())
}

pub(super) fn measure<T, E>(
    app: &tauri::AppHandle,
    phase: &'static str,
    work: impl FnOnce() -> Result<T, E>,
) -> Result<T, E> {
    let trace = app.try_state::<PerformanceTrace>();
    let started = std::time::Instant::now();
    let result = work();
    if let Some(trace) = trace.filter(|t| t.emits_logs()) {
        trace.finish(phase, if result.is_ok() { "ok" } else { "error" }, started);
    }
    result
}

pub(super) fn begin(app: &tauri::AppHandle) {
    if let Some(trace) = app
        .try_state::<PerformanceTrace>()
        .filter(|t| t.emits_logs())
    {
        trace.begin_pending("snap_startup:trigger_to_reveal");
    }
}
pub(super) fn finish(app: &tauri::AppHandle, outcome: &'static str) {
    if let Some(trace) = app
        .try_state::<PerformanceTrace>()
        .filter(|t| t.emits_logs())
    {
        trace.finish_pending("snap_startup:trigger_to_reveal", outcome);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_content_and_unknown_measurement_phases() {
        assert!(serde_json::from_str::<FrontendMeasurement>(
            r#"{"sessionId":"s","stage":"window title","durationUs":1}"#
        )
        .is_err());
        assert!(serde_json::from_str::<FrontendMeasurement>(
            r#"{"sessionId":"s","stage":"mount","durationUs":1,"text":"private"}"#
        )
        .is_err());
    }
}
