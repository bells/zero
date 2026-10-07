use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;

#[tauri::command]
fn probe_privileged() -> Result<(), String> {
    eprintln!("ZERO_PROBE SECURITY_FAILURE privileged command ran");
    Err("privileged command unexpectedly reached".into())
}

fn main() {
    let started = Instant::now();
    let separate_window = std::env::var("ZERO_PLUGIN_PROBE_LAYOUT").as_deref() == Ok("window");
    let pings = Arc::new(Mutex::new(Vec::new()));
    let protocol_pings = Arc::clone(&pings);
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().app.security.csp = None;
    tauri::Builder::default()
        .invoke_handler(zero_lib::plugins::invoke_gate::gate(tauri::generate_handler![probe_privileged]))
        .register_uri_scheme_protocol("zero-probe", move |_, request| {
            let (kind, bytes) = match request.uri().path() {
                "/host.html" if separate_window => ("text/html", b"<!doctype html><h1>Zero host heartbeat probe</h1><p>Plugin runs in a separate WebView.</p><script src='zero-probe://localhost/host.js'></script>".to_vec()),
                "/host.html" => ("text/html", b"<!doctype html><h1>Zero plugin isolation probe</h1><p>This temporary window closes automatically.</p><iframe sandbox='allow-scripts' src='zero-probe://localhost/plugin.html'></iframe><script src='zero-probe://localhost/host.js'></script>".to_vec()),
                "/host.js" => ("text/javascript", b"setInterval(()=>{const image=new Image();image.src='zero-probe://localhost/ping?t='+Date.now();},250);".to_vec()),
                "/plugin.html" => ("text/html", b"<!doctype html><p>Isolated test plugin</p><script src='zero-probe://localhost/plugin.js'></script>".to_vec()),
                "/plugin.js" if separate_window => ("text/javascript", br#"const report=name=>{const image=new Image();image.src='zero-probe://localhost/'+name;};
(async()=>{
try { await window.__TAURI_INTERNALS__.invoke('probe_privileged'); report('security-failed'); }
catch(error) { report(error.code==='caller.denied' ? 'command-denied' : 'unexpected-command-error'); }
try { await window.__TAURI_INTERNALS__.invoke('plugin:window|set_title',{label:'zero-isolation-probe',title:'UNAUTHORIZED'}); report('security-failed'); }
catch { report('capability-denied'); }
report('plugin-ready');setTimeout(()=>{report('plugin-blocking');setTimeout(()=>{while(true){}},100);},2000);
})();"#.to_vec()),
                "/plugin.js" => ("text/javascript", b"const ready=new Image();ready.src='zero-probe://localhost/plugin-ready';setTimeout(()=>{const blocking=new Image();blocking.src='zero-probe://localhost/plugin-blocking';setTimeout(()=>{while(true){}},100);},2000);".to_vec()),
                "/plugin-ready" | "/plugin-blocking" | "/command-denied" | "/capability-denied" | "/security-failed" | "/unexpected-command-error" => { eprintln!("ZERO_PROBE {} at {}ms", request.uri().path(), started.elapsed().as_millis()); ("image/gif", vec![]) },
                "/ping" => {
                    protocol_pings.lock().unwrap().push(started.elapsed().as_millis());
                    ("image/gif", vec![])
                }
                _ => ("text/plain", vec![]),
            };
            tauri::http::Response::builder()
                .header("Content-Type", kind)
                .header("Cache-Control", "no-store")
                .header("Content-Security-Policy", "default-src 'none'; script-src zero-probe:; img-src zero-probe:; frame-src zero-probe:; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'")
                .body(bytes).unwrap()
        })
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(app, "zero-isolation-probe", tauri::WebviewUrl::CustomProtocol("zero-probe://localhost/host.html".parse().unwrap()))
                .title("Zero isolated test — closes in 6 seconds")
                .inner_size(500.0, 240.0).build()?;
            if separate_window {
                tauri::WebviewWindowBuilder::new(app, "plugin-probe", tauri::WebviewUrl::CustomProtocol("zero-probe://localhost/plugin.html".parse().unwrap()))
                    .title("Zero synthetic plugin — closes automatically")
                    .inner_size(360.0, 180.0)
                    .on_navigation(|url| url.scheme() == "zero-probe")
                    .build()?;
            }
            let app = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                if let Some(plugin) = app.get_webview_window("plugin-probe") {
                    eprintln!("ZERO_PROBE destroy requested at {}ms", started.elapsed().as_millis());
                    let result = plugin.destroy();
                    eprintln!("ZERO_PROBE destroy dispatched: {result:?}");
                }
                std::thread::sleep(Duration::from_secs(2));
                eprintln!("ZERO_PROBE window removed: {}", app.get_webview_window("plugin-probe").is_none());
                eprintln!("ZERO_PROBE host heartbeat milliseconds: {:?}", pings.lock().unwrap());
                app.exit(0);
                std::thread::sleep(Duration::from_secs(2));
                std::process::exit(0);
            });
            Ok(())
        })
        .run(context).expect("probe runtime");
}
