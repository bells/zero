use std::sync::{Arc, Mutex};

use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_positioner::{on_tray_event, Position, WindowExt};

pub mod commands;
pub mod services;

const TRAY_CLICK_DEBOUNCE: std::time::Duration = std::time::Duration::from_millis(280);
const SCREENSHOT_SHORTCUT: &str = "CommandOrControl+Shift+A";

fn should_accept_tray_toggle(
    last_toggle_at: &mut Option<std::time::Instant>,
    now: std::time::Instant,
) -> bool {
    if last_toggle_at.is_some_and(|previous| now.duration_since(previous) < TRAY_CLICK_DEBOUNCE) {
        return false;
    }

    *last_toggle_at = Some(now);
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(services::caffeine::CaffeineState::new())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([SCREENSHOT_SHORTCUT])
                .expect("invalid screenshot shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = services::screenshot::start_screenshot_session(
                            app.clone(),
                            "copy".into(),
                        );
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            let last_tray_toggle_at = Arc::new(Mutex::new(None::<std::time::Instant>));
            let last_tray_toggle_at_tray = last_tray_toggle_at.clone();

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
                        let now = std::time::Instant::now();
                        if let Ok(mut last_toggle) = last_tray_toggle_at_tray.lock() {
                            if !should_accept_tray_toggle(&mut last_toggle, now) {
                                return;
                            }
                        }

                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_toggle_debounce_rejects_repeated_click_events() {
        let start = std::time::Instant::now();
        let mut last_toggle_at = None;

        assert!(should_accept_tray_toggle(&mut last_toggle_at, start));
        assert!(!should_accept_tray_toggle(
            &mut last_toggle_at,
            start + TRAY_CLICK_DEBOUNCE / 2
        ));
        assert!(should_accept_tray_toggle(
            &mut last_toggle_at,
            start + TRAY_CLICK_DEBOUNCE + std::time::Duration::from_millis(1)
        ));
    }
}
