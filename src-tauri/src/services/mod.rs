#[cfg(any(target_os = "macos", target_os = "windows"))]
pub mod application_catalog;
#[cfg(feature = "bundled-tools")]
pub mod bing_wallpaper;
#[cfg(feature = "bundled-tools")]
pub mod caffeine;
#[cfg(feature = "bundled-tools")]
pub mod caffeine_runtime;
#[cfg(feature = "bundled-tools")]
pub mod caffeine_schedule;
#[cfg(feature = "file-tool")]
pub mod file;
pub mod global_shortcuts;
pub mod native_resources;
pub mod performance;
pub mod popover;
#[cfg(feature = "bundled-tools")]
pub mod quick_launcher;
#[cfg(feature = "bundled-tools")]
pub mod screenshot;
pub mod shortcut_transaction;
pub mod snap_shortcut_config;
pub mod status_bar;
pub mod surface_activity;
pub mod tool_windows;

pub mod diagnostics;

#[cfg(any(target_os = "macos", test))]
pub mod app_menu;
pub mod main_navigation;
pub mod status_bar_highlight_model;
pub mod tray_layout;
pub mod tray_panel;

#[cfg(target_os = "macos")]
pub mod status_bar_highlights;

#[cfg(target_os = "macos")]
pub mod status_bar_tooltips;

pub mod desktop_entries;

#[cfg(any(feature = "bundled-tools", feature = "file-tool"))]
pub mod ocr;

#[cfg(feature = "bundled-tools")]
pub mod awake_battery;

#[cfg(feature = "bundled-tools")]
pub mod awake_preferences;

#[cfg(feature = "bundled-tools")]
pub mod awake_power_events;
#[cfg(feature = "bundled-tools")]
pub mod power_events;

pub mod power_lease;

pub mod continuous_clock;

pub mod power_snapshot;

pub mod network_fetch;

pub mod image_cache;

pub mod wallpaper;

pub mod wallpaper_effects;

pub mod text_search;
