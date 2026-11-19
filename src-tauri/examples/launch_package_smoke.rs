//! Run against an unsigned example.launch derivative in a disposable registry.
#[cfg(not(target_os = "macos"))]
fn main() {
    panic!("Launch's development provider requires macOS");
}

#[cfg(target_os = "macos")]
mod macos {
    use std::{
        fs,
        path::{Path, PathBuf},
        thread,
        time::{Duration, Instant},
    };
    use tauri::{AppHandle, Manager, WebviewWindow};
    use zero_lib::plugins::{
        contracts::{InstallPluginPackageInput, PluginPermission},
        invoke_gate,
        protocol::PluginSessionInfo,
        registry::{PluginRegistry, PluginRegistryState},
        web_assets, web_runtime,
    };

    use sha2::{Digest, Sha256};

    const ID: &str = "example.launch";

    fn open(app: &AppHandle, surface: &str) -> Result<(PluginSessionInfo, WebviewWindow), String> {
        let info = tauri::async_runtime::block_on(web_runtime::open_plugin_view(
            web_runtime::OpenPluginViewInput {
                plugin_id: ID.into(),
                view_id: format!("{ID}.{surface}"),
            },
            app.clone(),
        ))
        .map_err(|error| error.code)?;
        let window = app
            .get_webview_window(&format!("plugin-{}", info.session_id))
            .ok_or("Isolated view missing")?;
        Ok((info, window))
    }

    fn wait_for(storage: &Path, key: &str, expected: &str) -> Result<(), String> {
        for _ in 0..100 {
            if fs::read(storage)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                .is_some_and(|value| value[key] == expected)
            {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
        Err(format!("Missing successful probe {key}"))
    }

    fn verify_view(window: &WebviewWindow, storage: &Path, key: &str) -> Result<(), String> {
        let script = format!(
            r#"(() => {{
          const transport = window.__ZERO_PLUGIN_TRANSPORT__;
          const key = {key:?};
          let attempts = 0;
          const timer = setInterval(() => {{
            if (++attempts > 80) clearInterval(timer);
            const options = document.querySelectorAll('[role="option"]');
            if (!options.length || document.querySelector('[role="alert"]')) return;
            clearInterval(timer);
            void transport.request({{protocolVersion:"1.0.0", requestId:crypto.randomUUID(),
              sessionId:transport.session.sessionId, generation:transport.session.generation,
              method:"storage.set", payload:{{key,value:"rendered"}}}});
          }}, 100);
        }})()"#
        );
        window.eval(script).map_err(|error| error.to_string())?;
        wait_for(storage, key, "rendered")
    }

    fn verify_system_calculator(window: &WebviewWindow, storage: &Path) -> Result<(), String> {
        let catalog = zero_lib::services::application_catalog::discover_applications(&|| false)
            .map_err(|error| error.to_string())?;
        let expected = Path::new("/System/Applications/Calculator.app");
        if !catalog.candidates.iter().any(|candidate| {
            candidate.identity == "com.apple.calculator" && candidate.path == expected
        }) {
            return Err("System Calculator is not the indexed Calculator target".into());
        }
        let id = format!("{:x}", Sha256::digest(b"com.apple.calculator"));
        let script = format!(
            r#"(() => {{
          const input = document.querySelector('input[type="search"]');
          if (!input) return;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Calculator');
          input.dispatchEvent(new Event('input', {{bubbles:true}}));
          let remaining = 40;
          const timer = setInterval(() => {{
            const button = document.getElementById("app-{id}");
            if (!--remaining) clearInterval(timer);
            if (!button || button.disabled) return;
            clearInterval(timer);
            button.click();
          }}, 100);
        }})()"#
        );
        window.eval(script).map_err(|error| error.to_string())?;
        for _ in 0..80 {
            if fs::read(storage)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                .is_some_and(|value| value["application-usage.v1"][&id]["count"] == 1)
            {
                eprintln!("LAUNCH_SMOKE calculator_activation_and_usage=ok");
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
        Err("System Calculator did not produce a successful activation receipt".into())
    }

    fn verify_isolated_lifecycle(
        app: &AppHandle,
        storage: &Path,
        open_calculator: bool,
    ) -> Result<(), String> {
        let (first, window) = open(app, "main")?;
        verify_view(&window, storage, "qa.first")?;
        zero_lib::services::surface_activity::destroy_surface(&window)
            .map_err(|error| error.to_string())?;
        let state = app.state::<web_assets::WebSessions>();
        for _ in 0..100 {
            if app.get_webview_window(window.label()).is_none()
                && state
                    .0
                    .lock()
                    .unwrap()
                    .get(&first.session_id, window.label(), first.generation)
                    .is_err()
            {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        let (second, reopened) = open(app, "main")?;
        if first.generation >= second.generation {
            return Err("Closing Launch did not retire its catalog session".into());
        }
        verify_view(&reopened, storage, "qa.reopened")?;
        if open_calculator {
            verify_system_calculator(&reopened, storage)?;
        }
        web_runtime::revoke(app, ID).map_err(|error| error.code)?;
        app.state::<PluginRegistryState>()
            .with_registry(|registry| registry.set_enabled_and_save(ID, false))?;
        let still_live = state
            .0
            .lock()
            .unwrap()
            .get(&second.session_id, reopened.label(), second.generation)
            .is_ok();
        if still_live || open(app, "main").is_ok() {
            return Err("Disabled Launch retained view authority".into());
        }
        Ok(())
    }

    pub fn run() {
        assert_eq!(std::env::var("ZERO_PLUGIN_WEB_DEV").as_deref(), Ok("1"));
        let archive = PathBuf::from(std::env::args().nth(1).expect("Path to example.launch"));
        let open_calculator = std::env::args().nth(2).as_deref() == Some("--open-calculator");
        let root = std::env::temp_dir().join(format!("zero-launch-smoke-{}", std::process::id()));
        fs::create_dir(&root).expect("fresh isolated root");
        let root = root.canonicalize().unwrap();
        let mut registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
        let report = zero_lib::plugins::package::validate_zplugin_package(&archive).unwrap();
        assert!(report
            .protocol_manifest
            .as_ref()
            .is_some_and(|manifest| manifest.id == ID));
        registry
            .install_local_package(InstallPluginPackageInput {
                package_path: archive.canonicalize().unwrap().to_string_lossy().into(),
                expected_sha256: Some(report.sha256),
                publisher_signature: None,
                approved_permissions: vec![
                    PluginPermission::SystemAppsRead,
                    PluginPermission::SystemAppsExecute,
                    PluginPermission::SystemWindowFocus,
                    PluginPermission::StoragePlugin,
                ],
                enabled: Some(true),
            })
            .unwrap();
        let storage = registry.plugin_data_root(ID).join("storage.json");
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        web_assets::register(tauri::Builder::default())
            .manage(PluginRegistryState::from_registry(registry))
            .manage(zero_lib::plugins::lifecycle::LifecycleCoordinator::default())
            .manage(zero_lib::services::power_lease::PowerLeaseState::default())
            .manage(zero_lib::services::network_fetch::NetworkFetchState::default())
            .manage(zero_lib::plugins::media_runtime::NativeMediaState::default())
            .manage(zero_lib::plugins::background_runtime::BackgroundRuntime::default())
            .invoke_handler(invoke_gate::gate(tauri::generate_handler![
                web_runtime::plugin_session_ready,
                web_runtime::plugin_invoke,
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
                let started = Instant::now();
                thread::spawn(move || {
                    thread::spawn(|| {
                        thread::sleep(Duration::from_secs(45));
                        std::process::exit(2);
                    });
                    let result = verify_isolated_lifecycle(&app, &storage, open_calculator);
                    eprintln!(
                        "LAUNCH_SMOKE catalog_render_close_reopen_disable={result:?} elapsed_ms={}",
                        started.elapsed().as_millis()
                    );
                    let status = i32::from(result.is_err());
                    app.exit(status);
                    thread::sleep(Duration::from_secs(1));
                    std::process::exit(status);
                });
                Ok(())
            })
            .run(context)
            .expect("Launch smoke runtime");
    }
}

#[cfg(target_os = "macos")]
fn main() {
    macos::run();
}
