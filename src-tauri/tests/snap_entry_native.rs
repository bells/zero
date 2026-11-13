// ZERO_NATIVE_SNAP_ENTRY_TEST=1 cargo test --test snap_entry_native --locked
#[cfg(target_os = "macos")]
use zero_lib::services;
#[cfg(target_os = "macos")]
#[path = "../src/services/screenshot/entry.rs"]
mod entry;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn main() {
    use entry::{prepare_shell_windows, restore_shell_window, ScreenshotEntry};
    use services::{performance::PerformanceTrace, surface_activity::show_surface, tray_panel};
    use std::time::{Duration, Instant};
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if std::env::var("ZERO_NATIVE_SNAP_ENTRY_TEST").as_deref() != Ok("1") {
        println!("Skipped native Snap entry test; set ZERO_NATIVE_SNAP_ENTRY_TEST=1 to run.");
        return;
    }

    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let mut app = tauri::Builder::default()
        .manage(tray_panel::TrayPanelState::default())
        .manage(PerformanceTrace::default())
        .build(context)
        .unwrap();
    app.run_iteration(|_, _| {});
    let create_window = |label: &str| {
        WebviewWindowBuilder::new(
            &app,
            label,
            WebviewUrl::External("about:blank".parse().unwrap()),
        )
        .title("Zero Snap entry regression")
        .inner_size(320.0, 240.0)
        .visible(false)
        .focused(false)
        .build()
        .unwrap()
    };
    let main = create_window("main");
    let tray = create_window("tray");
    let capture = create_window("capture");
    tray_panel::register(app.handle());

    fn pump(app: &mut tauri::App) {
        let deadline = Instant::now() + Duration::from_millis(300);
        while Instant::now() < deadline {
            app.run_iteration(|_, _| {});
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    show_surface(&main).unwrap();
    show_surface(&tray).unwrap();
    tray.set_focus().unwrap();
    pump(&mut app);
    let prepared = prepare_shell_windows(app.handle(), ScreenshotEntry::Shortcut);
    assert!(
        main.is_visible().unwrap(),
        "shortcut must preserve main window"
    );
    assert!(
        tray.is_visible().unwrap(),
        "shortcut must preserve tray window"
    );
    assert!(prepared.tray_dismissal_guard.is_some());
    assert_eq!(prepared.restore_window_label.as_deref(), Some("tray"));

    show_surface(&capture).unwrap();
    capture.set_focus().unwrap();
    pump(&mut app);
    assert!(
        capture.is_focused().unwrap(),
        "overlay must take focus for this test"
    );
    assert!(main.is_visible().unwrap());
    assert!(
        tray.is_visible().unwrap(),
        "overlay blur must not dismiss the tray"
    );

    capture.hide().unwrap();
    restore_shell_window(app.handle(), prepared.restore_window_label.as_deref());
    drop(prepared);
    pump(&mut app);
    assert!(tray.is_focused().unwrap());
    assert!(main.is_visible().unwrap());
    assert!(tray.is_visible().unwrap());

    // A subsequent normal blur must dismiss again after the capture lease ends.
    main.set_focus().unwrap();
    pump(&mut app);
    assert!(
        !tray.is_visible().unwrap(),
        "capture must release its blur protection"
    );

    let position = main.outer_position().unwrap();
    let size = main.outer_size().unwrap();
    let prepared = prepare_shell_windows(app.handle(), ScreenshotEntry::Shortcut);
    assert_eq!(prepared.restore_window_label.as_deref(), Some("main"));
    assert!(prepared.tray_dismissal_guard.is_none());
    show_surface(&capture).unwrap();
    capture.set_focus().unwrap();
    pump(&mut app);
    assert!(main.is_visible().unwrap());
    assert!(
        !tray.is_visible().unwrap(),
        "a hidden tray must stay hidden"
    );
    assert_eq!(main.outer_position().unwrap(), position);
    assert_eq!(main.outer_size().unwrap(), size);
    capture.hide().unwrap();
    restore_shell_window(app.handle(), prepared.restore_window_label.as_deref());
    drop(prepared);
    pump(&mut app);
    assert!(main.is_focused().unwrap());

    show_surface(&tray).unwrap();
    tray.set_focus().unwrap();
    pump(&mut app);
    let prepared = prepare_shell_windows(app.handle(), ScreenshotEntry::Interface);
    assert!(
        !main.is_visible().unwrap(),
        "interface capture still dismisses main"
    );
    assert!(
        !tray.is_visible().unwrap(),
        "interface capture still dismisses tray"
    );
    assert!(prepared.tray_dismissal_guard.is_none());
    drop(prepared);
    for window in [capture, tray, main] {
        window.destroy().unwrap();
    }
    println!("Native Snap entry preparation, focus restoration and blur protection passed.");
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Skipped macOS-only Snap entry test.");
}
