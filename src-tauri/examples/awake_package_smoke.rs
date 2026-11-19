use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicI32, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::Manager;
use zero_lib::plugins::{
    contracts::{InstallPluginPackageInput, PluginPermission},
    invoke_gate,
    protocol::{PluginError, PluginInvokeInput, PluginResponse},
    registry::{PluginRegistry, PluginRegistryState},
    web_assets, web_runtime,
};

#[derive(Default)]
struct Probe(Mutex<Vec<(String, bool)>>);

fn ready_ui(window: &tauri::WebviewWindow, storage: &std::path::Path, key: &str) -> bool {
    let key_json = serde_json::to_string(key).unwrap();
    let script = format!(
        r#"(() => {{
        const transport = window.__ZERO_PLUGIN_TRANSPORT__;
        const primary = document.querySelector('button.primary');
        const ready = !!primary && !primary.matches(':disabled') && !document.querySelector('[role="alert"]');
        void transport.request({{protocolVersion:'1.0.0', requestId:crypto.randomUUID(),
          sessionId:transport.session.sessionId, generation:transport.session.generation,
          method:'storage.set', payload:{{key:{key_json}, value:ready}}}});
    }})()"#
    );
    if window.eval(&script).is_err() {
        return false;
    }
    for _ in 0..30 {
        if let Some(value) = std::fs::read(storage)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|data| data.get(key).and_then(|value| value.as_bool()))
        {
            return value;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

#[tauri::command]
async fn plugin_invoke(
    input: PluginInvokeInput,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<PluginResponse, PluginError> {
    let method = input.request.method.clone();
    let result = web_runtime::plugin_invoke(input, window, app.clone()).await;
    let (success, code) = match &result {
        Ok(PluginResponse::Success { .. }) => (true, "ok"),
        Ok(PluginResponse::Failure { error, .. }) | Err(error) => (false, error.code.as_str()),
    };
    eprintln!("AWAKE_SMOKE method={method} result={code}");
    app.state::<Probe>()
        .0
        .lock()
        .unwrap()
        .push((method, success));
    result
}

fn main() {
    assert_eq!(std::env::var("ZERO_PLUGIN_WEB_DEV").as_deref(), Ok("1"));
    let package = PathBuf::from(std::env::args().nth(1).expect("development .zplugin path"));
    let root = std::env::temp_dir().join(format!("zero-awake-smoke-{}", std::process::id()));
    std::fs::create_dir(&root).expect("fresh isolated root");
    let mut registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
    let record = registry
        .install_local_package(InstallPluginPackageInput {
            publisher_signature: None,
            expected_sha256: Some(
                zero_lib::plugins::package::validate_zplugin_package(&package)
                    .unwrap()
                    .sha256,
            ),
            package_path: package.canonicalize().unwrap().to_string_lossy().into(),
            approved_permissions: vec![
                PluginPermission::StoragePlugin,
                PluginPermission::PowerPreventSleep,
            ],
            enabled: Some(true),
        })
        .unwrap();
    let view = record
        .protocol_manifest
        .as_ref()
        .unwrap()
        .contributes
        .views
        .iter()
        .find(|view| view.surface == zero_lib::plugins::protocol::ViewSurface::Main)
        .unwrap()
        .id
        .clone();
    let storage = registry.plugin_data_root(&record.name).join("storage.json");
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let exit_code = Arc::new(AtomicI32::new(2));
    let result_code = exit_code.clone();
    web_assets::register(tauri::Builder::default())
        .manage(PluginRegistryState::from_registry(registry))
        .manage(zero_lib::plugins::lifecycle::LifecycleCoordinator::default())
        .manage(zero_lib::services::power_lease::PowerLeaseState::default())
        .manage(zero_lib::services::network_fetch::NetworkFetchState::default())
        .manage(zero_lib::plugins::media_runtime::NativeMediaState::default())
        .manage(zero_lib::plugins::background_runtime::BackgroundRuntime::default())
        .manage(Probe::default())
        .invoke_handler(invoke_gate::gate(tauri::generate_handler![
            web_runtime::plugin_session_ready,
            plugin_invoke,
            web_runtime::plugin_cancel
        ]))
        .setup(move |app| {
            // A real host keeps its shell windows alive while plugin UI is closed.
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External("about:blank".parse().unwrap()))
                .visible(false).build()?;
            let app = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::spawn(|| {
                    std::thread::sleep(Duration::from_secs(25));
                    std::process::exit(2);
                });
                let result = tauri::async_runtime::block_on(web_runtime::open_plugin_view(
                    web_runtime::OpenPluginViewInput {
                        plugin_id: record.name.clone(),
                        view_id: view.clone(),
                    },
                    app.clone(),
                ));
                let result = (|| -> Result<(), String> {
                    let info = result.map_err(|error| error.code)?;
                    std::thread::sleep(Duration::from_secs(5));
                    let label = format!("plugin-{}", info.session_id);
                    let window = app.get_webview_window(&label).ok_or("missing view")?;
                    if !ready_ui(&window, &storage, "qa.initial") { return Err("initial UI not ready".into()); }
                    eprintln!("AWAKE_SMOKE rendered_initial_ui=true");
                    let owner = app.state::<web_assets::WebSessions>().0.lock().unwrap()
                        .get(&info.session_id, &label, info.generation).map_err(|error| error.code)?.owner.clone();
                    window.eval("document.querySelectorAll('.presets button')[1].click();setTimeout(()=>document.querySelector('button.primary').click(),100);").map_err(|error| error.to_string())?;
                    let mut started = false;
                    for _ in 0..30 {
                        started = app.state::<zero_lib::services::power_lease::PowerLeaseState>()
                            .task_status(&owner).map_err(|error| error.code)?.is_some_and(|task| task.active
                                && task.schedule == zero_lib::plugins::protocol::PowerTaskSchedule::Duration { minutes: 5 });
                        if started { break; }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    if !started { return Err("five minute task did not start".into()); }
                    eprintln!("AWAKE_SMOKE five_minute_native_task=true");
                    zero_lib::services::surface_activity::destroy_surface(&window).map_err(|error| error.to_string())?;
                    std::thread::sleep(Duration::from_millis(200));
                    if !app.state::<zero_lib::services::power_lease::PowerLeaseState>()
                        .task_status(&owner).map_err(|error| error.code)?.is_some_and(|task| task.active) {
                        return Err("closing UI stopped task".into());
                    }
                    let reopened = tauri::async_runtime::block_on(web_runtime::open_plugin_view(
                        web_runtime::OpenPluginViewInput { plugin_id: record.name.clone(), view_id: view }, app.clone()
                    )).map_err(|error| error.code)?;
                    std::thread::sleep(Duration::from_secs(2));
                    let reopened_window = app.get_webview_window(&format!("plugin-{}", reopened.session_id)).ok_or("missing reopened view")?;
                    if !ready_ui(&reopened_window, &storage, "qa.reopened") { return Err("reopened UI not ready".into()); }
                    eprintln!("AWAKE_SMOKE close_reopen_with_native_task=true");
                    Ok(())
                })();
                let revoke_result=web_runtime::revoke(&app, &record.name);
                eprintln!("AWAKE_SMOKE revoke={revoke_result:?}");
                let passed = result.is_ok() && revoke_result.is_ok() && {
                    let probe = app.state::<Probe>();
                    let calls = probe.0.lock().unwrap();
                    ["power.taskStatus", "power.readSnapshot", "storage.get"]
                        .iter()
                        .all(|method| calls.iter().any(|(seen, ok)| seen == method && *ok))
                        && calls.iter().all(|(_, ok)| *ok)
                };
                eprintln!("AWAKE_SMOKE result={result:?} initialization={passed}");
                result_code.store(if passed { 0 } else { 1 }, Ordering::SeqCst);
                app.exit(if passed { 0 } else { 1 });
            });
            Ok(())
        })
        .run(context)
        .expect("native Awake smoke runtime");
    let _ = std::fs::remove_dir_all(root);
    std::process::exit(exit_code.load(Ordering::SeqCst));
}
