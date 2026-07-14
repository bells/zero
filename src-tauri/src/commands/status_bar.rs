use tauri::Manager;

use crate::plugins::registry::PluginRegistryState;
use crate::services::status_bar::{
    ensure_status_bar_settings, run_status_bar_item_action as run_status_bar_item_action_service,
    status_bar_items, update_status_bar_settings as update_status_bar_settings_service,
    RunStatusBarItemActionInput, StatusBarItemSnapshot, StatusBarSettings,
    UpdateStatusBarSettingsInput,
};

#[tauri::command]
pub fn get_status_bar_settings(app: tauri::AppHandle) -> Result<StatusBarSettings, String> {
    let records = app
        .state::<PluginRegistryState>()
        .with_registry(|registry| Ok(registry.records().to_vec()))?;
    ensure_status_bar_settings(&app, &records)
}

#[tauri::command]
pub fn update_status_bar_settings(
    app: tauri::AppHandle,
    input: UpdateStatusBarSettingsInput,
) -> Result<StatusBarSettings, String> {
    update_status_bar_settings_service(&app, input)
}

#[tauri::command]
pub fn get_status_bar_items(app: tauri::AppHandle) -> Result<Vec<StatusBarItemSnapshot>, String> {
    status_bar_items(&app)
}

#[tauri::command]
pub fn run_status_bar_item_action(
    app: tauri::AppHandle,
    input: RunStatusBarItemActionInput,
) -> Result<(), String> {
    run_status_bar_item_action_service(&app, &input.item_id)
}
