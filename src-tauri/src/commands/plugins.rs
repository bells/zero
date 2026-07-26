use tauri::State;

use crate::plugins::contracts::{
    InstallMarketPluginInput, InstallPluginPackageInput, PluginIdentityInput,
    PluginLifecycleResult, PluginMarketEntry, PluginPackageValidationReport, PluginRecord,
    SetPluginEnabledInput, ValidatePluginPackageInput,
};
use crate::plugins::market::{fetch_market_json, PluginMarketSnapshot, PluginMarketState};
use crate::plugins::package::{download_package_to_staging, PluginPackageDownloadRequest};
use crate::plugins::registry::PluginRegistryState;

#[tauri::command]
pub async fn refresh_plugin_market(
    state: State<'_, PluginMarketState>,
) -> Result<PluginMarketSnapshot, String> {
    let source_url = state.source_url().map_err(|error| error.message)?;
    let market_json = fetch_market_json(&source_url)
        .await
        .map_err(|error| error.message)?;

    state
        .refresh_from_json(&market_json)
        .map_err(|error| error.message)
}

#[tauri::command]
pub fn list_market_plugins(
    state: State<'_, PluginMarketState>,
    registry_state: State<'_, PluginRegistryState>,
) -> Result<Vec<PluginMarketEntry>, String> {
    let mut entries = state.cached_entries().map_err(|error| error.message)?;
    let records = registry_state.with_registry(|registry| Ok(registry.records().to_vec()))?;

    for entry in &mut entries {
        entry.installed_version = records
            .iter()
            .find(|record| record.name == entry.name)
            .map(|record| record.version.clone());
    }

    Ok(entries)
}

#[tauri::command]
pub fn list_plugins(state: State<'_, PluginRegistryState>) -> Result<Vec<PluginRecord>, String> {
    state.with_registry(|registry| Ok(registry.records().to_vec()))
}

#[tauri::command]
pub fn validate_plugin_package(
    input: ValidatePluginPackageInput,
    state: State<'_, PluginRegistryState>,
) -> Result<PluginPackageValidationReport, String> {
    state.with_registry(|registry| registry.validate_package(input.package_path))
}

#[tauri::command]
pub fn install_plugin_package(
    input: InstallPluginPackageInput,
    app: tauri::AppHandle,
    state: State<'_, PluginRegistryState>,
) -> Result<PluginRecord, String> {
    let record = state.with_registry(|registry| registry.install_local_package(input))?;
    let _ = crate::services::status_bar::refresh_status_bar(&app);
    if record.name == crate::brand::ZERO_LAUNCH_PLUGIN_ID {
        let _ = crate::sync_quick_launcher_shortcut(&app, record.enabled);
    }
    Ok(record)
}

#[tauri::command]
pub async fn install_market_plugin(
    input: InstallMarketPluginInput,
    app: tauri::AppHandle,
    state: State<'_, PluginRegistryState>,
) -> Result<PluginRecord, String> {
    let staging_dir = std::env::temp_dir().join(format!(
        "zero-market-plugin-{}-{}",
        input.entry.name,
        std::process::id()
    ));
    let download = download_package_to_staging(
        &PluginPackageDownloadRequest {
            download_url: input.entry.download_url.clone(),
            sha256: input.entry.sha256.clone(),
        },
        &staging_dir,
    )
    .await
    .map_err(|error| error.message)?;

    let install_input = InstallPluginPackageInput {
        package_path: download.staged_path.to_string_lossy().into_owned(),
        approved_permissions: input.approved_permissions,
        enabled: input.enabled,
    };

    let result = state.with_registry(|registry| {
        registry.install_market_package_from_path(&input.entry, install_input)
    });
    let _ = std::fs::remove_dir_all(&staging_dir);

    let record = result?;
    let _ = crate::services::status_bar::refresh_status_bar(&app);
    Ok(record)
}

#[tauri::command]
pub fn uninstall_plugin(
    input: PluginIdentityInput,
    app: tauri::AppHandle,
    state: State<'_, PluginRegistryState>,
) -> Result<PluginLifecycleResult, String> {
    let result = state.with_registry(|registry| registry.uninstall_plugin(&input.name))?;
    let _ = crate::services::status_bar::refresh_status_bar(&app);
    Ok(result)
}

#[tauri::command]
pub fn set_plugin_enabled(
    input: SetPluginEnabledInput,
    app: tauri::AppHandle,
    state: State<'_, PluginRegistryState>,
) -> Result<PluginRecord, String> {
    let record = state.with_registry(|registry| {
        let record = registry.set_enabled(&input.name, input.enabled)?;
        registry.save()?;
        Ok(record)
    })?;
    let _ = crate::services::status_bar::refresh_status_bar(&app);
    if record.name == crate::brand::ZERO_LAUNCH_PLUGIN_ID {
        let _ = crate::sync_quick_launcher_shortcut(&app, record.enabled);
    }
    Ok(record)
}

#[tauri::command]
pub fn restore_bundled_plugins(
    app: tauri::AppHandle,
    state: State<'_, PluginRegistryState>,
) -> Result<Vec<PluginRecord>, String> {
    let records = state.with_registry(|registry| registry.restore_bundled_defaults())?;
    let _ = crate::services::status_bar::refresh_status_bar(&app);
    let _ = crate::sync_quick_launcher_shortcut(&app, true);
    Ok(records)
}
