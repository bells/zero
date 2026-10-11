// The existing objc 0.2 macros expand a historical `cargo-clippy` cfg in this crate.
#![allow(unexpected_cfgs)]

mod bundled_metadata;

use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;
#[cfg(feature = "bundled-tools")]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers};
use tauri_plugin_positioner::{Position, WindowExt};

pub mod brand;
mod bundled_plugins;
pub mod commands;
pub mod migration;
pub mod plugins;
pub mod services;

pub const SCREENSHOT_SHORTCUT: &str = "CommandOrControl+Shift+A";
#[cfg(target_os = "macos")]
pub const QUICK_LAUNCHER_SHORTCUT: &str = "Alt+Space";
#[cfg(not(target_os = "macos"))]
pub const QUICK_LAUNCHER_SHORTCUT: &str = "Control+Alt+Space";
const TRAY_WINDOW_LABEL: &str = "tray";

#[cfg(feature = "bundled-tools")]
fn is_quick_launcher_shortcut(modifiers: Modifiers, key: Code) -> bool {
    #[cfg(target_os = "macos")]
    let launch_modifiers = Modifiers::ALT;
    #[cfg(not(target_os = "macos"))]
    let launch_modifiers = Modifiers::CONTROL | Modifiers::ALT;

    modifiers == launch_modifiers && key == Code::Space
}

pub(crate) fn plugin_is_enabled(app: &tauri::AppHandle, plugin_name: &str) -> bool {
    app.state::<plugins::registry::PluginRegistryState>()
        .with_registry(|registry| {
            Ok(registry
                .records()
                .iter()
                .any(|record| record.name == plugin_name && record.enabled))
        })
        .unwrap_or(false)
}

#[cfg(feature = "bundled-tools")]
fn quick_launcher_is_enabled(app: &tauri::AppHandle) -> bool {
    plugin_is_enabled(app, brand::ZERO_LAUNCH_PLUGIN_ID)
}

#[cfg(feature = "bundled-tools")]
pub fn sync_quick_launcher_shortcut(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    if enabled {
        if shortcuts.is_registered(QUICK_LAUNCHER_SHORTCUT) {
            return Ok(());
        }
        shortcuts
            .register(QUICK_LAUNCHER_SHORTCUT)
            .map_err(|error| {
                let message = format!("Could not register {QUICK_LAUNCHER_SHORTCUT}: {error}");
                app.state::<services::quick_launcher::QuickLauncherState>()
                    .add_diagnostic("launcher.shortcut_conflict", &message);
                message
            })
    } else {
        if shortcuts.is_registered(QUICK_LAUNCHER_SHORTCUT) {
            shortcuts
                .unregister(QUICK_LAUNCHER_SHORTCUT)
                .map_err(|error| format!("failed to unregister launcher shortcut: {error}"))?;
        }
        commands::quick_launcher::hide_quick_launcher_window(app.clone())
    }
}

#[cfg(feature = "bundled-tools")]
pub fn sync_screenshot_shortcut(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let mut diagnostic = crate::services::diagnostics::Operation::new(None, "shortcut");
    let result = (|| {
        let shortcuts = app.global_shortcut();
        if enabled && !shortcuts.is_registered(SCREENSHOT_SHORTCUT) {
            shortcuts
                .register(SCREENSHOT_SHORTCUT)
                .map_err(|e| e.to_string())?;
        }
        if !enabled && shortcuts.is_registered(SCREENSHOT_SHORTCUT) {
            shortcuts
                .unregister(SCREENSHOT_SHORTCUT)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })();
    diagnostic.finish(&result);
    result
}

pub fn toggle_tray_quick_panel(app: &tauri::AppHandle) -> Result<(), String> {
    use services::surface_activity::{hide_surface, show_surface};

    services::tray_panel::invalidate(app);
    if let Some(window) = app.get_webview_window(TRAY_WINDOW_LABEL) {
        if window
            .is_visible()
            .map_err(|error| format!("读取托盘窗口状态失败: {error}"))?
        {
            hide_surface(&window).map_err(|error| format!("隐藏托盘窗口失败: {error}"))?;
        } else {
            services::tool_windows::prepare_tray_window(app)?;
            window
                .as_ref()
                .window()
                .move_window(Position::TrayCenter)
                .map_err(|error| format!("移动托盘窗口失败: {error}"))?;
            show_surface(&window).map_err(|error| format!("显示托盘窗口失败: {error}"))?;
            window
                .set_focus()
                .map_err(|error| format!("聚焦托盘窗口失败: {error}"))?;
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let diagnostics = services::diagnostics::Diagnostics::new(
        brand::canonical_data_root(&brand::default_home()).join("logs"),
    );
    diagnostics.install();
    diagnostics.native(
        None,
        "bootstrap",
        services::diagnostics::contracts::Outcome::Started,
        Default::default(),
        None,
    );
    let performance_trace = services::performance::PerformanceTrace::default();
    let migration_started = performance_trace.begin();
    let migration_report = migration::migrate_default_home();
    performance_trace.finish(
        "migration",
        if migration_report.diagnostics.is_empty() {
            if migration_report.completed_fast_path {
                "fast-path"
            } else {
                "migrated"
            }
        } else {
            "error"
        },
        migration_started,
    );
    diagnostics.native(
        None,
        "migration",
        if migration_report.diagnostics.is_empty() {
            services::diagnostics::contracts::Outcome::Succeeded
        } else {
            services::diagnostics::contracts::Outcome::Failed
        },
        Default::default(),
        None,
    );

    let managed_state_started = performance_trace.begin();
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _| {
        services::desktop_entries::dispatch(app, &args, true);
    }));
    let builder = bundled_plugins::manage_states(builder);
    performance_trace.finish("managed_state_construction", "ok", managed_state_started);
    let registry_started = performance_trace.begin();
    let registry_state = plugins::registry::PluginRegistryState::default();
    let registry_outcome = if registry_state.startup_write_performed() {
        "persisted-change"
    } else {
        "unchanged"
    };
    performance_trace.finish(
        "plugin_registry_load_write",
        registry_outcome,
        registry_started,
    );
    #[cfg(feature = "file-tool")]
    let builder = plugins::engine_assets::register(builder);
    let builder = plugins::web_assets::register(builder)
        .manage(diagnostics.clone())
        .manage(registry_state)
        .manage(performance_trace.clone());

    let tauri_setup_started = performance_trace.begin();
    let app = builder
        .manage(plugins::market::PluginMarketState::default())
        .manage(services::status_bar::StatusBarState::default())
        .manage(services::tray_panel::TrayPanelState::default())
        .manage(services::main_navigation::MainNavigationState::default())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let _ = (app, shortcut);
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    #[cfg(feature = "bundled-tools")]
                    if is_quick_launcher_shortcut(shortcut.mods, shortcut.key) {
                        #[cfg(feature = "bundled-tools")]
                        if quick_launcher_is_enabled(app) {
                            let _ = commands::quick_launcher::toggle_quick_launcher_window(app);
                        }
                    } else if plugin_is_enabled(app, brand::ZERO_SNAP_PLUGIN_ID) {
                        let screenshot_app = app.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            let _ = services::screenshot::start_screenshot_session(
                                screenshot_app,
                                "copy".into(),
                            );
                        });
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            bundled_plugins::register_diagnostics(app.handle());
            services::tray_panel::register(app.handle());
            #[cfg(feature = "bundled-tools")]
            sync_screenshot_shortcut(
                app.handle(),
                plugin_is_enabled(app.handle(), brand::ZERO_SNAP_PLUGIN_ID),
            )?;
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            let status_bar_started = app
                .state::<services::performance::PerformanceTrace>()
                .begin();
            let status_bar_result = services::status_bar::refresh_status_bar(app.handle());
            app.state::<services::performance::PerformanceTrace>()
                .finish(
                    "status_bar_creation",
                    if status_bar_result.is_ok() {
                        "ok"
                    } else {
                        "error"
                    },
                    status_bar_started,
                );

            #[cfg(feature = "bundled-tools")]
            services::screenshot::start_maintenance(app.handle());
            #[cfg(feature = "bundled-tools")]
            if quick_launcher_is_enabled(app.handle()) {
                bundled_plugins::start_quick_launcher(app.handle());
                let _ = sync_quick_launcher_shortcut(app.handle(), true);
            }

            #[cfg(all(debug_assertions, feature = "file-tool"))]
            bundled_plugins::start_file_engine_smoke_if_requested(app.handle());

            let trace = app
                .state::<services::performance::PerformanceTrace>()
                .inner()
                .clone();
            if trace.emits_logs() {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    trace.mark("settled_idle", "ok");
                });
            }

            services::desktop_entries::start_sync(app.handle());
            services::desktop_entries::dispatch(
                app.handle(),
                &std::env::args().collect::<Vec<_>>(),
                false,
            );
            Ok(())
        })
        .invoke_handler(plugins::invoke_gate::gate(tauri::generate_handler![
            commands::diagnostics::get_about_info,
            commands::diagnostics::get_diagnostics_status,
            commands::diagnostics::get_diagnostics_preview,
            commands::diagnostics::copy_diagnostics_preview,
            commands::diagnostics::clear_diagnostics,
            commands::diagnostics::set_diagnostics_mode,
            commands::diagnostics::open_support_link,
            commands::diagnostics::open_diagnostics_directory,
            commands::diagnostics::emit_frontend_diagnostic,
            commands::autostart::get_autostart,
            commands::autostart::set_autostart,
            commands::app::quit_app,
            commands::app::mark_frontend_ready,
            commands::app::mark_surface_ready,
            commands::app::record_plugin_activation,
            commands::app::get_performance_trace,
            services::surface_activity::get_surface_activity,
            services::main_navigation::get_main_window_navigation,
            services::surface_activity::hide_current_surface,
            services::surface_activity::close_current_surface,
            commands::app::show_about_window,
            commands::app::show_main_window,
            commands::app::hide_tray_quick_panel,
            commands::app::show_preferences_window,
            commands::plugins::refresh_plugin_market,
            commands::plugins::list_market_plugins,
            commands::plugins::list_plugins,
            commands::plugins::get_plugin_registry_snapshot,
            commands::plugins::check_plugin_compatibility,
            plugins::web_runtime::open_plugin_view,
            plugins::web_runtime::plugin_session_ready,
            plugins::web_runtime::plugin_invoke,
            plugins::web_runtime::plugin_cancel,
            commands::plugins::validate_plugin_package,
            commands::plugins::install_market_plugin,
            commands::plugins::install_plugin_package,
            commands::plugins::uninstall_plugin,
            commands::plugins::set_plugin_enabled,
            commands::plugins::restore_bundled_plugins,
            commands::status_bar::get_status_bar_settings,
            commands::status_bar::set_status_bar_language,
            commands::status_bar::update_status_bar_settings,
            commands::status_bar::get_status_bar_items,
            commands::status_bar::run_status_bar_item_action,
            commands::shortcuts::get_global_shortcut_snapshots,
            #[cfg(feature = "bundled-tools")]
            commands::caffeine::get_caffeine_state,
            #[cfg(feature = "bundled-tools")]
            commands::caffeine::toggle_keep_awake,
            #[cfg(feature = "file-tool")]
            commands::file::get_file_conversion_capabilities,
            #[cfg(feature = "file-tool")]
            commands::file::refresh_file_conversion_capabilities,
            #[cfg(feature = "file-tool")]
            commands::file::choose_file_conversion_inputs,
            #[cfg(feature = "file-tool")]
            commands::file::inspect_file_conversion_inputs,
            #[cfg(feature = "file-tool")]
            commands::file::enqueue_file_conversions,
            #[cfg(feature = "file-tool")]
            commands::file::list_file_conversion_jobs,
            #[cfg(feature = "file-tool")]
            commands::file::start_file_conversion_queue,
            #[cfg(feature = "file-tool")]
            commands::file::cancel_file_conversion_job,
            #[cfg(feature = "file-tool")]
            commands::file::remove_file_conversion_job,
            #[cfg(feature = "file-tool")]
            commands::file::retry_file_conversion_job,
            #[cfg(feature = "file-tool")]
            commands::file::clear_completed_file_conversion_jobs,
            #[cfg(feature = "file-tool")]
            commands::file::open_file_conversion_output,
            #[cfg(feature = "file-tool")]
            commands::file::reveal_file_conversion_output,
            #[cfg(feature = "file-tool")]
            services::file::engine_bridge::file_engine_ready,
            #[cfg(feature = "file-tool")]
            services::file::engine_bridge::file_engine_read_input,
            #[cfg(feature = "file-tool")]
            services::file::engine_bridge::file_engine_write_output,
            #[cfg(feature = "file-tool")]
            services::file::engine_bridge::file_engine_progress,
            #[cfg(feature = "file-tool")]
            services::file::engine_bridge::file_engine_complete,
            #[cfg(feature = "file-tool")]
            services::file::engine_bridge::file_engine_print_rendered,
            #[cfg(feature = "bundled-tools")]
            commands::bing_wallpaper::get_bing_wallpaper_snapshot,
            #[cfg(feature = "bundled-tools")]
            commands::bing_wallpaper::refresh_bing_wallpapers,
            #[cfg(feature = "bundled-tools")]
            commands::bing_wallpaper::get_bing_wallpaper_preview,
            #[cfg(feature = "bundled-tools")]
            commands::bing_wallpaper::read_bing_wallpaper_preview,
            #[cfg(feature = "bundled-tools")]
            commands::bing_wallpaper::release_bing_wallpaper_preview,
            #[cfg(feature = "bundled-tools")]
            commands::bing_wallpaper::save_bing_wallpaper_to_downloads,
            #[cfg(feature = "bundled-tools")]
            commands::bing_wallpaper::apply_bing_wallpaper,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::get_quick_launcher_snapshot,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::refresh_quick_launcher_index,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::search_quick_launcher,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::get_quick_launcher_icon,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::get_quick_launcher_icons,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::refresh_quick_launcher_running_state,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::activate_quick_launcher_item,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::show_quick_launcher_window,
            #[cfg(feature = "bundled-tools")]
            commands::quick_launcher::hide_quick_launcher_window,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::get_screenshot_capabilities,
            #[cfg(feature = "bundled-tools")]
            commands::ocr::get_ocr_capability,
            #[cfg(feature = "file-tool")]
            commands::ocr::prepare_file_page_ocr,
            #[cfg(feature = "file-tool")]
            commands::ocr::upload_file_page_ocr,
            #[cfg(feature = "bundled-tools")]
            commands::ocr::start_snap_ocr,
            #[cfg(feature = "bundled-tools")]
            commands::ocr::get_snap_ocr,
            #[cfg(feature = "bundled-tools")]
            commands::ocr::cancel_snap_ocr,
            #[cfg(feature = "bundled-tools")]
            commands::ocr::clear_snap_ocr,
            #[cfg(feature = "bundled-tools")]
            commands::ocr::copy_snap_ocr,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::start_screenshot,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::start_snap_menu_screenshot,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::init_screenshot_session,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::read_screenshot_media,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::reveal_screenshot_capture,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::prepare_screenshot_commit,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::upload_screenshot_commit,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::cancel_screenshot_session,
            #[cfg(feature = "bundled-tools")]
            commands::screenshot::init_pin_window,
        ]))
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    performance_trace.finish("tauri_setup", "ok", tauri_setup_started);
    diagnostics.native(
        None,
        "bootstrap",
        services::diagnostics::contracts::Outcome::Succeeded,
        Default::default(),
        None,
    );
    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if matches!(
            &event,
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            }
        ) {
            let _ = commands::app::open_main_window(app.clone());
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Focused(false) | tauri::WindowEvent::Destroyed,
            ..
        } = &event
        {
            services::status_bar_highlights::sync_surface(app, label);
        }
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } = &event
        {
            app.state::<std::sync::Arc<services::diagnostics::Diagnostics>>()
                .revoke_previews(label);
        }
        #[cfg(feature = "bundled-tools")]
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed,
            ..
        } = &event
        {
            if label == "main" {
                #[cfg(feature = "bundled-tools")]
                app.state::<services::screenshot::snap_ocr::SnapOcrState>()
                    .cancel();
            }
        }
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            services::diagnostics::native(
                None,
                "shutdown",
                services::diagnostics::contracts::Outcome::Started,
            );
            #[cfg(target_os = "macos")]
            services::status_bar_tooltips::clear(app);
            #[cfg(target_os = "macos")]
            services::status_bar_highlights::shutdown(app);
            #[cfg(feature = "file-tool")]
            app.state::<services::file::FileConversionState>()
                .shutdown_cleanup();
            #[cfg(feature = "bundled-tools")]
            let _ = app
                .state::<services::caffeine::CaffeineState>()
                .set_enabled(false, None);
            #[cfg(feature = "bundled-tools")]
            app.state::<services::screenshot::snap_ocr::SnapOcrState>()
                .clear();
            #[cfg(feature = "bundled-tools")]
            app.state::<services::screenshot::ScreenshotSessionStore>()
                .cleanup_all();
            #[cfg(feature = "file-tool")]
            app.state::<services::file::engine_bridge::FileEngineBridgeState>()
                .bridge
                .reset_and_destroy(app, "Zero is shutting down.");
            app.state::<std::sync::Arc<services::diagnostics::Diagnostics>>()
                .shutdown();
        }
    });
}

#[cfg(all(test, feature = "bundled-tools"))]
mod tests {
    use super::*;

    #[test]
    fn launcher_shortcut_matches_expected_modifiers_only() {
        #[cfg(target_os = "macos")]
        let launch_modifiers = Modifiers::ALT;
        #[cfg(not(target_os = "macos"))]
        let launch_modifiers = Modifiers::CONTROL | Modifiers::ALT;

        assert!(is_quick_launcher_shortcut(launch_modifiers, Code::Space));
        assert!(!is_quick_launcher_shortcut(
            launch_modifiers | Modifiers::SHIFT,
            Code::Space
        ));
        assert!(!is_quick_launcher_shortcut(launch_modifiers, Code::KeyA));
    }
}
