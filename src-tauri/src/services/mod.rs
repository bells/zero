#[cfg(feature = "bundled-tools")]
pub mod bing_wallpaper;
#[cfg(feature = "bundled-tools")]
pub mod caffeine;
#[cfg(feature = "bundled-tools")]
pub mod caffeine_runtime;
#[cfg(feature = "file-tool")]
pub mod file;
pub mod global_shortcuts;
pub mod native_resources;
pub mod performance;
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

pub mod main_navigation;
pub mod status_bar_highlight_model;
pub mod tray_panel;

#[cfg(target_os = "macos")]
pub mod status_bar_highlights;

#[cfg(target_os = "macos")]
pub mod status_bar_tooltips;

pub mod desktop_entries;

#[cfg(any(feature = "bundled-tools", feature = "file-tool"))]
pub mod ocr;
