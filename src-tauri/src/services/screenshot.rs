use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenshotCapabilities {
    pub platform: String,
    pub wechat_visual: bool,
    pub custom_overlay: bool,
    pub system_launcher: bool,
    pub active_actions: Vec<String>,
    pub pending_tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScreenshotStartResult {
    pub mode: String,
    pub action: String,
    pub message: String,
}

pub fn screenshot_capabilities() -> ScreenshotCapabilities {
    ScreenshotCapabilities {
        platform: platform_name().into(),
        wechat_visual: true,
        custom_overlay: false,
        system_launcher: cfg!(any(target_os = "macos", target_os = "windows")),
        active_actions: vec!["copy".into(), "save".into(), "cancel".into()],
        pending_tools: vec![
            "rectangle".into(),
            "ellipse".into(),
            "arrow".into(),
            "pen".into(),
            "mosaic".into(),
            "text".into(),
            "pin".into(),
        ],
    }
}

pub fn start_screenshot_session(
    app: tauri::AppHandle,
    action: String,
) -> Result<ScreenshotStartResult, String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    let normalized_action = match action.as_str() {
        "copy" | "save" => action,
        _ => "copy".into(),
    };

    launch_system_screenshot(&normalized_action)?;

    Ok(ScreenshotStartResult {
        mode: if cfg!(target_os = "macos") {
            "phase-one-system-capture".into()
        } else {
            "system-launcher".into()
        },
        action: normalized_action.clone(),
        message: match normalized_action.as_str() {
            "save" => "截图工具已打开，完成后会保存图片".into(),
            _ => "截图工具已打开，完成后会复制到剪贴板".into(),
        },
    })
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "linux") {
        "Linux"
    } else {
        "Unknown"
    }
}

#[cfg(target_os = "macos")]
fn launch_system_screenshot(action: &str) -> Result<(), String> {
    let args = if action == "save" {
        vec!["-i"]
    } else {
        vec!["-i", "-c"]
    };

    std::process::Command::new("screencapture")
        .args(args)
        .spawn()
        .map_err(|e| format!("打开截图工具失败: {e}"))?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn launch_system_screenshot(_action: &str) -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg("ms-screenclip:")
        .spawn()
        .or_else(|_| std::process::Command::new("SnippingTool.exe").spawn())
        .map_err(|e| format!("打开截图工具失败: {e}"))?;

    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn launch_system_screenshot(_action: &str) -> Result<(), String> {
    Err("当前平台暂不支持截图工具".into())
}
