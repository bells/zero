use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zero_lib::plugins::{
    contracts::{InstallPluginPackageInput, PluginPermission},
    invoke_gate,
    registry::{PluginRegistry, PluginRegistryState},
    web_assets,
    web_runtime::{self, OpenPluginViewInput},
};

fn open_input() -> OpenPluginViewInput {
    OpenPluginViewInput {
        plugin_id: "example.notes".into(),
        view_id: "example.notes.main".into(),
    }
}
fn wait_note(path: &std::path::Path, expected: &str) -> bool {
    for _ in 0..60 {
        if fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .is_some_and(|data| data["note"] == expected)
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}
fn main() {
    assert_eq!(std::env::var("ZERO_PLUGIN_WEB_DEV").as_deref(), Ok("1"));
    let package = std::env::args()
        .nth(1)
        .expect("path to development notes .zplugin");
    let root = std::env::temp_dir().join(format!(
        "zero-web-smoke-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let mut registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
    let record = registry
        .install_local_package(InstallPluginPackageInput {
            expected_sha256: Some(
                zero_lib::plugins::package::validate_zplugin_package(std::path::Path::new(
                    &package,
                ))
                .unwrap()
                .sha256,
            ),
            package_path: PathBuf::from(package)
                .canonicalize()
                .unwrap()
                .to_string_lossy()
                .into(),
            approved_permissions: vec![PluginPermission::StoragePlugin],
            enabled: Some(true),
        })
        .unwrap();
    eprintln!(
        "ZERO_WEB_SMOKE installed digest={}",
        record.package_sha256.unwrap()
    );
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let builder = web_assets::register(tauri::Builder::default())
        .manage(PluginRegistryState::from_registry(registry))
        .manage(zero_lib::plugins::lifecycle::LifecycleCoordinator::default());
    builder.invoke_handler(invoke_gate::gate(tauri::generate_handler![web_runtime::plugin_session_ready,web_runtime::plugin_invoke,web_runtime::plugin_cancel]))
        .setup(move |app|{
            tauri::WebviewWindowBuilder::new(app,"main",tauri::WebviewUrl::External("about:blank".parse().unwrap())).title("Zero plugin smoke host — closes automatically").inner_size(400.0,180.0).build()?;

            let app=app.handle().clone();
            std::thread::spawn(move || {
                // Independent watchdog prevents a failed native setup from hanging the test.
                std::thread::spawn(||{std::thread::sleep(Duration::from_secs(25));std::process::exit(2);});
                let run=(||->Result<(),String>{
                    let info=tauri::async_runtime::block_on(web_runtime::open_plugin_view(open_input(),app.clone())).map_err(|e|e.message)?;
                    std::thread::sleep(Duration::from_secs(2));
                    let label=format!("plugin-{}",info.session_id);
                    let window=app.get_webview_window(&label).ok_or("missing first window")?;
                    window.eval("document.querySelector('#note').value='native-smoke';document.querySelector('#save').click();").map_err(|e|e.to_string())?;
                    let storage=root.join("data/plugins/example.notes/storage.json");
                    if !wait_note(&storage,"native-smoke"){return Err("first storage commit failed".into());}
                    eprintln!("ZERO_WEB_SMOKE first storage commit passed");
                    web_runtime::revoke(&app,"example.notes");
                    app.state::<PluginRegistryState>().with_registry(|r|{r.set_enabled("example.notes",false)?;r.save()})?;
                    assert!(app.state::<web_assets::WebSessions>().0.lock().unwrap().get(&info.session_id,&label,info.generation).is_err());
                    app.state::<PluginRegistryState>().with_registry(|r|{r.set_enabled("example.notes",true)?;r.save()})?;
                    let second=tauri::async_runtime::block_on(web_runtime::open_plugin_view(open_input(),app.clone())).map_err(|e|e.message)?;
                    assert!(second.generation>info.generation);
                    std::thread::sleep(Duration::from_secs(2));
                    app.get_webview_window(&format!("plugin-{}",second.session_id)).ok_or("missing second window")?.eval("const note=document.querySelector('#note');note.value=note.value==='native-smoke'?'restored':'RESTORE FAILED';document.querySelector('#save').click();").map_err(|e|e.to_string())?;
                    if !wait_note(&storage,"restored"){return Err("storage restoration failed".into());}
                    web_runtime::revoke(&app,"example.notes");
                    app.state::<PluginRegistryState>().with_registry(|r|r.uninstall_plugin("example.notes"))?;
                    if !storage.exists(){return Err("uninstall deleted persistent data".into());}
                    eprintln!("ZERO_WEB_SMOKE re-enable, generation revocation, restore and uninstall data preservation passed");
                    Ok(())
                })();
                eprintln!("ZERO_WEB_SMOKE result={run:?}");
                let exit=if run.is_ok(){0}else{1};app.exit(exit);
                std::thread::sleep(Duration::from_secs(2));std::process::exit(exit);
            });Ok(())
        }).run(context).expect("native smoke runtime");
}
