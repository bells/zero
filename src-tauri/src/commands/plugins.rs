#[tauri::command]
pub fn check_plugin_compatibility(
    input: crate::plugins::protocol::CheckPluginCompatibilityInput,
) -> Result<crate::plugins::protocol::CompatibilityReport, crate::plugins::protocol::PluginError> {
    if input.manifest.to_string().len() > 64 * 1024 {
        return Err(crate::plugins::protocol::PluginError {
            code: "manifest.oversized".into(),
            message: "Manifest exceeds 64 KiB".into(),
            retryable: false,
        });
    }
    Ok(crate::plugins::compatibility::check_manifest(
        &input.manifest,
    ))
}

use tauri::{Emitter, Manager, State};

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
pub fn get_plugin_registry_snapshot(
    state: State<'_, PluginRegistryState>,
) -> Result<crate::plugins::protocol::PluginRegistrySnapshot, String> {
    state.with_registry(|r| {
        Ok(crate::plugins::protocol::PluginRegistrySnapshot {
            revision: r.revision(),
            records: r.records().to_vec(),
        })
    })
}

fn publish_registry(app: &tauri::AppHandle, ids: Vec<String>, reason: &str) {
    if let Ok(revision) = app
        .state::<PluginRegistryState>()
        .with_registry(|r| Ok(r.revision()))
    {
        let _ = app.emit(
            "plugin-registry-changed",
            crate::plugins::protocol::PluginRegistryChanged {
                revision,
                plugin_ids: ids,
                reason: reason.into(),
            },
        );
    }
}

#[tauri::command]
pub async fn validate_plugin_package(
    input: ValidatePluginPackageInput,
    app: tauri::AppHandle,
) -> Result<PluginPackageValidationReport, String> {
    run_plugin_worker(app, move |_| {
        crate::plugins::package::validate_zplugin_package(std::path::Path::new(&input.package_path))
            .map_err(|e| e.message)
    })
    .await
}

#[tauri::command]
pub async fn install_plugin_package(
    input: InstallPluginPackageInput,
    app: tauri::AppHandle,
) -> Result<PluginRecord, String> {
    run_plugin_worker(app, move |app| {
        let intake = app
            .state::<PluginRegistryState>()
            .with_registry(|registry| Ok(registry.intake_root()))?;
        let prepared = crate::plugins::package::prepare_plugin_package(
            std::path::Path::new(&input.package_path),
            &intake,
        )
        .map_err(|e| e.message)?;
        let plugin_name = prepared
            .report
            .manifest
            .as_ref()
            .ok_or("Missing package manifest")?
            .name
            .clone();
        let operation_name = plugin_name.clone();
        app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
            .run(&operation_name, || {
                app.state::<PluginRegistryState>()
                    .with_registry(|r| r.preflight_prepared(&input, None, &prepared))?;
                crate::plugins::web_runtime::revoke(app, &operation_name);
                let (record, prior_version) =
                    app.state::<PluginRegistryState>()
                        .with_registry(|registry| {
                            let prior_version = registry
                                .records()
                                .iter()
                                .find(|record| record.name == operation_name)
                                .map(|record| record.version.clone());
                            registry
                                .install_prepared(
                                    input,
                                    crate::plugins::contracts::PluginSource::Local,
                                    None,
                                    prepared,
                                )
                                .map(|record| (record, prior_version))
                        })?;
                let _ = crate::services::status_bar::refresh_status_bar(app);
                let lifecycle_result = crate::plugins::lifecycle::changed(
                    app,
                    &record.name,
                    record.enabled,
                    "installed",
                    prior_version.as_deref(),
                );
                publish_registry(app, vec![record.name.clone()], "changed");
                lifecycle_result?;
                Ok(record)
            })
    })
    .await
}

#[tauri::command]
pub async fn install_market_plugin(
    input: InstallMarketPluginInput,
    app: tauri::AppHandle,
) -> Result<PluginRecord, String> {
    let mut nonce = [0_u8; 16];
    getrandom::fill(&mut nonce)
        .map_err(|_| "Could not allocate plugin staging identity".to_string())?;
    let nonce: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
    let staging_dir = std::env::temp_dir().join(format!("zero-market-plugin-{nonce}"));
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
        expected_sha256: None,
        package_path: download.staged_path.to_string_lossy().into_owned(),
        approved_permissions: input.approved_permissions,
        enabled: input.enabled,
    };

    run_plugin_worker(app, move |app| {
        let intake = app
            .state::<PluginRegistryState>()
            .with_registry(|registry| Ok(registry.intake_root()))?;
        let prepared = crate::plugins::package::prepare_plugin_package(
            std::path::Path::new(&install_input.package_path),
            &intake,
        );
        let _ = std::fs::remove_dir_all(&staging_dir);
        let prepared = prepared.map_err(|e| e.message)?;

        let operation_name = input.entry.name.clone();
        app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
            .run(&operation_name, || {
                app.state::<PluginRegistryState>().with_registry(|r| {
                    r.preflight_prepared(&install_input, Some(&input.entry), &prepared)
                })?;
                crate::plugins::web_runtime::revoke(app, &operation_name);
                let result = app
                    .state::<PluginRegistryState>()
                    .with_registry(|registry| {
                        let prior_version = registry
                            .records()
                            .iter()
                            .find(|record| record.name == operation_name)
                            .map(|record| record.version.clone());
                        registry
                            .install_prepared(
                                install_input,
                                crate::plugins::contracts::PluginSource::Market,
                                Some(&input.entry),
                                prepared,
                            )
                            .map(|record| (record, prior_version))
                    });
                let (record, prior_version) = result?;
                let _ = crate::services::status_bar::refresh_status_bar(app);
                let lifecycle_result = crate::plugins::lifecycle::changed(
                    app,
                    &record.name,
                    record.enabled,
                    "installed",
                    prior_version.as_deref(),
                );
                publish_registry(app, vec![record.name.clone()], "changed");
                lifecycle_result?;
                Ok(record)
            })
    })
    .await
}

#[tauri::command]
pub async fn uninstall_plugin(
    input: PluginIdentityInput,
    app: tauri::AppHandle,
) -> Result<PluginLifecycleResult, String> {
    run_plugin_worker(app, move |app| {
        let operation_name = input.name.clone();
        app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
            .run(&operation_name, || {
                crate::plugins::web_runtime::revoke(app, &input.name);
                let result = app
                    .state::<PluginRegistryState>()
                    .with_registry(|registry| registry.uninstall_plugin(&input.name))?;
                let _ = crate::services::status_bar::refresh_status_bar(app);
                let lifecycle_result =
                    crate::plugins::lifecycle::changed(app, &input.name, false, "removed", None);
                publish_registry(app, vec![input.name.clone()], "removed");
                lifecycle_result?;
                Ok(result)
            })
    })
    .await
}

#[tauri::command]
pub async fn set_plugin_enabled(
    input: SetPluginEnabledInput,
    app: tauri::AppHandle,
) -> Result<PluginRecord, String> {
    run_plugin_worker(app, move |app| {
        let operation_name = input.name.clone();
        app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
            .run(&operation_name, || {
                if !input.enabled {
                    crate::plugins::web_runtime::revoke(app, &input.name);
                }
                let record = app
                    .state::<PluginRegistryState>()
                    .with_registry(|registry| {
                        registry.set_enabled_and_save(&input.name, input.enabled)
                    })?;
                let _ = crate::services::status_bar::refresh_status_bar(app);
                let lifecycle_result = crate::plugins::lifecycle::changed(
                    app,
                    &record.name,
                    record.enabled,
                    "enabled",
                    None,
                );
                publish_registry(app, vec![record.name.clone()], "changed");
                lifecycle_result?;
                Ok(record)
            })
    })
    .await
}

#[tauri::command]
pub async fn restore_bundled_plugins(app: tauri::AppHandle) -> Result<Vec<PluginRecord>, String> {
    run_plugin_worker(app, move |app| {
        let bundled = crate::bundled_metadata::manifests();
        app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
            .run_many(
                bundled.iter().map(|manifest| manifest.name.as_str()),
                || {
                    let records = app
                        .state::<PluginRegistryState>()
                        .with_registry(|registry| registry.restore_bundled_defaults())?;
                    let _ = crate::services::status_bar::refresh_status_bar(app);
                    let mut errors = Vec::new();
                    let mut restored_ids = Vec::new();
                    for record in records.iter().filter(|record| {
                        record.source == crate::plugins::contracts::PluginSource::Bundled
                    }) {
                        restored_ids.push(record.name.clone());
                        if let Err(error) = crate::plugins::lifecycle::changed(
                            app,
                            &record.name,
                            record.enabled,
                            "restored",
                            None,
                        ) {
                            errors.push(format!("{}: {error}", record.name));
                        }
                    }
                    // The registry has committed even if a native adapter fails;
                    // every window must still receive the authoritative revision.
                    publish_registry(app, restored_ids, "restored");
                    if !errors.is_empty() {
                        return Err(errors.join("; "));
                    }
                    Ok(records)
                },
            )
    })
    .await
}

async fn run_plugin_worker<T: Send + 'static>(
    app: tauri::AppHandle,
    operation: impl FnOnce(&tauri::AppHandle) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || operation(&app))
        .await
        .map_err(|_| "plugin lifecycle worker stopped unexpectedly".to_string())?
}
