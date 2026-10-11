use crate::services::caffeine::{CaffeineSnapshot, CaffeineState};
use crate::services::caffeine_runtime::{self, AwakeRequest};

#[tauri::command]
pub fn get_caffeine_state(
    state: tauri::State<'_, CaffeineState>,
) -> Result<CaffeineSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub async fn toggle_keep_awake(
    app: tauri::AppHandle,
    enabled: bool,
    duration_minutes: Option<u64>,
) -> Result<CaffeineSnapshot, String> {
    caffeine_runtime::execute(
        app,
        AwakeRequest::Set {
            enabled,
            duration: duration_minutes,
        },
    )
    .await
}
