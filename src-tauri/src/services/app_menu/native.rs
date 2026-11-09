use super::*;
use crate::plugins::registry::PluginRegistryState;
use crate::services::diagnostics::{contracts::Outcome, Operation};
use std::sync::Mutex;
use tauri::menu::{
    Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, PartialEq, Eq)]
struct MenuSignature {
    language: MenuLanguage,
    tools: Vec<MenuTool>,
}

#[derive(Default)]
pub struct AppMenuState(Mutex<Option<MenuSignature>>);

pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    app.on_menu_event(|app, event| {
        if !event.id().as_ref().starts_with("zero.app-menu.") {
            return;
        }
        let mut diagnostic = Operation::new(None, "window");
        let result = handle_action(app, event.id().as_ref());
        diagnostic.finish(&result);
    });
    refresh_now(app)
}

pub fn refresh(app: &tauri::AppHandle) -> Result<(), String> {
    let owner = app.clone();
    app.run_on_main_thread(move || {
        let result = refresh_now(&owner);
        crate::services::diagnostics::native(
            None,
            "window",
            if result.is_ok() {
                Outcome::Succeeded
            } else {
                Outcome::Failed
            },
        );
    })
    .map_err(|error| error.to_string())
}

fn refresh_now(app: &tauri::AppHandle) -> Result<(), String> {
    let language =
        MenuLanguage::from(crate::services::status_bar::status_bar_language(app).as_str());
    let tools = app
        .state::<PluginRegistryState>()
        .with_registry(|registry| Ok(menu_tools(registry.records())))?;
    let signature = MenuSignature { language, tools };
    let state = app.state::<AppMenuState>();
    if state
        .0
        .lock()
        .map_err(|_| "app menu state lock poisoned")?
        .as_ref()
        == Some(&signature)
    {
        return Ok(());
    }
    let menu = build_menu(app, &signature).map_err(|error| error.to_string())?;
    app.set_menu(menu).map_err(|error| error.to_string())?;
    super::editing::attach(app)?;
    *state.0.lock().map_err(|_| "app menu state lock poisoned")? = Some(signature);
    Ok(())
}

fn build_menu(
    app: &tauri::AppHandle,
    signature: &MenuSignature,
) -> tauri::Result<Menu<tauri::Wry>> {
    let language = signature.language;
    let [brand, tools_title, edit_title, window_title, help_title] = language.groups();
    let item = |id: &str, chinese, english, accelerator| {
        MenuItem::with_id(
            app,
            format!("zero.app-menu.{id}"),
            language.text(chinese, english),
            true,
            accelerator,
        )
    };
    let app_menu = Submenu::with_items(
        app,
        brand,
        true,
        &[
            &item("about", "关于 Zero", "About Zero", None::<&str>)?,
            &item("preferences", "设置…", "Settings…", Some("Cmd+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some(language.text("服务", "Services")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(language.text("隐藏 Zero", "Hide Zero")))?,
            &PredefinedMenuItem::hide_others(app, Some(language.text("隐藏其他", "Hide Others")))?,
            &PredefinedMenuItem::show_all(app, Some(language.text("全部显示", "Show All")))?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "退出 Zero", "Quit Zero", Some("Cmd+Q"))?,
        ],
    )?;
    let tools_menu = Submenu::new(app, tools_title, true)?;
    for tool in &signature.tools {
        tools_menu.append(&MenuItem::with_id(
            app,
            format!("{TOOL_MENU_PREFIX}{}", tool.plugin_id),
            tool.title.replace('&', "&&"),
            true,
            None::<&str>,
        )?)?;
    }
    if signature.tools.is_empty() {
        tools_menu.append(&MenuItem::with_id(
            app,
            "zero.app-menu.empty",
            language.text("无可用工具", "No Available Tools"),
            false,
            None::<&str>,
        )?)?;
    }
    let edit_menu = Submenu::with_items(
        app,
        edit_title,
        true,
        &[
            &item("undo", "撤销", "Undo", Some("Cmd+Z"))?,
            &item("redo", "重做", "Redo", Some("Cmd+Shift+Z"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(language.text("剪切", "Cut")))?,
            &PredefinedMenuItem::copy(app, Some(language.text("复制", "Copy")))?,
            &PredefinedMenuItem::paste(app, Some(language.text("粘贴", "Paste")))?,
            &PredefinedMenuItem::select_all(app, Some(language.text("全选", "Select All")))?,
        ],
    )?;
    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        window_title,
        true,
        &[
            &item("main", "显示主窗口", "Show Main Window", None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::minimize(app, Some(language.text("最小化", "Minimize")))?,
            &PredefinedMenuItem::maximize(app, Some(language.text("缩放", "Zoom")))?,
            &PredefinedMenuItem::fullscreen(
                app,
                Some(language.text("进入全屏幕", "Enter Full Screen")),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(
                app,
                Some(language.text("关闭窗口", "Close Window")),
            )?,
        ],
    )?;
    let help_menu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        help_title,
        true,
        &[
            &item("website", "Zero 官网", "Zero Website", None::<&str>)?,
            &item("repository", "项目仓库", "Project Repository", None::<&str>)?,
        ],
    )?;
    let menu = Menu::with_items(
        app,
        &[&app_menu, &tools_menu, &edit_menu, &window_menu, &help_menu],
    )?;
    Ok(menu)
}

fn handle_action(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    match id {
        "zero.app-menu.about" => crate::commands::app::show_about_window(app.clone()),
        "zero.app-menu.preferences" => crate::commands::app::open_preferences_window(app),
        "zero.app-menu.main" => crate::commands::app::open_main_window(app.clone()),
        "zero.app-menu.quit" => {
            crate::commands::app::quit_app(app.clone());
            Ok(())
        }
        "zero.app-menu.website" => app
            .opener()
            .open_url(crate::brand::WEBSITE_URL, None::<&str>)
            .map_err(|error| error.to_string()),
        "zero.app-menu.repository" => app
            .opener()
            .open_url(crate::brand::GITHUB_URL, None::<&str>)
            .map_err(|error| error.to_string()),
        "zero.app-menu.undo" => edit_focused_window(app, NativeMenuEditAction::Undo),
        "zero.app-menu.redo" => edit_focused_window(app, NativeMenuEditAction::Redo),
        _ => {
            let tool = app
                .state::<PluginRegistryState>()
                .with_registry(|registry| {
                    Ok(available_tool(registry.records(), id).map(str::to_owned))
                })?;
            if let Some(tool) = tool {
                crate::commands::app::open_main_tool(app, &tool)?;
            }
            Ok(())
        }
    }
}

pub(super) fn edit_focused_window(
    app: &tauri::AppHandle,
    action: NativeMenuEditAction,
) -> Result<(), String> {
    let mtm = objc2_foundation::MainThreadMarker::new().ok_or("editing requires main thread")?;
    let application = objc2_app_kit::NSApplication::sharedApplication(mtm);
    let native_dialog = application.modalWindow().is_some()
        || application
            .keyWindow()
            .is_some_and(|window| window.sheetParent().is_some());
    if !native_dialog {
        for (label, window) in app.webview_windows() {
            if (matches!(
                label.as_str(),
                "main" | "about" | "tray" | "capture" | "launcher" | "paper"
            ) || label.starts_with("pin-"))
                && window.is_focused().map_err(|error| error.to_string())?
            {
                window
                    .emit(EDIT_EVENT, NativeMenuEditPayload { action })
                    .map_err(|error| error.to_string())?;
                return Ok(());
            }
        }
    }
    // Native file panels own their responder chain outside Zero's WebViews.
    let selector = match action {
        NativeMenuEditAction::Undo => objc2::sel!(undo:),
        NativeMenuEditAction::Redo => objc2::sel!(redo:),
    };
    // These standard AppKit editing selectors are resolved by the active responder.
    unsafe {
        application.sendAction_to_from(selector, None, None);
    }
    Ok(())
}
