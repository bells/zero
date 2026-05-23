use crate::services::screenshot::{
    screenshot_capabilities, start_screenshot_session, ScreenshotCapabilities,
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
