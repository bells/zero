use tauri::{Emitter, Manager, State};

use crate::services::file::contracts::{
    FileConversionBatchResult, FileConversionCandidate, FileConversionCapabilitySnapshot,
    FileConversionEnqueueRequest, FileConversionError, FileConversionInspectRequest,
    FileConversionJobRequest, FileConversionJobSnapshot, FileConversionProviderSelectionRequest,
    FileConversionRetryRequest,
};
use crate::services::file::result_actions::CompletedOutputAction;
use crate::services::file::runtime::{
    run_file_conversion_worker, FileCapabilityInvalidationCause, FILE_CONVERSION_JOB_UPDATED_EVENT,
};
use crate::services::file::FileConversionState;

#[tauri::command]
pub async fn get_file_conversion_capabilities(
    app: tauri::AppHandle,
) -> Result<FileConversionCapabilitySnapshot, FileConversionError> {
    ensure_initialized(&app)?;
    let capability_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        capability_app.state::<FileConversionState>().capabilities()
    })
    .await
    .map_err(|_| command_error("The File capability worker stopped unexpectedly."))
}

#[tauri::command]
pub async fn refresh_file_conversion_capabilities(
    app: tauri::AppHandle,
) -> Result<FileConversionCapabilitySnapshot, FileConversionError> {
    ensure_initialized(&app)?;
    let capability_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = capability_app.state::<FileConversionState>();
        state.invalidate_capabilities(FileCapabilityInvalidationCause::NativeProviderChanged);
        let snapshot = state.capabilities();
        let _ = capability_app.emit(FILE_CONVERSION_CAPABILITIES_UPDATED_EVENT, snapshot.clone());
        snapshot
    })
    .await
    .map_err(|_| command_error("The File capability refresh worker stopped unexpectedly."))
}

pub const FILE_CONVERSION_QUEUE_UPDATED_EVENT: &str = "zero://file-conversion/queue-updated";

pub const FILE_CONVERSION_CAPABILITIES_UPDATED_EVENT: &str =
    "zero://file-conversion/capabilities-updated";

#[tauri::command]
pub async fn set_file_conversion_provider(
    window: tauri::WebviewWindow,
    input: FileConversionProviderSelectionRequest,
    app: tauri::AppHandle,
) -> Result<FileConversionCapabilitySnapshot, FileConversionError> {
    ensure_file_caller(window.label())?;
    ensure_initialized(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot = app.state::<FileConversionState>().set_provider(input)?;
        let _ = app.emit(FILE_CONVERSION_CAPABILITIES_UPDATED_EVENT, snapshot.clone());
        Ok(snapshot)
    })
    .await
    .map_err(|_| command_error("The File preference worker stopped unexpectedly."))?
}

#[tauri::command]
pub fn open_file_conversion_configuration(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), FileConversionError> {
    ensure_file_caller(window.label())?;
    crate::commands::app::open_main_tool(&app, crate::brand::ZERO_FILE_PLUGIN_ID)
        .map_err(|_| command_error("The File workspace could not be opened."))
}

fn ensure_file_caller(label: &str) -> Result<(), FileConversionError> {
    if matches!(label, "main" | "tray") {
        Ok(())
    } else {
        Err(crate::services::file::provider::provider_error(
            crate::services::file::contracts::FileConversionErrorCode::PermissionDenied,
            "Only Zero shell windows can change File provider selection or retry jobs.",
            false,
            None,
        ))
    }
}

#[tauri::command]
pub async fn choose_file_conversion_inputs(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Vec<FileConversionCandidate>, FileConversionError> {
    let dialog_guard = crate::services::tray_panel::DialogGuard::new(&app, window.label());
    let paths = tauri::async_runtime::spawn_blocking(move || {
        let _guard = dialog_guard;
        rfd::FileDialog::new()
            .add_filter("PDF and Word documents", &["pdf", "docx"])
            .pick_files()
            .unwrap_or_default()
    })
    .await
    .map_err(|_| command_error("The native file picker stopped unexpectedly."))?;
    Ok(app.state::<FileConversionState>().inspect_paths(
        paths
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect(),
    ))
}

#[tauri::command]
pub async fn inspect_file_conversion_inputs(
    input: FileConversionInspectRequest,
    app: tauri::AppHandle,
) -> Result<Vec<FileConversionCandidate>, FileConversionError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<FileConversionState>()
            .inspect_paths(input.source_paths)
    })
    .await
    .map_err(|_| command_error("The File input inspection worker stopped unexpectedly."))
}

#[tauri::command]
pub async fn enqueue_file_conversions(
    input: FileConversionEnqueueRequest,
    app: tauri::AppHandle,
) -> Result<FileConversionBatchResult, FileConversionError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<_, FileConversionError> {
        let batch = app.state::<FileConversionState>().enqueue(input)?;
        emit_queue_snapshot(&app);
        Ok(batch)
    })
    .await
    .map_err(|_| command_error("The File enqueue worker stopped unexpectedly."))?
}

#[tauri::command]
pub fn list_file_conversion_jobs(
    state: State<'_, FileConversionState>,
) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
    state.snapshots()
}

#[tauri::command]
pub fn get_file_conversion_queue_snapshot(
    window: tauri::WebviewWindow,
    state: State<'_, FileConversionState>,
) -> Result<crate::services::file::contracts::FileConversionQueueSnapshot, FileConversionError> {
    ensure_file_caller(window.label())?;
    state.queue_snapshot()
}

#[tauri::command]
pub fn start_file_conversion_queue(
    app: tauri::AppHandle,
) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
    ensure_initialized(&app)?;
    let state = app.state::<FileConversionState>();
    let (updates, should_spawn) = state.start()?;
    app.state::<crate::services::file::engine_bridge::FileEngineBridgeState>()
        .bridge
        .cancel_idle_teardown();
    emit_updates(&app, &updates);
    emit_queue_snapshot(&app);
    if should_spawn {
        let worker_app = app.clone();
        tauri::async_runtime::spawn(async move {
            run_file_conversion_worker(worker_app).await;
        });
    }
    Ok(updates)
}

fn ensure_initialized(app: &tauri::AppHandle) -> Result<(), FileConversionError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| command_error("The home directory is unavailable."))?;
    app.state::<FileConversionState>().configure_preferences(
        crate::brand::canonical_data_root(&home).join("data/file/preferences.json"),
    )?;
    let trace = app.state::<crate::services::performance::PerformanceTrace>();
    let started = trace.begin();
    let temp_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| command_error("The Zero cache directory is unavailable."))?
        .join("file-conversion");
    let bridge = std::sync::Arc::clone(
        &app.state::<crate::services::file::engine_bridge::FileEngineBridgeState>()
            .bridge,
    );
    let result =
        app.state::<FileConversionState>()
            .initialize_with_engine(app.clone(), bridge, temp_root);
    trace.finish(
        "file_initialization",
        if result.is_ok() { "ok" } else { "error" },
        started,
    );
    result
}

#[tauri::command]
pub fn cancel_file_conversion_job(
    input: FileConversionJobRequest,
    app: tauri::AppHandle,
) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
    let updates = app.state::<FileConversionState>().cancel(&input.job_id)?;
    emit_updates(&app, &updates);
    emit_queue_snapshot(&app);
    Ok(updates)
}

#[tauri::command]
pub fn remove_file_conversion_job(
    input: FileConversionJobRequest,
    app: tauri::AppHandle,
) -> Result<FileConversionJobSnapshot, FileConversionError> {
    let removed = app.state::<FileConversionState>().remove(&input.job_id)?;
    emit_queue_snapshot(&app);
    Ok(removed)
}

#[tauri::command]
pub async fn retry_file_conversion_job(
    window: tauri::WebviewWindow,
    input: FileConversionRetryRequest,
    app: tauri::AppHandle,
) -> Result<FileConversionJobSnapshot, FileConversionError> {
    ensure_file_caller(window.label())?;
    let worker_app = app.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        worker_app
            .state::<FileConversionState>()
            .retry_with_provider(&input.job_id, input.provider_id)
    })
    .await
    .map_err(|_| command_error("The File retry worker stopped unexpectedly."))??;
    let _ = app.emit(FILE_CONVERSION_JOB_UPDATED_EVENT, snapshot.clone());
    emit_queue_snapshot(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn clear_completed_file_conversion_jobs(
    app: tauri::AppHandle,
) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
    let removed = app.state::<FileConversionState>().clear_completed()?;
    emit_queue_snapshot(&app);
    Ok(removed)
}

#[tauri::command]
pub async fn open_file_conversion_output(
    input: FileConversionJobRequest,
    app: tauri::AppHandle,
) -> Result<(), FileConversionError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<FileConversionState>()
            .run_completed_output_action(&input.job_id, CompletedOutputAction::Open)
    })
    .await
    .map_err(|_| command_error("The File output-open worker stopped unexpectedly."))?
}

#[tauri::command]
pub async fn reveal_file_conversion_output(
    input: FileConversionJobRequest,
    app: tauri::AppHandle,
) -> Result<(), FileConversionError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<FileConversionState>()
            .run_completed_output_action(&input.job_id, CompletedOutputAction::Reveal)
    })
    .await
    .map_err(|_| command_error("The File output-reveal worker stopped unexpectedly."))?
}

fn emit_queue_snapshot(app: &tauri::AppHandle) {
    if let Ok(snapshot) = app.state::<FileConversionState>().queue_snapshot() {
        let _ = app.emit(FILE_CONVERSION_QUEUE_UPDATED_EVENT, snapshot);
    }
}

fn emit_updates(app: &tauri::AppHandle, updates: &[FileConversionJobSnapshot]) {
    for update in updates {
        let _ = app.emit(FILE_CONVERSION_JOB_UPDATED_EVENT, update.clone());
    }
}

fn command_error(message: &str) -> FileConversionError {
    FileConversionError {
        code: crate::services::file::contracts::FileConversionErrorCode::Internal,
        message: message.into(),
        retryable: true,
        provider_id: None,
        diagnostic: None,
        quality_issues: Vec::new(),
    }
}

#[cfg(test)]
mod provider_caller_tests {
    use super::*;
    #[test]
    fn provider_settings_and_retry_require_main_or_tray_callers() {
        assert!(ensure_file_caller("main").is_ok());
        assert!(ensure_file_caller("tray").is_ok());
        for label in ["zero-file-engine", "about", "capture", "plugin-demo", ""] {
            assert!(ensure_file_caller(label).is_err());
        }
    }
}
