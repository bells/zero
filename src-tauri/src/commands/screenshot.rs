use crate::services::screenshot::{
    cancel_screenshot_session as cancel_screenshot_session_service,
    commit_screenshot as commit_screenshot_service, init_pin_window as init_pin_window_service,
    init_screenshot_session as init_screenshot_session_service,
    pin_screenshot as pin_screenshot_service, screenshot_capabilities, start_screenshot_session,
    CaptureSessionPayload, CommitScreenshotInput, PinPayload, PinScreenshotInput,
    PinScreenshotResult, ScreenshotCancelResult, ScreenshotCapabilities, ScreenshotCommitResult,
    ScreenshotStartResult,
};

#[tauri::command]
pub fn get_screenshot_capabilities() -> ScreenshotCapabilities {
    screenshot_capabilities()
}

#[tauri::command]
pub fn start_screenshot(
    app: tauri::AppHandle,
    action: String,
) -> Result<ScreenshotStartResult, String> {
    start_screenshot_session(app, action)
}

#[tauri::command]
pub fn init_screenshot_session(
    app: tauri::AppHandle,
    session_id: Option<String>,
) -> Result<CaptureSessionPayload, String> {
    init_screenshot_session_service(app, session_id)
}

#[tauri::command]
pub fn commit_screenshot(
    app: tauri::AppHandle,
    input: CommitScreenshotInput,
) -> Result<ScreenshotCommitResult, String> {
    commit_screenshot_service(app, input)
}

#[tauri::command]
pub fn cancel_screenshot_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<ScreenshotCancelResult, String> {
    cancel_screenshot_session_service(app, session_id)
}

#[tauri::command]
pub fn pin_screenshot(
    app: tauri::AppHandle,
    input: PinScreenshotInput,
) -> Result<PinScreenshotResult, String> {
    pin_screenshot_service(app, input)
}

#[tauri::command]
pub fn init_pin_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<PinPayload, String> {
    init_pin_window_service(app, window)
}
