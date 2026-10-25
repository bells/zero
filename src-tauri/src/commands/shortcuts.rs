use crate::services::global_shortcuts::{
    global_shortcut_snapshots as global_shortcut_snapshots_service, GlobalShortcutSnapshot,
};

#[tauri::command]
pub fn get_global_shortcut_snapshots(
    app: tauri::AppHandle,
) -> Result<Vec<GlobalShortcutSnapshot>, String> {
    global_shortcut_snapshots_service(&app)
}

#[tauri::command]
pub async fn set_snap_shortcut(
    app: tauri::AppHandle,
    input: crate::services::global_shortcuts::SetSnapShortcutInput,
) -> Result<Vec<GlobalShortcutSnapshot>, crate::services::global_shortcuts::ShortcutError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::services::global_shortcuts::set_snap_shortcut(&app, input)
    })
    .await
    .map_err(|_| {
        crate::services::global_shortcuts::ShortcutError::from(
            crate::services::global_shortcuts::ShortcutErrorCode::Conflict,
        )
    })?
}
