use tauri_plugin_autostart::ManagerExt;

fn trusted(label: &str) -> Result<(), String> {
    if matches!(
        label,
        "main" | "tray" | "about" | "capture" | "launcher" | "paper"
    ) || label.starts_with("pin-")
    {
        Ok(())
    } else {
        Err("Autostart is restricted to host windows.".into())
    }
}

#[tauri::command]
pub fn get_autostart(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<bool, String> {
    trusted(window.label())?;
    let result = app.autolaunch().is_enabled().map_err(|e| e.to_string());
    if result.is_err() {
        crate::services::diagnostics::observe(None, "autostart", &result);
    }
    result
}

#[tauri::command]
pub fn set_autostart(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    trusted(window.label())?;
    let mut diagnostic = crate::services::diagnostics::Operation::new(None, "autostart");
    let result = if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|e| e.to_string());
    diagnostic.finish(&result);
    result
}
