pub mod app;
#[cfg(feature = "bundled-tools")]
pub mod bing_wallpaper;
#[cfg(feature = "bundled-tools")]
pub mod caffeine;
#[cfg(feature = "file-tool")]
pub mod file;
pub mod plugins;
#[cfg(feature = "bundled-tools")]
pub mod quick_launcher;
#[cfg(feature = "bundled-tools")]
pub mod screenshot;
pub mod shortcuts;
pub mod status_bar;

pub mod diagnostics;

pub mod autostart;

#[cfg(any(feature = "bundled-tools", feature = "file-tool"))]
pub mod ocr;
