//! Isolated development-only scheduler smoke. No user's registry or desktop effects.
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use zero_lib::plugins::{
    background_runtime::{self, BackgroundRuntime},
    contracts::{InstallPluginPackageInput, PluginPermission},
    invoke_gate,
    registry::{PluginRegistry, PluginRegistryState},
    web_assets,
    web_runtime::{self, OpenPluginViewInput},
};
fn storage(path: &Path) -> serde_json::Value {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(serde_json::Value::Null)
}
fn wait(path: &Path, predicate: impl Fn(&serde_json::Value) -> bool) -> Result<(), String> {
    for _ in 0..100 {
        if predicate(&storage(path)) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err("storage marker timed out".into())
}
fn main() {
    assert_eq!(std::env::var("ZERO_PLUGIN_WEB_DEV").as_deref(), Ok("1"));
    let package = PathBuf::from(std::env::args().nth(1).expect("development .zplugin path"))
        .canonicalize()
        .unwrap();
    let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
        "zero-background-smoke-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let mut registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
    let report = zero_lib::plugins::package::validate_zplugin_package(&package).unwrap();
    assert!(report.valid, "{:?}", report.issues);
    registry
        .install_local_package(InstallPluginPackageInput {
            publisher_signature: None,
            expected_sha256: Some(report.sha256),
            package_path: package.to_string_lossy().into(),
            approved_permissions: vec![
                PluginPermission::StoragePlugin,
                PluginPermission::BackgroundSchedule,
                PluginPermission::UiMessage,
            ],
            enabled: Some(true),
        })
        .unwrap();
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    web_assets::register(tauri::Builder::default())
        .manage(PluginRegistryState::from_registry(registry))
        .manage(zero_lib::plugins::lifecycle::LifecycleCoordinator::default())
        .manage(zero_lib::services::network_fetch::NetworkFetchState::default())
        .manage(zero_lib::services::power_lease::PowerLeaseState::default())
        .manage(zero_lib::plugins::media_runtime::NativeMediaState::default())
        .manage(BackgroundRuntime::default())
        .invoke_handler(invoke_gate::gate(tauri::generate_handler![
            web_runtime::plugin_session_ready,
            web_runtime::plugin_invoke,
            web_runtime::plugin_cancel
        ]))
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "smoke-host",
                tauri::WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .visible(false)
            .focused(false)
            .focusable(false)
            .build()?;
            background_runtime::initialize(app.handle());
            let app = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::spawn(|| {
                    std::thread::sleep(Duration::from_secs(30));
                    std::process::exit(2);
                });
                let run = (|| -> Result<(), String> {
                    assert!(
                        app.webview_windows()
                            .keys()
                            .all(|label| !label.starts_with("plugin-")),
                        "empty core must create no tool workers"
                    );
                    let info = tauri::async_runtime::block_on(web_runtime::open_plugin_view(
                        OpenPluginViewInput {
                            plugin_id: "example.background".into(),
                            view_id: "example.background.main".into(),
                        },
                        app.clone(),
                    ))
                    .map_err(|e| e.code)?;
                    let marker = root.join("data/plugins/example.background/storage.json");
                    wait(&marker, |v| {
                        v["scheduled"].is_number() && v["forgeryRejected"] == true
                    })?;
                    let label = format!("plugin-{}", info.session_id);
                    let window = app.get_webview_window(&label).ok_or("view missing")?;
                    zero_lib::services::surface_activity::destroy_surface(&window)
                        .map_err(|e| e.to_string())?;
                    eprintln!("ZERO_BACKGROUND_SMOKE ordinary view closed before due event");
                    wait(&marker, |v| {
                        v["marker"]["count"] == 1 && v["marker"]["interactiveDenied"] == true
                    })?;
                    // Completion first persists next schedule, then removes its hidden view.
                    let mut clean = false;
                    for _ in 0..50 {
                        if app
                            .webview_windows()
                            .keys()
                            .all(|label| !label.starts_with("plugin-"))
                        {
                            clean = true;
                            break;
                        }
                        for view in app
                            .webview_windows()
                            .values()
                            .filter(|view| view.label().starts_with("plugin-"))
                        {
                            assert!(!view.is_visible().unwrap_or(true), "worker became visible");
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    if !clean {
                        return Err("hidden worker did not clean up".into());
                    }
                    let before = storage(&marker);
                    eprintln!(
                        "ZERO_BACKGROUND_SMOKE hidden context/storage/completion cleanup passed"
                    );
                    app.state::<zero_lib::plugins::lifecycle::LifecycleCoordinator>()
                        .run("example.background", || {
                            web_runtime::revoke(&app, "example.background").map_err(|e| e.code)?;
                            app.state::<PluginRegistryState>().with_registry(|r| {
                                r.set_enabled("example.background", false)?;
                                r.save()
                            })
                        })?;
                    std::thread::sleep(Duration::from_millis(3500));
                    if storage(&marker) != before
                        || !app
                            .webview_windows()
                            .keys()
                            .all(|label| !label.starts_with("plugin-"))
                    {
                        return Err("revoked next event ran".into());
                    }
                    eprintln!(
                        "ZERO_BACKGROUND_SMOKE disable revoked next schedule; no later execution"
                    );
                    Ok(())
                })();
                background_runtime::shutdown(&app);
                app.state::<zero_lib::services::network_fetch::NetworkFetchState>()
                    .shutdown();
                app.state::<zero_lib::services::power_lease::PowerLeaseState>()
                    .shutdown();
                eprintln!(
                    "ZERO_BACKGROUND_SMOKE result={run:?}; temporary_root={}",
                    root.display()
                );
                let exit = if run.is_ok() { 0 } else { 1 };
                // Keep failed evidence only; remove solely this smoke's own temporary tree.
                if run.is_ok() {
                    let _ = fs::remove_dir_all(&root);
                }
                app.exit(exit);
                std::thread::sleep(Duration::from_secs(2));
                std::process::exit(exit);
            });
            Ok(())
        })
        .run(context)
        .expect("background native smoke runtime");
}
