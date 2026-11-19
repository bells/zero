use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicI32, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::Manager;
use zero_lib::plugins::{
    background_runtime::BackgroundRuntime,
    contracts::{InstallPluginPackageInput, PluginPermission},
    invoke_gate,
    protocol::{PluginError, PluginInvokeInput, PluginResponse, ViewSurface},
    registry::{PluginRegistry, PluginRegistryState},
    web_assets, web_runtime,
};

#[derive(Default)]
struct Probe(Mutex<Vec<(String, bool)>>);

#[tauri::command]
async fn plugin_invoke(
    input: PluginInvokeInput,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<PluginResponse, PluginError> {
    let method = input.request.method.clone();
    // The smoke exercises the real read path without changing the desktop or opening Save.
    assert!(!matches!(
        method.as_str(),
        "wallpaper.apply" | "media.exportImage"
    ));
    let result = web_runtime::plugin_invoke(input, window, app.clone()).await;
    let (success, code) = match &result {
        Ok(PluginResponse::Success { .. }) => (true, "ok"),
        Ok(PluginResponse::Failure { error, .. }) | Err(error) => (false, error.code.as_str()),
    };
    eprintln!("PAPER_SMOKE method={method} result={code}");
    app.state::<Probe>()
        .0
        .lock()
        .unwrap()
        .push((method, success));
    result
}

fn probe_ui(window: &tauri::WebviewWindow, storage: &Path, key: &str) -> Option<bool> {
    let key_json = serde_json::to_string(key).unwrap();
    let script = format!(
        r#"(() => {{
        const transport = window.__ZERO_PLUGIN_TRANSPORT__;
        if (!document.querySelector('.paper-package')) return;
        const image = document.querySelector('.paper-preview img');
        const toggle = document.querySelector('#paper-daily');
        const ready = !!image && image.complete && image.naturalWidth > 0 &&
          !!toggle && !toggle.checked && !toggle.disabled &&
          !document.querySelector('[role="alert"], button[aria-busy="true"]');
        void transport.request({{protocolVersion:'1.0.0', requestId:crypto.randomUUID(),
          sessionId:transport.session.sessionId, generation:transport.session.generation,
          method:'storage.set', payload:{{key:{key_json}, value:ready}}}});
        }})()"#
    );
    window.eval(&script).ok()?;
    for _ in 0..20 {
        if let Some(value) = std::fs::read(storage)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|data| data.get(key).and_then(|value| value.as_bool()))
        {
            return Some(value);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    None
}

fn wait_ui(window: &tauri::WebviewWindow, storage: &Path, prefix: &str) -> Result<(), String> {
    for attempt in 0..20 {
        if probe_ui(window, storage, &format!("{prefix}.{attempt}")) == Some(true) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err(format!(
        "{prefix}: live image/UI not ready with daily automation off"
    ))
}

fn open_view(
    app: &tauri::AppHandle,
    plugin_id: &str,
    view_id: &str,
) -> Result<zero_lib::plugins::protocol::PluginSessionInfo, PluginError> {
    tauri::async_runtime::block_on(web_runtime::open_plugin_view(
        web_runtime::OpenPluginViewInput {
            plugin_id: plugin_id.into(),
            view_id: view_id.into(),
        },
        app.clone(),
    ))
}

fn read_storage(path: &Path) -> Result<serde_json::Value, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn wait_closed(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    for _ in 0..20 {
        if app.get_webview_window(label).is_none() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Err("closed Paper view remained registered".into())
}

fn main() {
    assert_eq!(std::env::var("ZERO_PLUGIN_WEB_DEV").as_deref(), Ok("1"));
    let package = PathBuf::from(std::env::args().nth(1).expect("development .zplugin path"));
    let root = std::env::temp_dir().join(format!("zero-paper-smoke-{}", std::process::id()));
    std::fs::create_dir(&root).expect("fresh isolated root");
    let root = root.canonicalize().expect("canonical isolated root");
    let registry_root = root.join("plugins");
    let mut registry = PluginRegistry::load_or_seed(&registry_root).unwrap();
    let install_input = InstallPluginPackageInput {
        publisher_signature: None,
        expected_sha256: Some(
            zero_lib::plugins::package::validate_zplugin_package(&package)
                .unwrap()
                .sha256,
        ),
        package_path: package.canonicalize().unwrap().to_string_lossy().into(),
        approved_permissions: vec![
            PluginPermission::StoragePlugin,
            PluginPermission::Network,
            PluginPermission::SystemWallpaper,
            PluginPermission::FilesExport,
            PluginPermission::BackgroundSchedule,
        ],
        enabled: Some(true),
    };
    let record = registry
        .install_local_package(install_input.clone())
        .unwrap();
    let view = record
        .protocol_manifest
        .as_ref()
        .unwrap()
        .contributes
        .views
        .iter()
        .find(|view| view.surface == ViewSurface::Main)
        .unwrap()
        .id
        .clone();
    let storage = registry.plugin_data_root(&record.name).join("storage.json");
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let exit_code = Arc::new(AtomicI32::new(2));
    let result_code = exit_code.clone();
    let app = web_assets::register(tauri::Builder::default())
        .manage(PluginRegistryState::from_registry(registry))
        .manage(zero_lib::plugins::lifecycle::LifecycleCoordinator::default())
        .manage(zero_lib::services::power_lease::PowerLeaseState::default())
        .manage(zero_lib::services::network_fetch::NetworkFetchState::default())
        .manage(zero_lib::plugins::media_runtime::NativeMediaState::default())
        .manage(BackgroundRuntime::default())
        .manage(Probe::default())
        .invoke_handler(invoke_gate::gate(tauri::generate_handler![
            web_runtime::plugin_session_ready,
            plugin_invoke,
            web_runtime::plugin_cancel
        ]))
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .visible(false)
            .build()?;
            let app = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::spawn(|| {
                    std::thread::sleep(Duration::from_secs(90));
                    std::process::exit(2);
                });
                let result = (|| -> Result<(), String> {
                    for pass in 0..2 {
                        let info =
                            open_view(&app, &record.name, &view).map_err(|error| error.code)?;
                        let window = app
                            .get_webview_window(&format!("plugin-{}", info.session_id))
                            .ok_or("missing Paper view")?;
                        wait_ui(&window, &storage, &format!("qa.paper.{pass}"))?;
                        eprintln!(
                            "PAPER_SMOKE rendered_live_image=true pass={pass} daily_off=true"
                        );
                        if pass == 0 {
                            zero_lib::services::surface_activity::destroy_surface(&window)
                                .map_err(|error| error.to_string())?;
                            wait_closed(&app, window.label())?;
                            continue;
                        }
                        web_runtime::revoke(&app, &record.name).map_err(|error| error.code)?;
                        let registry = app.state::<PluginRegistryState>();
                        registry.with_registry(|r| r.set_enabled_and_save(&record.name, false))?;
                        wait_closed(&app, window.label())?;
                        if open_view(&app, &record.name, &view).is_ok() {
                            return Err("disabled Paper view remained available".into());
                        }
                        eprintln!("PAPER_SMOKE disabled_view_revoked=true");
                        registry.with_registry(|r| r.set_enabled_and_save(&record.name, true))?;
                    }
                    let enabled =
                        open_view(&app, &record.name, &view).map_err(|error| error.code)?;
                    let window = app
                        .get_webview_window(&format!("plugin-{}", enabled.session_id))
                        .ok_or("missing re-enabled Paper view")?;
                    wait_ui(&window, &storage, "qa.enabled")?;
                    web_runtime::revoke(&app, &record.name).map_err(|error| error.code)?;
                    let before_uninstall = read_storage(&storage)?;
                    if before_uninstall.get("paper.archive.v1").is_none() {
                        return Err("Paper did not persist its archive".into());
                    }
                    let registry = app.state::<PluginRegistryState>();
                    registry.with_registry(|r| r.uninstall_plugin(&record.name))?;
                    let reloaded = PluginRegistry::load_or_seed(registry_root)?;
                    if reloaded.records().iter().any(|r| r.name == record.name)
                        || open_view(&app, &record.name, &view).is_ok()
                    {
                        return Err("uninstalled Paper remained available".into());
                    }
                    if read_storage(&storage)? != before_uninstall {
                        return Err("uninstall changed Paper storage".into());
                    }
                    let reinstalled =
                        registry.with_registry(|r| r.install_local_package(install_input))?;
                    if reinstalled.package_sha256 != record.package_sha256
                        || read_storage(&storage)? != before_uninstall
                    {
                        return Err("reinstall changed package identity or retained storage".into());
                    }
                    let info = open_view(&app, &record.name, &view).map_err(|error| error.code)?;
                    let window = app
                        .get_webview_window(&format!("plugin-{}", info.session_id))
                        .ok_or("missing reinstalled Paper view")?;
                    wait_ui(&window, &storage, "qa.reinstalled")?;
                    eprintln!("PAPER_SMOKE reenable_reload_reinstall_storage=true");
                    let probe = app.state::<Probe>();
                    let calls = probe.0.lock().unwrap();
                    for method in [
                        "network.fetch",
                        "media.cacheImage",
                        "media.preview",
                        "wallpaper.platform",
                    ] {
                        if !calls.iter().any(|(seen, ok)| seen == method && *ok) {
                            return Err(format!("no successful {method}"));
                        }
                    }
                    if calls.iter().any(|(_, ok)| !ok) {
                        return Err("one or more native requests failed".into());
                    }
                    Ok(())
                })();
                let revoked = web_runtime::revoke(&app, &record.name);
                let passed = result.is_ok() && revoked.is_ok();
                eprintln!("PAPER_SMOKE result={result:?} revoke={revoked:?}");
                result_code.store(if passed { 0 } else { 1 }, Ordering::SeqCst);
                app.exit(if passed { 0 } else { 1 });
            });
            Ok(())
        })
        .build(context)
        .expect("native Paper smoke runtime");
    app.run_return(|_, _| {});
    let _ = std::fs::remove_dir_all(root);
    std::process::exit(exit_code.load(Ordering::SeqCst));
}
