use crate::services::ocr::{OcrCapability, OcrError, OcrPageResult, OcrRect, OcrState};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

const EVENT: &str = "zero://snap-ocr-changed";
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapOcrSnapshot {
    pub job_id: String,
    pub revision: u64,
    pub status: String,
    pub result: Option<OcrPageResult>,
    pub error: Option<OcrError>,
    pub expires_at_ms: u64,
}
struct Job {
    snapshot: SnapOcrSnapshot,
    cancel: Arc<AtomicBool>,
}
#[derive(Default)]
pub struct SnapOcrState {
    job: Mutex<Option<Job>>,
}
impl SnapOcrState {
    pub fn clear(&self) {
        if let Ok(mut job) = self.job.lock() {
            if let Some(old) = job.take() {
                old.cancel.store(true, Ordering::Release);
            }
        }
    }
    pub fn cancel(&self) {
        if let Ok(mut job) = self.job.lock() {
            if let Some(job) = job.as_mut().filter(|j| j.snapshot.status == "recognizing") {
                job.cancel.store(true, Ordering::Release);
                job.snapshot.status = "cancelled".into();
                job.snapshot.revision += 1;
            }
        }
    }
    fn complete(&self, id: &str, result: Result<OcrPageResult, OcrError>) {
        if let Ok(mut job) = self.job.lock() {
            if let Some(job) = job
                .as_mut()
                .filter(|job| job.snapshot.job_id == id && job.snapshot.status == "recognizing")
            {
                job.snapshot.revision += 1;
                match result {
                    Ok(result) => {
                        job.snapshot.status = "completed".into();
                        job.snapshot.result = Some(result);
                    }
                    Err(error) => {
                        job.snapshot.status = "failed".into();
                        job.snapshot.error = Some(error);
                    }
                }
            }
        }
    }
    pub fn expire(&self) {
        if let Ok(mut job) = self.job.lock() {
            if job
                .as_ref()
                .is_some_and(|job| job.snapshot.expires_at_ms <= super::now_ms())
            {
                if let Some(job) = job.take() {
                    job.cancel.store(true, Ordering::Release);
                }
            }
        }
    }
    fn snapshot(&self) -> Result<Option<SnapOcrSnapshot>, OcrError> {
        let mut job = self.job.lock().map_err(|_| OcrError::ProviderUnavailable)?;
        if job
            .as_ref()
            .is_some_and(|j| j.snapshot.expires_at_ms <= super::now_ms())
        {
            if let Some(old) = job.take() {
                old.cancel.store(true, Ordering::Release);
            }
        }
        Ok(job.as_ref().map(|j| j.snapshot.clone()))
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartSnapOcrInput {
    session_id: String,
    selection: OcrRect,
    languages: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrJobHandle {
    job_id: String,
}

fn main_caller(window: &tauri::WebviewWindow) -> Result<(), OcrError> {
    if window.label() == "main"
        && crate::plugin_is_enabled(window.app_handle(), crate::brand::ZERO_SNAP_PLUGIN_ID)
    {
        Ok(())
    } else {
        Err(OcrError::Unauthorized)
    }
}
pub async fn get_ocr_capability(window: tauri::WebviewWindow) -> Result<OcrCapability, OcrError> {
    if !matches!(window.label(), "main" | "tray" | "capture") {
        return Err(OcrError::Unauthorized);
    }
    tauri::async_runtime::spawn_blocking(crate::services::ocr::capability)
        .await
        .map_err(|_| OcrError::ProviderUnavailable)
}
pub async fn start_snap_ocr(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    input: StartSnapOcrInput,
) -> Result<OcrJobHandle, OcrError> {
    if window.label() != "capture"
        || !crate::plugin_is_enabled(&app, crate::brand::ZERO_SNAP_PLUGIN_ID)
    {
        return Err(OcrError::Unauthorized);
    }
    let crop_app = app.clone();
    let session_id = input.session_id.clone();
    let languages = input.languages.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || crop(&crop_app, &input))
        .await
        .map_err(|_| OcrError::RecognitionFailed)??;
    super::validate_session(&app, Some(&session_id)).map_err(|_| OcrError::Unauthorized)?;
    let job_id = super::random_resource_token("ocr").map_err(|_| OcrError::ProviderUnavailable)?;
    let cancel = Arc::new(AtomicBool::new(false));
    let state = app.state::<SnapOcrState>();
    state.clear();
    *state
        .job
        .lock()
        .map_err(|_| OcrError::ProviderUnavailable)? = Some(Job {
        cancel: cancel.clone(),
        snapshot: SnapOcrSnapshot {
            job_id: job_id.clone(),
            revision: 1,
            status: "recognizing".into(),
            result: None,
            error: None,
            expires_at_ms: super::now_ms() + 600_000,
        },
    });
    if super::finish_capture_session(&app, &session_id).is_err() {
        state.clear();
        return Err(OcrError::ProviderUnavailable);
    }
    if crate::commands::app::open_main_tool(&app, crate::brand::ZERO_SNAP_PLUGIN_ID).is_err() {
        state.clear();
        return Err(OcrError::ProviderUnavailable);
    }
    let output_id = job_id.clone();
    tauri::async_runtime::spawn(async move {
        let result = app
            .state::<OcrState>()
            .recognize(
                bytes,
                languages,
                cancel.clone(),
                Instant::now() + Duration::from_secs(30),
            )
            .await;
        let state = app.state::<SnapOcrState>();
        state.complete(&output_id, result);
        let _ = app.emit_to("main", EVENT, ());
    });
    Ok(OcrJobHandle { job_id })
}
fn crop(app: &tauri::AppHandle, input: &StartSnapOcrInput) -> Result<Vec<u8>, OcrError> {
    let session = super::validate_session(app, Some(&input.session_id))
        .map_err(|_| OcrError::Unauthorized)?;
    let b = &input.selection;
    validate_crop(b, session.media.width, session.media.height)?;
    crate::services::ocr::validate_dimensions(session.media.width, session.media.height)?;
    super::validate_owned_media_file(&session.media).map_err(|_| OcrError::InvalidInput)?;
    let image = image::ImageReader::open(&session.media.path)
        .map_err(|_| OcrError::InvalidInput)?
        .decode()
        .map_err(|_| OcrError::InvalidInput)?;
    let (x, y) = (b.x.floor() as u32, b.y.floor() as u32);
    let crop = image.crop_imm(
        x,
        y,
        (b.x + b.width).ceil() as u32 - x,
        (b.y + b.height).ceil() as u32 - y,
    );
    let mut output = std::io::Cursor::new(Vec::new());
    crop.write_to(&mut output, image::ImageFormat::Png)
        .map_err(|_| OcrError::RecognitionFailed)?;
    let bytes = output.into_inner();
    crate::services::ocr::validate_png(&bytes)?;
    Ok(bytes)
}
fn validate_crop(b: &OcrRect, width: u32, height: u32) -> Result<(), OcrError> {
    if ![b.x, b.y, b.width, b.height].iter().all(|n| n.is_finite())
        || b.x < 0.0
        || b.y < 0.0
        || b.width < 1.0
        || b.height < 1.0
        || b.x + b.width > f64::from(width)
        || b.y + b.height > f64::from(height)
    {
        return Err(OcrError::InvalidInput);
    }
    Ok(())
}
pub fn get_snap_ocr(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SnapOcrState>,
) -> Result<Option<SnapOcrSnapshot>, OcrError> {
    main_caller(&window)?;
    state.snapshot()
}
pub fn cancel_snap_ocr(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SnapOcrState>,
) -> Result<(), OcrError> {
    main_caller(&window)?;
    state.cancel();
    window
        .emit(EVENT, ())
        .map_err(|_| OcrError::ProviderUnavailable)
}
pub fn clear_snap_ocr(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SnapOcrState>,
) -> Result<(), OcrError> {
    main_caller(&window)?;
    state.clear();
    Ok(())
}
pub fn copy_snap_ocr(window: tauri::WebviewWindow, text: String) -> Result<(), OcrError> {
    main_caller(&window)?;
    if text.is_empty() || text.len() > 1024 * 1024 {
        return Err(OcrError::InvalidInput);
    }
    window
        .app_handle()
        .clipboard()
        .write_text(text)
        .map_err(|_| OcrError::RecognitionFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn job(id: &str) -> Job {
        Job {
            cancel: Arc::new(AtomicBool::new(false)),
            snapshot: SnapOcrSnapshot {
                job_id: id.into(),
                revision: 1,
                status: "recognizing".into(),
                result: None,
                error: None,
                expires_at_ms: super::super::now_ms() + 600000,
            },
        }
    }
    #[test]
    fn cancellation_replacement_clear_and_expiry_revoke_late_results() {
        let state = SnapOcrState::default();
        *state.job.lock().unwrap() = Some(job("new"));
        state.complete("old", Err(OcrError::RecognitionFailed));
        assert_eq!(state.snapshot().unwrap().unwrap().revision, 1);
        state.cancel();
        state.complete("new", Err(OcrError::Timeout));
        assert_eq!(state.snapshot().unwrap().unwrap().status, "cancelled");
        state.clear();
        assert!(state.snapshot().unwrap().is_none());
        let mut expired = job("expired");
        expired.snapshot.expires_at_ms = 0;
        let token = expired.cancel.clone();
        *state.job.lock().unwrap() = Some(expired);
        state.expire();
        assert!(state.snapshot().unwrap().is_none());
        assert!(token.load(Ordering::Acquire));
    }
    #[test]
    fn timeout_is_reported_even_when_native_cancellation_flag_is_set() {
        let state = SnapOcrState::default();
        let work = job("timeout");
        work.cancel.store(true, Ordering::Release);
        *state.job.lock().unwrap() = Some(work);
        state.complete("timeout", Err(OcrError::Timeout));
        let result = state.snapshot().unwrap().unwrap();
        assert_eq!(result.status, "failed");
        assert_eq!(result.error, Some(OcrError::Timeout));
    }
    #[test]
    fn crop_contract_rejects_nan_outside_and_unknown_input_fields() {
        assert!(validate_crop(
            &OcrRect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0
            },
            100,
            100
        )
        .is_ok());
        for bounds in [
            OcrRect {
                x: f64::NAN,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
            OcrRect {
                x: 99.0,
                y: 0.0,
                width: 2.0,
                height: 1.0,
            },
            OcrRect {
                x: -1.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
        ] {
            assert_eq!(
                validate_crop(&bounds, 100, 100),
                Err(OcrError::InvalidInput)
            );
        }
        let input = serde_json::json!({"sessionId":"test","selection":{"x":0,"y":0,"width":10,"height":10},"languages":[],"path":"other"});
        assert!(serde_json::from_value::<StartSnapOcrInput>(input).is_err());
    }
}
