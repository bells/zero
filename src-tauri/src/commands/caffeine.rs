use crate::services::caffeine::{CaffeineSnapshot, CaffeineState};

#[tauri::command]
pub fn get_caffeine_state(
    state: tauri::State<'_, CaffeineState>,
) -> Result<CaffeineSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub fn toggle_keep_awake(
    state: tauri::State<'_, CaffeineState>,
    enabled: bool,
) -> Result<CaffeineSnapshot, String> {
    state.set_enabled(enabled)
}
