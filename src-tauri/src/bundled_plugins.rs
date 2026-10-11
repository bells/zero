#[cfg(any(feature = "bundled-tools", feature = "file-tool"))]
use tauri::Manager;

pub fn manage_states(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    #[cfg(feature = "file-tool")]
    let engine_bridge = crate::services::file::engine_bridge::FileEngineBridgeState::default();
    let builder = builder.manage(crate::plugins::lifecycle::LifecycleCoordinator::new(vec![
        sync_lifecycle,
    ]));
    #[cfg(feature = "bundled-tools")]
    let builder = builder
        .manage(crate::services::caffeine::CaffeineState::default())
        .manage(crate::services::bing_wallpaper::BingWallpaperState::default())
        .manage(crate::services::quick_launcher::QuickLauncherState::default());
    #[cfg(feature = "file-tool")]
    let builder = builder
        .manage(crate::services::file::FileConversionState::default())
        .manage(engine_bridge)
        .manage(crate::services::file::engine_bridge::ocr::FileOcrLeases::default());
    #[cfg(any(feature = "bundled-tools", feature = "file-tool"))]
    let builder = builder.manage(crate::services::ocr::OcrState::default());
    #[cfg(feature = "bundled-tools")]
    let builder = builder
        .manage(crate::services::screenshot::snap_ocr::SnapOcrState::default())
        .manage(crate::services::screenshot::ScreenshotSessionStore::default());
    builder
}

#[cfg(feature = "bundled-tools")]
pub fn start_quick_launcher(app: &tauri::AppHandle) {
    let launcher_state = app.state::<crate::services::quick_launcher::QuickLauncherState>();
    launcher_state.set_enabled(true);

    let launcher_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let initialization_app = launcher_app.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            let trace =
                initialization_app.state::<crate::services::performance::PerformanceTrace>();
            let started = trace.begin();
            let result = initialization_app
                .state::<crate::services::quick_launcher::QuickLauncherState>()
                .initialize(initialization_app.clone());
            trace.finish(
                "launch_initialization",
                if result.is_ok() { "ok" } else { "error" },
                started,
            );
            result
        })
        .await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => launcher_app
                .state::<crate::services::quick_launcher::QuickLauncherState>()
                .add_diagnostic("launcher.initialize_failed", error.message),
            Err(error) => launcher_app
                .state::<crate::services::quick_launcher::QuickLauncherState>()
                .add_diagnostic(
                    "launcher.initialize_join_failed",
                    format!("Launcher startup initialization failed: {error}"),
                ),
        }
    });
}

#[cfg(all(debug_assertions, feature = "file-tool"))]
pub fn start_file_engine_smoke_if_requested(app: &tauri::AppHandle) {
    use crate::services::file::contracts::{
        FileConversionEnqueueItem, FileConversionEnqueueRequest, FileConversionJobState,
    };

    let Ok(source_path) = std::env::var("ZERO_FILE_ENGINE_SMOKE_INPUT") else {
        return;
    };
    let initialization = app
        .path()
        .app_cache_dir()
        .map_err(|_| "The Zero cache directory is unavailable.".to_string())
        .and_then(|cache_root| {
            app.state::<crate::services::file::FileConversionState>()
                .initialize_with_engine(
                    app.clone(),
                    std::sync::Arc::clone(
                        &app.state::<crate::services::file::engine_bridge::FileEngineBridgeState>()
                            .bridge,
                    ),
                    cache_root.join("file-conversion"),
                )
                .map_err(|error| error.message)
        });
    if let Err(error) = initialization {
        eprintln!("ZERO_FILE_ENGINE_SMOKE initialization failed: {error}");
        return;
    }
    let output_directory = std::env::var("ZERO_FILE_ENGINE_SMOKE_OUTPUT")
        .unwrap_or_else(|_| "/private/tmp/zero-file-engine-smoke".into());
    if let Err(error) = std::fs::create_dir_all(&output_directory) {
        eprintln!("ZERO_FILE_ENGINE_SMOKE failed to create output directory: {error}");
        return;
    }
    let state = app.state::<crate::services::file::FileConversionState>();
    let batch = match state.enqueue(FileConversionEnqueueRequest {
        items: vec![FileConversionEnqueueItem {
            source_path,
            output_directory: Some(output_directory),
        }],
    }) {
        Ok(batch) if batch.jobs.len() == 1 => batch,
        Ok(batch) => {
            eprintln!(
                "ZERO_FILE_ENGINE_SMOKE enqueue rejected: {:?}",
                batch.rejected_candidates
            );
            return;
        }
        Err(error) => {
            eprintln!("ZERO_FILE_ENGINE_SMOKE enqueue failed: {error:?}");
            return;
        }
    };
    let job_id = batch.jobs[0].id.clone();
    let (_, should_spawn) = match state.start() {
        Ok(result) => result,
        Err(error) => {
            eprintln!("ZERO_FILE_ENGINE_SMOKE start failed: {error:?}");
            return;
        }
    };
    if should_spawn {
        let worker_app = app.clone();
        tauri::async_runtime::spawn(async move {
            crate::services::file::runtime::run_file_conversion_worker(worker_app).await;
        });
    }
    let monitor_app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            let snapshots = monitor_app
                .state::<crate::services::file::FileConversionState>()
                .snapshots()
                .unwrap_or_default();
            let Some(job) = snapshots.iter().find(|job| job.id == job_id) else {
                continue;
            };
            match &job.state {
                FileConversionJobState::Completed { result } => {
                    eprintln!(
                        "ZERO_FILE_ENGINE_SMOKE completed: {} {:?}",
                        result.output_path, result.quality_profile
                    );
                    break;
                }
                FileConversionJobState::Failed { error }
                | FileConversionJobState::Cancelled { error } => {
                    eprintln!("ZERO_FILE_ENGINE_SMOKE failed: {error:?}");
                    break;
                }
                _ => {}
            }
        }
    });
}

pub fn sync_lifecycle(
    app: &tauri::AppHandle,
    change: &crate::plugins::lifecycle::LifecycleChange<'_>,
) -> Result<(), String> {
    let _ = app;
    match change.plugin_id {
        #[cfg(feature = "bundled-tools")]
        crate::brand::ZERO_LAUNCH_PLUGIN_ID => {
            if change.enabled {
                start_quick_launcher(app);
            } else {
                app.state::<crate::services::quick_launcher::QuickLauncherState>()
                    .set_enabled(false);
            }
            crate::sync_quick_launcher_shortcut(app, change.enabled)?;
        }
        #[cfg(feature = "bundled-tools")]
        crate::brand::ZERO_SNAP_PLUGIN_ID => {
            crate::sync_screenshot_shortcut(app, change.enabled)?;
            if !change.enabled {
                crate::services::screenshot::deactivate_screenshot(app);
            }
        }
        #[cfg(feature = "bundled-tools")]
        crate::brand::ZERO_AWAKE_PLUGIN_ID if !change.enabled => {
            app.state::<crate::services::caffeine::CaffeineState>()
                .set_enabled(false, None)?;
        }
        #[cfg(feature = "file-tool")]
        crate::brand::ZERO_FILE_PLUGIN_ID => {
            use crate::services::file::runtime::FileCapabilityInvalidationCause as Cause;
            let cause = match change.reason {
                "installed" if change.previous_version.is_some() => Cause::EngineUpgraded,
                "installed" => Cause::EngineInstalled,
                "removed" => Cause::EngineRemoved,
                _ if change.enabled => Cause::EngineRepaired,
                _ => Cause::EngineRemoved,
            };
            app.state::<crate::services::file::FileConversionState>()
                .invalidate_capabilities(cause);
            app.state::<crate::services::file::engine_bridge::FileEngineBridgeState>()
                .bridge
                .reset_and_destroy(app, "The Zero File engine lifecycle changed.");
        }
        _ => {}
    }
    Ok(())
}

pub fn register_diagnostics(app: &tauri::AppHandle) {
    #[cfg(any(feature = "bundled-tools", feature = "file-tool"))]
    use crate::services::diagnostics::Diagnostics;
    let _ = app;
    #[cfg(any(feature = "bundled-tools", feature = "file-tool"))]
    let diagnostics = app.state::<std::sync::Arc<Diagnostics>>();
    #[cfg(feature = "bundled-tools")]
    {
        let owner = app.clone();
        diagnostics.register("zero.snap", move || {
            owner
                .state::<crate::services::screenshot::ScreenshotSessionStore>()
                .diagnostic_health()
        });
    }
    #[cfg(feature = "bundled-tools")]
    {
        let owner = app.clone();
        diagnostics.register("zero.awake", move || {
            owner
                .state::<crate::services::caffeine::CaffeineState>()
                .diagnostic_health()
        });
    }
    #[cfg(feature = "bundled-tools")]
    {
        let owner = app.clone();
        diagnostics.register("zero.paper", move || {
            owner
                .state::<crate::services::bing_wallpaper::BingWallpaperState>()
                .diagnostic_health()
        });
    }
    #[cfg(feature = "bundled-tools")]
    {
        let owner = app.clone();
        diagnostics.register("zero.launch", move || {
            owner
                .state::<crate::services::quick_launcher::QuickLauncherState>()
                .diagnostic_health()
        });
    }
    #[cfg(feature = "file-tool")]
    {
        let owner = app.clone();
        diagnostics.register("zero.file", move || {
            let mut health = owner
                .state::<crate::services::file::FileConversionState>()
                .diagnostic_health()?;
            let approved = owner
                .state::<crate::plugins::registry::PluginRegistryState>()
                .try_read_registry(|r| {
                    r.records()
                        .iter()
                        .find(|p| p.name == "zero.file")
                        .is_some_and(|p| {
                            p.enabled
                                && p.package_sha256.as_deref().is_some_and(|digest| {
                                    crate::plugins::package::is_approved_engine_package(
                                        &p.name, &p.version, digest,
                                    )
                                })
                        })
                })
                .map_err(|_| {
                    crate::services::diagnostics::contracts::DiagnosticsError::new("unavailable")
                })?;
            health.metadata.approved = Some(approved);
            health.metadata.dev_fallback = owner
                .state::<crate::services::file::engine_bridge::FileEngineBridgeState>()
                .bridge
                .diagnostic_dev_fallback()?;
            Ok(health)
        });
    }
}
