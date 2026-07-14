use std::sync::{Arc, Mutex};

use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_positioner::{on_tray_event, Position, WindowExt};

pub mod commands;
pub mod plugins;
pub mod services;

const TRAY_CLICK_DEBOUNCE: std::time::Duration = std::time::Duration::from_millis(280);
const SCREENSHOT_SHORTCUT: &str = "CommandOrControl+Shift+A";
const TRAY_WINDOW_LABEL: &str = "tray";

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

pub fn toggle_tray_quick_panel(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(TRAY_WINDOW_LABEL) {
        if window
            .is_visible()
            .map_err(|error| format!("读取托盘窗口状态失败: {error}"))?
        {
            window
                .hide()
                .map_err(|error| format!("隐藏托盘窗口失败: {error}"))?;
        } else {
            window
                .as_ref()
                .window()
                .move_window(Position::TrayCenter)
                .map_err(|error| format!("移动托盘窗口失败: {error}"))?;
            window
                .show()
                .map_err(|error| format!("显示托盘窗口失败: {error}"))?;
            window
                .set_focus()
                .map_err(|error| format!("聚焦托盘窗口失败: {error}"))?;
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(services::caffeine::CaffeineState::new())
        .manage(plugins::market::PluginMarketState::default())
        .manage(plugins::registry::PluginRegistryState::default())
        .manage(services::screenshot::ScreenshotSessionStore::default())
        .manage(services::status_bar::StatusBarState::default())
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

            let _tray = TrayIconBuilder::with_id("ztool.primary")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("ZTool")
                .show_menu_on_left_click(false)
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

                        let _ = toggle_tray_quick_panel(tray.app_handle());
                    }
                })
                .build(app)?;

            let _ = services::status_bar::refresh_status_bar(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::quit_app,
            commands::app::show_about_window,
            commands::app::show_main_window,
            commands::app::show_preferences_window,
            commands::caffeine::get_caffeine_state,
            commands::caffeine::toggle_keep_awake,
            commands::plugins::refresh_plugin_market,
            commands::plugins::list_market_plugins,
            commands::plugins::list_plugins,
            commands::plugins::validate_plugin_package,
            commands::plugins::install_market_plugin,
            commands::plugins::install_plugin_package,
            commands::plugins::uninstall_plugin,
            commands::plugins::set_plugin_enabled,
            commands::plugins::restore_bundled_plugins,
            commands::status_bar::get_status_bar_settings,
            commands::status_bar::update_status_bar_settings,
            commands::status_bar::get_status_bar_items,
            commands::status_bar::run_status_bar_item_action,
            commands::screenshot::get_screenshot_capabilities,
            commands::screenshot::start_screenshot,
            commands::screenshot::init_screenshot_session,
            commands::screenshot::commit_screenshot,
            commands::screenshot::cancel_screenshot_session,
            commands::screenshot::pin_screenshot,
            commands::screenshot::init_pin_window,
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
