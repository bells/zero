//! Installs the three development archives in a disposable registry and checks the packaged engine.
//! Set TAURI_CONFIG to the QA bundle config and enable tauri/custom-protocol for embedded assets.
#[cfg(not(all(
    target_os = "macos",
    feature = "file-engine",
    feature = "screen-capture"
)))]
fn main() {
    panic!(
        "Build the macOS smoke with --no-default-features --features file-engine,screen-capture"
    );
}

#[cfg(all(
    target_os = "macos",
    feature = "file-engine",
    feature = "screen-capture"
))]
mod macos {
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Manager, WebviewWindow};
    use zero_lib::plugins::{
        contracts::{InstallPluginPackageInput, PluginPermission},
        engine_assets, invoke_gate,
        package::validate_zplugin_package,
        registry::{PluginRegistry, PluginRegistryState},
        web_assets, web_runtime,
    };
    use zero_lib::services::file::{
        artifacts::validate_provider_output,
        built_in::ZeroFileBuiltInProvider,
        contracts::{FileConversionDirection, FileConversionError, FileConversionProgress},
        engine_bridge::{self, FileEngineBridgeState},
        provider::{
            FileConversionCancellationToken, FileConversionProgressSink, FileConversionProvider,
            ProviderConversionRequest,
        },
    };

    #[derive(Default)]
    struct Views(Mutex<HashSet<String>>);

    #[tauri::command]
    fn saw_ready_content(window: WebviewWindow, state: tauri::State<'_, Views>) {
        if window.label().starts_with("plugin-") {
            state.0.lock().unwrap().insert(window.label().into());
        }
    }

    struct Progress;
    impl FileConversionProgressSink for Progress {
        fn report(&self, _: FileConversionProgress) -> Result<(), FileConversionError> {
            Ok(())
        }
    }

    fn verify_views(app: &AppHandle, ids: &[&str]) -> Result<(), String> {
        let probes = [
            "document.querySelector('[role=option]')",
            "document.querySelector('#capture:not([disabled])')",
            "document.querySelector('main .selection button:not([disabled])')",
        ];
        for (id, probe) in ids.iter().zip(probes) {
            let session = tauri::async_runtime::block_on(web_runtime::open_plugin_view(
                web_runtime::OpenPluginViewInput {
                    plugin_id: (*id).into(),
                    view_id: format!("{id}.main"),
                },
                app.clone(),
            ))
            .map_err(|error| error.code)?;
            let label = format!("plugin-{}", session.session_id);
            let window = app
                .get_webview_window(&label)
                .ok_or("Missing installed plugin window")?;
            let deadline = Instant::now() + Duration::from_secs(12);
            let script = format!(
                "if ({probe}) void window.__TAURI_INTERNALS__.invoke('saw_ready_content');"
            );
            while Instant::now() < deadline {
                window.eval(&script).map_err(|error| error.to_string())?;
                if app.state::<Views>().0.lock().unwrap().contains(&label) {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            if !app.state::<Views>().0.lock().unwrap().contains(&label) {
                return Err(format!("{id} did not render its installed view"));
            }
            eprintln!("TOOLS_QA view {id} rendered");
            web_runtime::revoke(app, id).map_err(|error| error.code)?;
        }
        Ok(())
    }

    fn verify_engine(app: &AppHandle, root: &Path, fixture_root: &Path) -> Result<(), String> {
        use FileConversionDirection::{DocxToPdf, PdfToDocx};
        let engine = Arc::clone(&app.state::<FileEngineBridgeState>().bridge);
        let fixtures = [
            (
                PdfToDocx,
                "editable-simple.pdf",
                "pdf-to-docx",
                ZeroFileBuiltInProvider::pdf_to_docx(app.clone(), engine.clone()),
            ),
            (
                DocxToPdf,
                "quality/D01.docx",
                "docx-to-pdf",
                ZeroFileBuiltInProvider::docx_to_pdf_macos(app.clone(), engine),
            ),
        ];
        for (direction, fixture, name, provider) in fixtures {
            let workspace = root.join(name);
            std::fs::create_dir(&workspace).map_err(|error| error.to_string())?;
            let file_name = Path::new(fixture).file_name().ok_or("Invalid fixture")?;
            let staged = workspace.join(file_name);
            std::fs::copy(fixture_root.join(fixture), &staged)
                .map_err(|error| error.to_string())?;
            let output = provider
                .convert(
                    &ProviderConversionRequest {
                        job_id: name.into(),
                        direction,
                        source_path: staged,
                        temp_directory: workspace,
                    },
                    &Progress,
                    &FileConversionCancellationToken::default(),
                )
                .map_err(|error| format!("{name}: {:?} {}", error.code, error.message))?;
            validate_provider_output(&output.path, direction).map_err(|error| error.message)?;
            eprintln!(
                "TOOLS_QA conversion {name} engine={} output=valid",
                output.engine_version.as_deref().unwrap_or("missing")
            );
        }
        Ok(())
    }

    pub fn run() {
        let paths: Vec<PathBuf> = std::env::args().skip(1).map(PathBuf::from).collect();
        assert_eq!(
            paths.len(),
            3,
            "Arguments: import-directory synthetic-fixture-directory disposable-root"
        );
        let root = paths[2].canonicalize().unwrap();
        let mut registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
        let packages = [
            (
                "example.launch",
                vec![
                    PluginPermission::SystemAppsRead,
                    PluginPermission::SystemAppsExecute,
                    PluginPermission::SystemWindowFocus,
                    PluginPermission::StoragePlugin,
                ],
            ),
            ("example.snap", vec![PluginPermission::ScreenCapture]),
            ("example.file", vec![PluginPermission::DocumentsConvert]),
        ];
        for (id, approved_permissions) in packages {
            let package = paths[0]
                .join(format!("{id}-0.1.0.zplugin"))
                .canonicalize()
                .unwrap();
            let report = validate_zplugin_package(&package).unwrap();
            registry
                .install_local_package(InstallPluginPackageInput {
                    package_path: package.to_string_lossy().into(),
                    expected_sha256: Some(report.sha256),
                    approved_permissions,
                    publisher_signature: None,
                    enabled: Some(true),
                })
                .unwrap();
        }
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        let normal = invoke_gate::gate(tauri::generate_handler![
            web_runtime::plugin_session_ready,
            web_runtime::plugin_invoke,
            web_runtime::plugin_cancel,
            web_runtime::plugin_upload,
            engine_bridge::file_engine_ready,
            engine_bridge::file_engine_read_input,
            engine_bridge::file_engine_write_output,
            engine_bridge::file_engine_progress,
            engine_bridge::file_engine_complete,
            engine_bridge::file_engine_print_rendered,
            engine_bridge::file_engine_inspect_fonts,
        ]);
        let report: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool =
            tauri::generate_handler![saw_ready_content];
        let fixtures = paths[1].clone();
        let builder = tauri::Builder::default()
            .manage(zero_lib::plugins::lifecycle::LifecycleCoordinator::default())
            .manage(zero_lib::services::power_lease::PowerLeaseState::default())
            .manage(zero_lib::services::network_fetch::NetworkFetchState::default())
            .manage(zero_lib::plugins::media_runtime::NativeMediaState::default())
            .manage(zero_lib::plugins::background_runtime::BackgroundRuntime::default())
            .manage(zero_lib::services::ocr::OcrState::default());
        web_assets::register(engine_assets::register(builder))
            .manage(PluginRegistryState::from_registry(registry))
            .manage(FileEngineBridgeState::default())
            .manage(engine_bridge::ocr::FileOcrLeases::default())
            .manage(Views::default())
            .invoke_handler(move |invoke| {
                if invoke.message.command() == "saw_ready_content" {
                    report(invoke)
                } else {
                    normal(invoke)
                }
            })
            .setup(move |app| {
                tauri::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::External("about:blank".parse().unwrap()),
                )
                .visible(false)
                .build()?;
                let app = app.handle().clone();
                let root = root.clone();
                let fixtures = fixtures.clone();
                thread::spawn(move || {
                    thread::spawn(|| {
                        thread::sleep(Duration::from_secs(70));
                        std::process::exit(2);
                    });
                    let result =
                        verify_views(&app, &["example.launch", "example.snap", "example.file"])
                            .and_then(|()| verify_engine(&app, &root, &fixtures));
                    eprintln!("TOOLS_QA result={result:?}");
                    if result.is_err() {
                        std::process::exit(1);
                    }
                    app.exit(0);
                });
                Ok(())
            })
            .run(context)
            .expect("Tools QA smoke runtime");
    }
}
#[cfg(all(
    target_os = "macos",
    feature = "file-engine",
    feature = "screen-capture"
))]
fn main() {
    macos::run();
}
