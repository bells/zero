use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, WindowEvent};

use super::surface_activity::hide_surface;

#[derive(Default)]
struct Dismissal {
    generation: u64,
    dialogs: usize,
}

impl Dismissal {
    fn invalidate(&mut self) -> u64 {
        self.generation = self.generation.wrapping_add(1);
        self.generation
    }

    fn can_dismiss(&self, generation: u64, visible: bool, focused: bool) -> bool {
        self.generation == generation && self.dialogs == 0 && visible && !focused
    }
}

#[derive(Default, Clone)]
pub struct TrayPanelState(Arc<Mutex<Dismissal>>);

pub fn register(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("tray") {
        let handle = app.clone();
        window.on_window_event(move |event| match event {
            WindowEvent::Focused(true) => invalidate(&handle),
            WindowEvent::Focused(false) => schedule_dismissal(&handle),
            _ => {}
        });
    }
}

pub fn invalidate(app: &tauri::AppHandle) {
    if let Ok(mut state) = app.state::<TrayPanelState>().0.lock() {
        state.invalidate();
    }
}

fn schedule_dismissal(app: &tauri::AppHandle) {
    let state = app.state::<TrayPanelState>().inner().clone();
    let generation = match state.0.lock() {
        Ok(mut state) => state.invalidate(),
        Err(_) => return,
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Let the menu-bar mouse-up toggle resolve before blur hides its target.
        tokio::time::sleep(Duration::from_millis(150)).await;
        let main_app = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = main_app.get_webview_window("tray") {
                let visible = window.is_visible().unwrap_or(false);
                // An unreadable focus state must not dismiss an active interaction.
                let focused = window.is_focused().unwrap_or(true);
                let dismiss = state
                    .0
                    .lock()
                    .map(|mut state| {
                        let dismiss = state.can_dismiss(generation, visible, focused);
                        if dismiss {
                            state.invalidate();
                        }
                        dismiss
                    })
                    .unwrap_or(false);
                if dismiss {
                    if let Err(error) = hide_surface(&window) {
                        tracing::warn!(%error, "tray dismissal failed");
                    }
                }
            }
        });
    });
}

pub fn hide(app: &tauri::AppHandle) -> Result<(), String> {
    invalidate(app);
    if let Some(window) = app.get_webview_window("tray") {
        hide_surface(&window).map_err(|error| format!("failed to hide tray: {error}"))?;
    }
    Ok(())
}

struct DialogLease {
    state: TrayPanelState,
}

impl DialogLease {
    fn new(state: TrayPanelState) -> Self {
        if let Ok(mut dismissal) = state.0.lock() {
            dismissal.dialogs += 1;
            dismissal.invalidate();
        }
        Self { state }
    }
}

impl Drop for DialogLease {
    fn drop(&mut self) {
        if let Ok(mut dismissal) = self.state.0.lock() {
            dismissal.dialogs = dismissal.dialogs.saturating_sub(1);
        }
    }
}

pub struct DialogGuard {
    app: tauri::AppHandle,
    lease: Option<DialogLease>,
}

impl DialogGuard {
    pub fn new(app: &tauri::AppHandle, caller: &str) -> Self {
        let lease = (caller == "tray")
            .then(|| DialogLease::new(app.state::<TrayPanelState>().inner().clone()));
        Self {
            app: app.clone(),
            lease,
        }
    }
}

impl Drop for DialogGuard {
    fn drop(&mut self) {
        if let Some(lease) = self.lease.take() {
            drop(lease);
            schedule_dismissal(&self.app);
        }
    }
}

pub fn ensure_tray_caller(label: &str) -> Result<(), String> {
    if label == "tray" {
        Ok(())
    } else {
        Err("only the tray window can dismiss the quick panel".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dialog_leases_release_on_results_and_worker_unwind() {
        let state = TrayPanelState::default();
        let outer = DialogLease::new(state.clone());
        for result in [Ok(Some("chosen")), Ok(None), Err("dialog failed")] {
            let worker_state = state.clone();
            let returned = std::thread::spawn(move || {
                let _lease = DialogLease::new(worker_state);
                result
            })
            .join()
            .unwrap();
            assert_eq!(returned, result);
            assert_eq!(state.0.lock().unwrap().dialogs, 1);
        }
        let worker_state = state.clone();
        assert!(std::thread::spawn(move || {
            let _lease = DialogLease::new(worker_state);
            panic!("synthetic picker worker failure");
        })
        .join()
        .is_err());
        assert_eq!(state.0.lock().unwrap().dialogs, 1);
        drop(outer);
        let state = state.0.lock().unwrap();
        assert!(state.can_dismiss(state.generation, true, false));
    }

    #[test]
    fn stale_blur_cannot_hide_reopened_or_refocused_panel() {
        let mut state = Dismissal::default();
        let blur = state.invalidate();
        assert!(state.can_dismiss(blur, true, false));
        state.invalidate();
        assert!(!state.can_dismiss(blur, true, false));
        assert!(!state.can_dismiss(state.generation, true, true));
        assert!(!state.can_dismiss(state.generation, false, false));
    }

    #[test]
    fn modal_depth_blocks_blur_until_all_dialogs_release() {
        let mut state = Dismissal {
            dialogs: 2,
            ..Default::default()
        };
        let generation = state.invalidate();
        assert!(!state.can_dismiss(generation, true, false));
        state.dialogs -= 1;
        assert!(!state.can_dismiss(generation, true, false));
        state.dialogs -= 1;
        assert!(state.can_dismiss(generation, true, false));
    }

    #[test]
    fn only_tray_can_invoke_dismissal() {
        assert!(ensure_tray_caller("tray").is_ok());
        for label in ["main", "zero-file-engine", "plugin-notes", "capture"] {
            assert!(ensure_tray_caller(label).is_err());
        }
    }
}
