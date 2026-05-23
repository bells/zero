use std::sync::{Arc, Mutex};

use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_positioner::{on_tray_event, Position, WindowExt};

pub mod commands;
pub mod services;

const TRAY_CLICK_DEBOUNCE: std::time::Duration = std::time::Duration::from_millis(600);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(services::caffeine::CaffeineState::new())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            let last_show_at = Arc::new(Mutex::new(None::<std::time::Instant>));
            let last_show_at_tray = last_show_at.clone();

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(move |tray, event| {
                    let app_handle = tray.app_handle();
                    on_tray_event(&app_handle, &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let recently_shown = last_show_at_tray
                                    .lock()
                                    .ok()
                                    .and_then(|guard| *guard)
                                    .is_some_and(|shown_at| {
                                        shown_at.elapsed() < TRAY_CLICK_DEBOUNCE
                                    });

                                if recently_shown {
                                    return;
                                }

                                let _ = window.hide();
                                if let Ok(mut guard) = last_show_at_tray.lock() {
                                    *guard = None;
                                }
                            } else {
                                if let Ok(mut guard) = last_show_at_tray.lock() {
                                    *guard = Some(std::time::Instant::now());
                                }

                                let _ = window.as_ref().window().move_window(Position::TrayCenter);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::quit_app,
            commands::caffeine::get_caffeine_state,
            commands::caffeine::toggle_keep_awake,
            commands::screenshot::get_screenshot_capabilities,
            commands::screenshot::start_screenshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
