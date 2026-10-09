use crate::services::diagnostics::{contracts::*, events, CatalogEntry, Diagnostics};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

pub fn require_about(label: &str) -> Result<(), DiagnosticsError> {
    if label == "about" {
        Ok(())
    } else {
        Err(DiagnosticsError::new("callerDenied"))
    }
}
#[tauri::command]
pub fn get_about_info(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<AboutInfo, DiagnosticsError> {
    require_about(window.label())?;
    Ok(AboutInfo {
        app_name: "Zero".into(),
        app_version: app.package_info().version.to_string(),
        github_url: "https://github.com/bells/zero".into(),
        website_url: "https://www.usezero.cn/".into(),
        issues_url: "https://github.com/bells/zero/issues/new/choose".into(),
    })
}
#[tauri::command]
pub fn get_diagnostics_status(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<Diagnostics>>,
) -> Result<DiagnosticsStatus, DiagnosticsError> {
    require_about(window.label())?;
    Ok(state.status())
}
#[tauri::command]
pub async fn get_diagnostics_preview(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<DiagnosticsPreview, DiagnosticsError> {
    require_about(window.label())?;
    let registry = app.state::<crate::plugins::registry::PluginRegistryState>();
    let catalog = registry
        .try_read_registry(|r| {
            r.records()
                .iter()
                .take(128)
                .map(|p| CatalogEntry {
                    id: p.name.clone(),
                    version: p.version.clone(),
                    enabled: p.enabled,
                    state: format!("{:?}", p.health),
                })
                .collect::<Vec<_>>()
        })
        .map_err(|_| DiagnosticsError::new("unavailable"))?;
    if catalog.iter().any(|p| {
        !events::identifier(&p.id, 128)
            || p.version.len() > 64
            || semver::Version::parse(&p.version).is_err()
    }) {
        return Err(DiagnosticsError::new("unavailable"));
    }
    app.state::<Arc<Diagnostics>>()
        .inner()
        .clone()
        .preview(
            window.label(),
            &app.package_info().version.to_string(),
            catalog,
        )
        .await
}
#[tauri::command]
pub fn copy_diagnostics_preview(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    input: PreviewCopyInput,
) -> Result<(), DiagnosticsError> {
    require_about(window.label())?;
    let text = app
        .state::<Arc<Diagnostics>>()
        .copy_text(window.label(), &input.preview_id)?;
    app.clipboard()
        .write_text(text)
        .map_err(|_| DiagnosticsError::new("clipboardFailed"))
}
#[tauri::command]
pub async fn clear_diagnostics(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), DiagnosticsError> {
    require_about(window.label())?;
    let state = app.state::<Arc<Diagnostics>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.clear())
        .await
        .map_err(|_| DiagnosticsError::new("unavailable"))?
}
#[tauri::command]
pub fn set_diagnostics_mode(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<Diagnostics>>,
    input: ModeInput,
) -> Result<DiagnosticsStatus, DiagnosticsError> {
    require_about(window.label())?;
    state.set_mode(input.mode)
}
#[tauri::command]
pub fn open_support_link(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    input: SupportLinkInput,
) -> Result<(), DiagnosticsError> {
    let info = get_about_info(window, app.clone())?;
    let url = match input.target {
        SupportTarget::Github => info.github_url,
        SupportTarget::Website => info.website_url,
        SupportTarget::Issues => info.issues_url,
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| DiagnosticsError::new("openerFailed"))
}
#[tauri::command]
pub async fn open_diagnostics_directory(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), DiagnosticsError> {
    require_about(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = app.state::<Arc<Diagnostics>>().directory()?;
        app.opener()
            .open_path(root.to_string_lossy(), None::<&str>)
            .map_err(|_| DiagnosticsError::new("openerFailed"))
    })
    .await
    .map_err(|_| DiagnosticsError::new("unavailable"))?
}
#[tauri::command]
pub fn emit_frontend_diagnostic(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<Diagnostics>>,
    input: FrontendInput,
) -> Result<(), DiagnosticsError> {
    if !events::frontend_allowed(window.label(), &input) {
        return Err(DiagnosticsError::new("callerDenied"));
    }
    state.emit(
        Source::Frontend,
        input.plugin_id.as_deref(),
        input.event,
        SafeMetadata::default(),
        None,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn support_commands_are_about_only() {
        assert!(require_about("about").is_ok());
        for label in [
            "main",
            "tray",
            "preferences",
            "zero-file-engine",
            "plugin-123",
            "capture",
        ] {
            assert!(require_about(label).is_err());
        }
    }
}
