// Run on the process main thread with a macOS desktop session:
// ZERO_NATIVE_STATUS_BAR_TEST=1 cargo test --test status_bar_native --locked
#[cfg(target_os = "macos")]
// A bounded set of iterations flushes AppKit layout between size transitions.
#[allow(deprecated)]
fn main() {
    use objc2_foundation::{MainThreadMarker, NSPoint};
    use zero_lib::{
        brand::PRIMARY_STATUS_ITEM_ID,
        plugins::registry::{PluginRegistry, PluginRegistryState},
        services::{
            caffeine::CaffeineState,
            performance::PerformanceTrace,
            status_bar::{
                toggle_status_bar_plugin_items, update_status_bar_settings, StatusBarState,
                UpdateStatusBarSettingsInput,
            },
        },
    };

    if std::env::var("ZERO_NATIVE_STATUS_BAR_TEST").as_deref() != Ok("1") {
        println!("Skipped native status-bar test; set ZERO_NATIVE_STATUS_BAR_TEST=1 to run.");
        return;
    }

    let root = std::env::temp_dir().join(format!("zero-status-bar-native-{}", std::process::id()));
    let registry = PluginRegistry::load_or_seed(root.join("plugins")).unwrap();
    let state = StatusBarState::default();
    state
        .configure_path(root.join("status-bar.json"), registry.records())
        .unwrap();
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let mut app = tauri::Builder::default()
        .manage(PluginRegistryState::from_registry(registry))
        .manage(state)
        .manage(CaffeineState::default())
        .manage(PerformanceTrace::default())
        .build(context)
        .unwrap();
    app.run_iteration(|_, _| {});
    update_status_bar_settings(
        app.handle(),
        UpdateStatusBarSettingsInput {
            enabled: Some(true),
            show_plugin_items_on_launch: Some(true),
            plugin_items_collapsed: Some(true),
            visible_plugin_items: None,
        },
    )
    .unwrap();

    for step in 0..7 {
        if step > 0 {
            toggle_status_bar_plugin_items(app.handle()).unwrap();
        }
        app.run_iteration(|_, _| {});
        let tray = app.tray_by_id(PRIMARY_STATUS_ITEM_ID).unwrap();
        tray.with_inner_tray_icon(move |inner| {
            let mtm = MainThreadMarker::new().unwrap();
            let button = inner.ns_status_item().unwrap().button(mtm).unwrap();
            let bounds = button.bounds();
            let frame = button.frame();
            println!("step {step}: button bounds {bounds:?}");
            for child in button.subviews() {
                println!("  {}: {:?}", child.class().name().to_string_lossy(), child.frame());
            }
            let cells = (bounds.size.width / 22.0).round() as usize;
            // The bundled profile has four visible tool cells plus the primary cell.
            assert_eq!(cells, if step % 2 == 0 { 1 } else { 5 });
            for cell in 0..cells {
                for offset in [1.0, 11.0, 21.0] {
                    let point = NSPoint::new(
                        frame.origin.x + cell as f64 * 22.0 + offset,
                        frame.origin.y + bounds.size.height / 2.0,
                    );
                    let hit = button.hitTest(point).expect("status cell must receive clicks");
                    assert_eq!(
                        hit.class().name().to_bytes(),
                        b"TaoTrayTarget",
                        "step {step}, cell {cell}, offset {offset}: click bypasses tray event receiver"
                    );
                }
            }
        })
        .unwrap();
    }
    app.remove_tray_by_id(PRIMARY_STATUS_ITEM_ID);
    std::fs::remove_dir_all(root).unwrap();
    println!("Native status-bar hit regions passed through three expand/collapse cycles.");
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Skipped macOS-only native status-bar test.");
}
