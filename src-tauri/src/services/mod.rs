pub mod bing_wallpaper;
pub mod caffeine;
pub mod caffeine_runtime;
pub mod file;
pub mod global_shortcuts;
pub mod native_resources;
pub mod performance;
pub mod quick_launcher;
pub mod screenshot;
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

pub mod ocr;
