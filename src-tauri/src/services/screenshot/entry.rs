use std::sync::Arc;
use tauri::Manager;

use crate::services::{
    surface_activity::{hide_surface, show_surface},
    tray_panel::DialogGuard,
};

#[derive(Debug)]
pub(super) struct PreparedShellWindows {
    pub restore_window_label: Option<String>,
    pub tray_dismissal_guard: Option<Arc<DialogGuard>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ScreenshotEntry {
    Interface,
    Shortcut,
}

impl ScreenshotEntry {
    pub fn hides_shell_windows(self) -> bool {
        self == Self::Interface
    }
}

pub(super) fn prepare_shell_windows(
    app: &tauri::AppHandle,
    entry: ScreenshotEntry,
) -> PreparedShellWindows {
    let tray_dismissal_guard = (!entry.hides_shell_windows()
        && app
            .get_webview_window("tray")
            .is_some_and(|window| window.is_visible().unwrap_or(false)))
    .then(|| Arc::new(DialogGuard::new(app, "tray")));
    let mut restore_window_label = None;
    let mut focused_window_label = None;
    for label in ["tray", "main", "launcher", "paper"] {
        if let Some(window) = app.get_webview_window(label) {
            if window.is_visible().unwrap_or(false) {
                if restore_window_label.is_none() {
                    restore_window_label = Some(label.to_string());
                }
                if !entry.hides_shell_windows() && window.is_focused().unwrap_or(false) {
                    focused_window_label = Some(label.to_string());
                }
                if entry.hides_shell_windows() {
                    let _ = hide_surface(&window);
                }
            }
        }
    }
    PreparedShellWindows {
        restore_window_label: focused_window_label.or(restore_window_label),
        tray_dismissal_guard,
    }
}

pub(super) fn restore_shell_window(app: &tauri::AppHandle, label: Option<&str>) {
    if let Some(label) = label {
        if let Some(window) = app.get_webview_window(label) {
            let _ = show_surface(&window);
            let _ = window.set_focus();
        }
    }
}
