use super::{
    require_engine_window, FileConversionDirection, FileEngineBridge, FileEngineBridgeState,
    FILE_ENGINE_VERSION,
};
use crate::services::ocr::{OcrError, OcrPageResult, OcrState};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::Manager;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FilePageOcrInput {
    token: String,
    job_id: String,
    engine_version: String,
    page_number: u32,
    width: u32,
    height: u32,
}
struct Lease {
    input: FilePageOcrInput,
    expires: Instant,
}
#[derive(Default)]
pub struct FileOcrLeases {
    leases: Mutex<HashMap<String, Lease>>,
}
impl FileOcrLeases {
    fn consume(&self, token: &str) -> Result<Lease, OcrError> {
        let lease = self
            .leases
            .lock()
            .map_err(|_| OcrError::ProviderUnavailable)?
            .remove(token)
            .ok_or(OcrError::Unauthorized)?;
        if lease.expires <= Instant::now() {
            return Err(OcrError::Unauthorized);
        }
        Ok(lease)
    }
    pub fn expire(&self) {
        if let Ok(mut leases) = self.leases.lock() {
            leases.retain(|_, lease| lease.expires > Instant::now());
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePageOcrLease {
    lease_token: String,
    expires_at_ms: u64,
}

fn deadline(bridge: &FileEngineBridge, input: &FilePageOcrInput) -> Result<Instant, OcrError> {
    let runtime = bridge
        .runtime
        .lock()
        .map_err(|_| OcrError::ProviderUnavailable)?;
    if runtime
        .sessions
        .get(&input.token)
        .is_some_and(|session| session.deadline <= Instant::now())
    {
        return Err(OcrError::Timeout);
    }
    let session = FileEngineBridge::validate_session(
        &runtime,
        &input.token,
        Some(&input.job_id),
        Some(&input.engine_version),
    )
    .map_err(|_| OcrError::Unauthorized)?;
    if session.direction != FileConversionDirection::PdfToDocx
        || input.engine_version != FILE_ENGINE_VERSION
    {
        return Err(OcrError::Unauthorized);
    }
    Ok(session.deadline)
}
fn validate_input(input: &FilePageOcrInput) -> Result<(), OcrError> {
    if input.page_number == 0 || input.page_number > 512 {
        return Err(OcrError::InvalidInput);
    }
    crate::services::ocr::validate_dimensions(input.width, input.height)?;
    Ok(())
}
pub fn prepare_file_page_ocr(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    input: FilePageOcrInput,
) -> Result<FilePageOcrLease, OcrError> {
    require_engine_window(&window).map_err(|_| OcrError::Unauthorized)?;
    validate_input(&input)?;
    let bridge = &app.state::<FileEngineBridgeState>().bridge;
    let parent_deadline = deadline(bridge, &input)?;
    let state = app.state::<FileOcrLeases>();
    let mut leases = state
        .leases
        .lock()
        .map_err(|_| OcrError::ProviderUnavailable)?;
    leases.retain(|_, l| l.expires > Instant::now());
    if leases.len() >= 2 {
        return Err(OcrError::Busy);
    }
    let mut runtime = bridge
        .runtime
        .lock()
        .map_err(|_| OcrError::ProviderUnavailable)?;
    let session = runtime
        .sessions
        .get_mut(&input.token)
        .ok_or(OcrError::Unauthorized)?;
    if !session.ocr_pages.insert(input.page_number) {
        return Err(OcrError::Unauthorized);
    }
    let token = super::random_token().map_err(|_| OcrError::ProviderUnavailable)?;
    let expires = parent_deadline.min(Instant::now() + Duration::from_secs(5));
    let expires_at_ms = super::now_ms()
        + expires
            .saturating_duration_since(Instant::now())
            .as_millis() as u64;
    leases.insert(token.clone(), Lease { input, expires });
    Ok(FilePageOcrLease {
        lease_token: token,
        expires_at_ms,
    })
}
pub async fn upload_file_page_ocr(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<OcrPageResult, OcrError> {
    require_engine_window(&window).map_err(|_| OcrError::Unauthorized)?;
    let token = request
        .headers()
        .get("x-zero-file-ocr-lease")
        .and_then(|h| h.to_str().ok())
        .ok_or(OcrError::Unauthorized)?;
    let lease = app.state::<FileOcrLeases>().consume(token)?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= crate::services::ocr::MAX_BYTES => {
            bytes.clone()
        }
        _ => return Err(OcrError::InvalidInput),
    };
    if crate::services::ocr::validate_png(&bytes)? != (lease.input.width, lease.input.height) {
        return Err(OcrError::InvalidInput);
    }
    let bridge = Arc::clone(&app.state::<FileEngineBridgeState>().bridge);
    let parent_deadline = deadline(&bridge, &lease.input)?;
    let cancel = Arc::new(AtomicBool::new(false));
    let state = app.state::<OcrState>();
    let mut work = Box::pin(state.recognize(bytes, vec![], cancel.clone(), parent_deadline));
    loop {
        if let Err(error) = deadline(&bridge, &lease.input) {
            cancel.store(true, Ordering::Release);
            return Err(if error == OcrError::Timeout {
                error
            } else {
                OcrError::Cancelled
            });
        }
        if let Ok(result) = tokio::time::timeout(Duration::from_millis(25), &mut work).await {
            deadline(&bridge, &lease.input)?;
            return result;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> FilePageOcrInput {
        FilePageOcrInput {
            token: "run-token".into(),
            job_id: "job1".into(),
            engine_version: FILE_ENGINE_VERSION.into(),
            page_number: 1,
            width: 1400,
            height: 1800,
        }
    }
    #[test]
    fn leases_are_single_use_and_expire_without_exposing_paths() {
        let state = FileOcrLeases::default();
        state.leases.lock().unwrap().insert(
            "lease".into(),
            Lease {
                input: input(),
                expires: Instant::now() + Duration::from_secs(1),
            },
        );
        assert_eq!(state.consume("lease").unwrap().input.job_id, "job1");
        assert!(matches!(
            state.consume("lease"),
            Err(OcrError::Unauthorized)
        ));
        state.leases.lock().unwrap().insert(
            "expired".into(),
            Lease {
                input: input(),
                expires: Instant::now() - Duration::from_secs(1),
            },
        );
        assert!(matches!(
            state.consume("expired"),
            Err(OcrError::Unauthorized)
        ));
        let mut page = input();
        page.page_number = 0;
        assert_eq!(validate_input(&page), Err(OcrError::InvalidInput));
        page.page_number = 513;
        assert_eq!(validate_input(&page), Err(OcrError::InvalidInput));
        page.page_number = 1;
        page.width = 8193;
        assert_eq!(validate_input(&page), Err(OcrError::ResourceLimit));
        assert!(serde_json::from_value::<FilePageOcrInput>(serde_json::json!({"token":"token","jobId":"job","engineVersion":FILE_ENGINE_VERSION,"pageNumber":1,"width":100,"height":100,"path":"other-file"})).is_err());
    }
    #[test]
    fn parent_scope_rejects_other_job_version_direction_and_revoked_run() {
        let bridge = FileEngineBridge::default();
        let page = input();
        let (sender, _) = std::sync::mpsc::channel();
        bridge.runtime.lock().unwrap().sessions.insert(
            page.token.clone(),
            super::super::EngineSession {
                job_id: page.job_id.clone(),
                engine_version: page.engine_version.clone(),
                direction: FileConversionDirection::PdfToDocx,
                input_path: std::path::PathBuf::new(),
                output_path: std::path::PathBuf::new(),
                deadline: Instant::now() + Duration::from_secs(60),
                sender,
                ocr_pages: Default::default(),
            },
        );
        assert!(deadline(&bridge, &page).is_ok());
        let mut other = page.clone();
        other.job_id = "other".into();
        assert_eq!(deadline(&bridge, &other), Err(OcrError::Unauthorized));
        other = page.clone();
        other.engine_version = "1.1.0".into();
        assert_eq!(deadline(&bridge, &other), Err(OcrError::Unauthorized));
        bridge
            .runtime
            .lock()
            .unwrap()
            .sessions
            .get_mut(&page.token)
            .unwrap()
            .direction = FileConversionDirection::DocxToPdf;
        assert_eq!(deadline(&bridge, &page), Err(OcrError::Unauthorized));
        bridge
            .runtime
            .lock()
            .unwrap()
            .sessions
            .get_mut(&page.token)
            .unwrap()
            .deadline = Instant::now() - Duration::from_secs(1);
        assert_eq!(deadline(&bridge, &page), Err(OcrError::Timeout));
        bridge.revoke(&page.token);
        assert_eq!(deadline(&bridge, &page), Err(OcrError::Unauthorized));
    }
}
