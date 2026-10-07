use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, WebviewWindow};

use super::protocol::{
    PluginError, PluginInvokeInput, PluginMethod, PluginResponse, PluginSessionInfo, SessionBinding,
};
use super::registry::PluginRegistryState;
use super::session::{error, SessionOwner};
use super::web_assets::WebSessions;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenPluginViewInput {
    pub plugin_id: String,
    pub view_id: String,
}

fn live_owner(
    app: &tauri::AppHandle,
    plugin: &str,
    view: &str,
) -> Result<SessionOwner, PluginError> {
    app.state::<PluginRegistryState>()
        .with_registry(|registry| {
            let record = registry
                .records()
                .iter()
                .find(|r| r.name == plugin)
                .ok_or("Plugin is not installed")?;
            let manifest = record
                .protocol_manifest
                .as_ref()
                .ok_or("Not a public Web plugin")?;
            if !record.enabled
                || !super::compatibility::check_record(record).compatible
                || manifest.id != record.name
                || manifest.version != record.version
                || !manifest.contributes.views.iter().any(|v| v.id == view)
                || !manifest
                    .activation_events
                    .iter()
                    .any(|e| e == &format!("onView:{view}"))
            {
                return Err("Plugin view is not available".into());
            }
            let root = PathBuf::from(
                record
                    .installed_path
                    .as_ref()
                    .ok_or("Missing installed root")?,
            );
            let digest = record
                .package_sha256
                .clone()
                .ok_or("Missing package digest")?;
            Ok(SessionOwner {
                plugin_id: plugin.into(),
                version: record.version.clone(),
                digest,
                root,
                view_id: view.into(),
                revision: registry.revision(),
                permissions: record
                    .approved_permissions
                    .iter()
                    .filter_map(|p| serde_json::to_value(p).ok()?.as_str().map(str::to_owned))
                    .collect(),
            })
        })
        .map_err(|message| PluginError {
            code: "plugin.unavailable".into(),
            message,
            retryable: false,
        })
}

#[tauri::command]
pub async fn open_plugin_view(
    input: OpenPluginViewInput,
    app: tauri::AppHandle,
) -> Result<PluginSessionInfo, PluginError> {
    tauri::async_runtime::spawn_blocking(move || {
        let plugin_id = input.plugin_id.clone();
        app.state::<super::lifecycle::LifecycleCoordinator>()
            .run(&plugin_id, || {
                open_view(input, app.clone()).map_err(|e| e.message)
            })
            .map_err(|message| PluginError {
                code: "activation.failed".into(),
                message,
                retryable: false,
            })
    })
    .await
    .map_err(|_| error("activation.failed"))?
}

fn open_view(
    input: OpenPluginViewInput,
    app: tauri::AppHandle,
) -> Result<PluginSessionInfo, PluginError> {
    let owner = live_owner(&app, &input.plugin_id, &input.view_id)?;
    let state = app.state::<WebSessions>();
    if let Some((label, info)) = state
        .0
        .lock()
        .map_err(|_| error("session.lock"))?
        .find_view(&input.plugin_id, &input.view_id)
    {
        if let Some(window) = app.get_webview_window(&label) {
            crate::services::surface_activity::show_surface(&window)
                .map_err(|_| error("window.show"))?;
            window.set_focus().map_err(|_| error("window.focus"))?;
            return Ok(info);
        }
    }
    let manifest = app
        .state::<PluginRegistryState>()
        .with_registry(|registry| {
            registry
                .records()
                .iter()
                .find(|r| r.name == input.plugin_id)
                .and_then(|r| r.protocol_manifest.clone())
                .ok_or("Plugin missing".into())
        })
        .map_err(|_| error("plugin.unavailable"))?;
    let info = state
        .0
        .lock()
        .map_err(|_| error("session.lock"))?
        .issue(owner, Instant::now())?;
    let label = format!("plugin-{}", info.session_id);
    let url = format!("zero-plugin://{}/{}", info.session_id, manifest.main);
    let navigation_url = url.clone();
    let script = include_str!("web_bootstrap.js").replace(
        "__ZERO_SESSION_BINDING__",
        &serde_json::to_string(&info).map_err(|_| error("session.serialize"))?,
    );
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::CustomProtocol(url.parse().map_err(|_| error("asset.url"))?),
    )
    .title(&manifest.display_name)
    .inner_size(720.0, 540.0)
    .initialization_script(script)
    .on_navigation(move |url| url.as_str() == navigation_url)
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
    .build();
    let window = match window {
        Ok(window) => window,
        Err(_) => {
            state
                .0
                .lock()
                .map_err(|_| error("session.lock"))?
                .close_window(&label);
            return Err(error("window.create"));
        }
    };
    let closed_app = app.clone();
    let closed_label = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Ok(mut sessions) = closed_app.state::<WebSessions>().0.lock() {
                sessions.close_window(&closed_label);
            }
        }
    });
    let timeout_app = app.clone();
    let timeout_info = info.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let state = timeout_app.state::<WebSessions>();
        let expired = state
            .0
            .lock()
            .map(|mut sessions| sessions.expire_unready(&timeout_info.session_id))
            .unwrap_or(true);
        if expired {
            if let Some(window) = timeout_app.get_webview_window(&label) {
                let _ = crate::services::surface_activity::destroy_surface(&window);
            }
        }
    });
    Ok(info)
}

#[tauri::command]
pub fn plugin_session_ready(
    input: SessionBinding,
    window: WebviewWindow,
    state: tauri::State<'_, WebSessions>,
) -> Result<PluginSessionInfo, PluginError> {
    state.0.lock().map_err(|_| error("session.lock"))?.ready(
        &input.session_id,
        window.label(),
        input.generation,
        Instant::now(),
    )
}

#[tauri::command]
pub fn plugin_cancel(
    input: PluginInvokeInput,
    window: WebviewWindow,
    state: tauri::State<'_, WebSessions>,
) -> Result<(), PluginError> {
    state.0.lock().map_err(|_| error("session.lock"))?.finish(
        window.label(),
        &input.request,
        Instant::now(),
    )
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginMessage {
    plugin_id: String,
    message: String,
}

#[tauri::command]
pub async fn plugin_invoke(
    input: PluginInvokeInput,
    window: WebviewWindow,
    app: tauri::AppHandle,
) -> Result<PluginResponse, PluginError> {
    let caller = window.label().to_owned();
    let request = input.request;
    let state = app.state::<WebSessions>();
    let info = state
        .0
        .lock()
        .map_err(|_| error("session.lock"))?
        .get(&request.session_id, &caller, request.generation)?
        .info
        .clone();
    let live = live_owner(&app, &info.plugin_id, &info.surface_id)?;
    let method = state.0.lock().map_err(|_| error("session.lock"))?.begin(
        &caller,
        &request,
        &live,
        true,
        Instant::now(),
    )?;
    let request_id = request.request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<WebSessions>();
        let result = match method {
            PluginMethod::StorageGet(input) => {
                storage(&app, &info.plugin_id, &input.key, None, &caller, &request)
            }
            PluginMethod::StorageSet(input) => storage(
                &app,
                &info.plugin_id,
                &input.key,
                Some(input.value),
                &caller,
                &request,
            ),
            PluginMethod::NetworkFetch(_) => Err(error("api.unavailable")),
            PluginMethod::ShowMessage(input) => (|| {
                if input.message.is_empty() || input.message.chars().count() > 2048 {
                    return Err(error("request.invalid"));
                }
                let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
                sessions.commit(&caller, &request, Instant::now(), || {
                    let payload = PluginMessage {
                        plugin_id: info.plugin_id,
                        message: input.message,
                    };
                    let mut delivered = false;
                    for label in ["main", "tray"] {
                        if let Some(window) = app.get_webview_window(label) {
                            window
                                .emit("plugin-ui-message", &payload)
                                .map_err(|_| error("api.unavailable"))?;
                            delivered = true;
                        }
                    }
                    if delivered {
                        Ok(Value::Null)
                    } else {
                        Err(error("api.unavailable"))
                    }
                })
            })(),
        };
        if let Ok(mut sessions) = state.0.lock() {
            let _ = sessions.finish(&caller, &request, Instant::now());
        }
        result
    })
    .await
    .map_err(|_| error("provider.failed"))?;
    let result = result.and_then(|value| {
        if serde_json::to_vec(&value)
            .map_err(|_| error("response.invalid"))?
            .len()
            > 1024 * 1024 - 256
        {
            return Err(error("response.tooLarge"));
        }
        Ok(value)
    });
    Ok(match result {
        Ok(value) => PluginResponse::Success { request_id, value },
        Err(error) => PluginResponse::Failure { request_id, error },
    })
}

fn storage(
    app: &tauri::AppHandle,
    plugin: &str,
    key: &str,
    value: Option<Value>,
    caller: &str,
    request: &super::protocol::PluginRequest,
) -> Result<Value, PluginError> {
    let root = app
        .state::<PluginRegistryState>()
        .with_registry(|r| Ok(r.plugin_data_root(plugin)))
        .map_err(|_| error("storage.unavailable"))?;
    let coordinator = app.state::<super::lifecycle::LifecycleCoordinator>();
    coordinator
        .run(&format!("storage:{plugin}"), || {
            Ok((|| {
                let prepared = super::storage::prepare(&root, key, value)?;
                let state = app.state::<WebSessions>();
                let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
                sessions.commit(caller, request, Instant::now(), || prepared.commit())
            })())
        })
        .map_err(|_| error("storage.unavailable"))?
}

pub fn revoke(app: &tauri::AppHandle, plugin: &str) {
    let labels = app
        .state::<WebSessions>()
        .0
        .lock()
        .map(|mut s| s.revoke(plugin))
        .unwrap_or_default();
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = crate::services::surface_activity::destroy_surface(&window);
        }
    }
}
