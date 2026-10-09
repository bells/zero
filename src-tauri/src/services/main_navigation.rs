use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub const MAIN_NAVIGATION_EVENT: &str = "zero://main-navigation";

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MainWindowDestination {
    #[default]
    Tools,
    Preferences,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MainWindowNavigationRequest {
    pub destination: MainWindowDestination,
    pub revision: u64,
}

#[derive(Default)]
pub struct MainNavigationState(Mutex<MainWindowNavigationRequest>);

impl MainNavigationState {
    pub fn request(&self, destination: MainWindowDestination) -> Result<(), String> {
        let mut current = self.0.lock().map_err(|_| "main navigation lock poisoned")?;
        current.revision = current
            .revision
            .checked_add(1)
            .ok_or("main navigation revision exhausted")?;
        current.destination = destination;
        Ok(())
    }

    pub fn snapshot(&self) -> Result<MainWindowNavigationRequest, String> {
        self.0
            .lock()
            .map(|state| state.clone())
            .map_err(|_| "main navigation lock poisoned".into())
    }
}

pub fn publish(app: &tauri::AppHandle) -> Result<(), String> {
    let current = app.state::<MainNavigationState>().snapshot()?;
    app.get_webview_window("main")
        .ok_or("main window unavailable")?
        .emit(MAIN_NAVIGATION_EVENT, current)
        .map_err(|error| error.to_string())
}

pub fn ensure_main_caller(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("main navigation requires main caller".into())
    }
}

pub fn ensure_shell_caller(label: &str) -> Result<(), String> {
    if matches!(label, "main" | "tray" | "about") {
        Ok(())
    } else {
        Err("main navigation requires a trusted shell caller".into())
    }
}

#[tauri::command]
pub fn get_main_window_navigation(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, MainNavigationState>,
) -> Result<MainWindowNavigationRequest, String> {
    ensure_main_caller(window.label())?;
    state.snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_creation_and_late_listener_get_latest_destination() {
        let state = MainNavigationState::default();
        state.request(MainWindowDestination::Preferences).unwrap();
        state.request(MainWindowDestination::Tools).unwrap();
        state.request(MainWindowDestination::Preferences).unwrap();
        assert_eq!(
            serde_json::to_value(state.snapshot().unwrap()).unwrap(),
            serde_json::json!({"destination":"preferences","revision":3})
        );
    }

    #[test]
    fn only_main_can_read_navigation_and_unknown_destinations_are_rejected() {
        assert!(ensure_main_caller("main").is_ok());
        for label in ["tray", "preferences", "zero-file-engine", "extension-test"] {
            assert!(ensure_main_caller(label).is_err());
        }
        assert!(ensure_shell_caller("tray").is_ok());
        assert!(ensure_shell_caller("main").is_ok());
        assert!(ensure_shell_caller("zero-file-engine").is_err());
        assert!(ensure_shell_caller("extension-test").is_err());
        assert!(
            serde_json::from_value::<MainWindowDestination>(serde_json::json!("capture")).is_err()
        );
    }
}
