#[cfg(feature = "file-tool")]
use crate::services::file::engine_bridge::ocr::{
    self as file_ocr, FilePageOcrInput, FilePageOcrLease,
};
#[cfg(feature = "file-tool")]
use crate::services::ocr::OcrPageResult;
use crate::services::ocr::{OcrCapability, OcrError};
#[cfg(feature = "bundled-tools")]
use crate::services::screenshot::snap_ocr::{
    self, OcrJobHandle, SnapOcrSnapshot, SnapOcrState, StartSnapOcrInput,
};

#[cfg(feature = "bundled-tools")]
#[tauri::command]
pub async fn get_ocr_capability(window: tauri::WebviewWindow) -> Result<OcrCapability, OcrError> {
    snap_ocr::get_ocr_capability(window).await
}
#[cfg(feature = "bundled-tools")]
#[tauri::command]
pub async fn start_snap_ocr(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    input: StartSnapOcrInput,
) -> Result<OcrJobHandle, OcrError> {
    snap_ocr::start_snap_ocr(window, app, input).await
}
#[cfg(feature = "bundled-tools")]
#[tauri::command]
pub fn get_snap_ocr(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SnapOcrState>,
) -> Result<Option<SnapOcrSnapshot>, OcrError> {
    snap_ocr::get_snap_ocr(window, state)
}
#[cfg(feature = "bundled-tools")]
#[tauri::command]
pub fn cancel_snap_ocr(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SnapOcrState>,
) -> Result<(), OcrError> {
    snap_ocr::cancel_snap_ocr(window, state)
}
#[cfg(feature = "bundled-tools")]
#[tauri::command]
pub fn clear_snap_ocr(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SnapOcrState>,
) -> Result<(), OcrError> {
    snap_ocr::clear_snap_ocr(window, state)
}
#[cfg(feature = "bundled-tools")]
#[tauri::command]
pub fn copy_snap_ocr(window: tauri::WebviewWindow, text: String) -> Result<(), OcrError> {
    snap_ocr::copy_snap_ocr(window, text)
}
#[cfg(feature = "file-tool")]
#[tauri::command]
pub fn prepare_file_page_ocr(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    input: FilePageOcrInput,
) -> Result<FilePageOcrLease, OcrError> {
    file_ocr::prepare_file_page_ocr(window, app, input)
}
#[cfg(feature = "file-tool")]
#[tauri::command]
pub async fn upload_file_page_ocr(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<OcrPageResult, OcrError> {
    file_ocr::upload_file_page_ocr(window, app, request).await
}
