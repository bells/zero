use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, WebviewWindow};

use super::protocol::{
    PluginError, PluginInvokeInput, PluginMethod, PluginResponse, PluginSessionInfo, SessionBinding,
};
use super::registry::PluginRegistryState;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use super::session::Sessions;
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
        .with_registry(|registry| owner_from_registry(registry, plugin, view))
        .map_err(|message| PluginError {
            code: "plugin.unavailable".into(),
            message,
            retryable: false,
        })
}

pub(crate) fn owner_from_registry(
    registry: &super::registry::PluginRegistry,
    plugin: &str,
    view: &str,
) -> Result<SessionOwner, String> {
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
        || if let Some(event) = view.strip_prefix("background:") {
            !manifest
                .background
                .as_ref()
                .is_some_and(|b| b.events.iter().any(|e| e == event))
                || !record
                    .approved_permissions
                    .contains(&super::contracts::PluginPermission::BackgroundSchedule)
        } else {
            !manifest.contributes.views.iter().any(|v| v.id == view)
                || !manifest
                    .activation_events
                    .iter()
                    .any(|e| e == &format!("onView:{view}"))
        }
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
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn with_live_capability<T>(
    app: &tauri::AppHandle,
    caller: &str,
    request: &super::protocol::PluginRequest,
    capability_id: &str,
    operation: impl FnOnce(&mut Sessions) -> Result<T, PluginError>,
) -> Result<T, PluginError> {
    app.state::<PluginRegistryState>()
        .read_registry(|registry| {
            let state = app.state::<WebSessions>();
            let mut sessions = state.0.lock().map_err(|_| error("session.lock"))?;
            let session = sessions.get(&request.session_id, caller, request.generation)?;
            let plugin = &session.owner.plugin_id;
            let live = owner_from_registry(registry, plugin, &session.owner.view_id)
                .map_err(|_| error("session.stale"))?;
            if !registry.records().iter().any(|record| {
                record.name == *plugin
                    && record.protocol_manifest.as_ref().is_some_and(|manifest| {
                        manifest
                            .required_capabilities
                            .iter()
                            .flatten()
                            .any(|capability| capability.id == capability_id)
                    })
            }) {
                return Err(error("capability.undeclared"));
            }
            sessions.commit_live(caller, request, &live, true, Instant::now(), || Ok(()))?;
            operation(&mut sessions)
        })
        .map_err(|_| error("plugin.unavailable"))?
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
    if input.view_id.starts_with("background:") {
        return Err(error("session.kind"));
    }
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
            closed_app
                .state::<super::media_runtime::NativeMediaState>()
                .close_window(&closed_label);
            if let Ok(mut sessions) = closed_app.state::<WebSessions>().0.lock() {
                sessions.close_window(&closed_label);
                closed_app
                    .state::<crate::services::network_fetch::NetworkFetchState>()
                    .close_window(&closed_label);
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
    power: tauri::State<'_, crate::services::power_lease::PowerLeaseState>,
    network: tauri::State<'_, crate::services::network_fetch::NetworkFetchState>,
    media: tauri::State<'_, super::media_runtime::NativeMediaState>,
) -> Result<(), PluginError> {
    let mut sessions = state.0.lock().map_err(|_| error("session.lock"))?;
    sessions.finish(window.label(), &input.request, Instant::now())?;
    network.cancel(&input.request);
    power.cancel(&input.request);
    media.cancel(&input.request);
    Ok(())
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
            PluginMethod::ScreenOpenSystem(_) => {
                #[cfg(target_os = "windows")]
                {
                    with_live_capability(
                        &app,
                        &caller,
                        &request,
                        "screen.system-capture",
                        |sessions| {
                            let result = crate::services::system_screenshot::open()
                                .map_err(|_| error("screen.openFailed"));
                            sessions.finish(&caller, &request, Instant::now())?;
                            result.map(|()| Value::Null)
                        },
                    )
                }
                #[cfg(not(target_os = "windows"))]
                Err(error("api.unavailable"))
            }
            method @ (PluginMethod::ApplicationScan(_)
            | PluginMethod::ApplicationPage(_)
            | PluginMethod::ApplicationActivate(_)) => {
                #[cfg(target_os = "macos")]
                {
                    super::application_runtime::dispatch(&app, &caller, &request, method)
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = method;
                    Err(error("api.unavailable"))
                }
            }
            method @ (PluginMethod::MediaCache(_)
            | PluginMethod::MediaPreview(_)
            | PluginMethod::MediaReleasePreview(_)
            | PluginMethod::MediaExport(_)
            | PluginMethod::WallpaperPlatform(_)
            | PluginMethod::WallpaperPrepare(_)
            | PluginMethod::WallpaperApply(_)
            | PluginMethod::WallpaperCancel(_)
            | PluginMethod::WallpaperRecover(_)) => {
                super::media_runtime::dispatch(&app, &caller, &request, method)
            }
            method @ (PluginMethod::ScheduleUpsert(_)
            | PluginMethod::ScheduleCancel(_)
            | PluginMethod::BackgroundComplete(_)) => {
                super::background_runtime::dispatch(&app, &caller, &request, method)
            }
            PluginMethod::StorageGet(input) => storage(
                &app,
                &info.plugin_id,
                &input.key,
                None,
                None,
                &caller,
                &request,
            ),
            PluginMethod::StorageSet(input) => storage(
                &app,
                &info.plugin_id,
                &input.key,
                Some(input.value),
                None,
                &caller,
                &request,
            ),
            PluginMethod::StorageCompareAndSet(input) => storage(
                &app,
                &info.plugin_id,
                &input.key,
                Some(input.value),
                Some(input.expected_value),
                &caller,
                &request,
            ),
            PluginMethod::NetworkFetch(input) => fetch_network(
                &app,
                input,
                &info.plugin_id,
                &info.surface_id,
                &caller,
                &request,
            ),
            method @ (PluginMethod::PowerAcquire(_)
            | PluginMethod::PowerRelease(_)
            | PluginMethod::PowerStatus(_)
            | PluginMethod::PowerStartTask(_)
            | PluginMethod::PowerTaskStatus(_)
            | PluginMethod::PowerStopTask(_)
            | PluginMethod::PowerUpdateTaskConditions(_)
            | PluginMethod::PowerReadSnapshot(_)) => (|| {
                app.state::<PluginRegistryState>()
                    .read_registry(|registry| {
                        let live = owner_from_registry(registry, &info.plugin_id, &info.surface_id)
                            .map_err(|_| error("session.stale"))?;
                        let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
                        sessions.commit_live(&caller, &request, &live, true, Instant::now(), || {
                            let power =
                                app.state::<crate::services::power_lease::PowerLeaseState>();
                            match method {
                                PluginMethod::PowerAcquire(input) => {
                                    serde_json::to_value(power.acquire(&live, &request, input)?)
                                        .map_err(|_| error("response.invalid"))
                                }
                                PluginMethod::PowerStatus(_) => {
                                    serde_json::to_value(power.status(&live)?)
                                        .map_err(|_| error("response.invalid"))
                                }
                                PluginMethod::PowerStartTask(input) => {
                                    serde_json::to_value(power.start_task(&live, &request, input)?)
                                        .map_err(|_| error("response.invalid"))
                                }
                                PluginMethod::PowerTaskStatus(_) => {
                                    serde_json::to_value(power.task_status(&live)?)
                                        .map_err(|_| error("response.invalid"))
                                }
                                PluginMethod::PowerReadSnapshot(_) => {
                                    serde_json::to_value(power.read_snapshot())
                                        .map_err(|_| error("response.invalid"))
                                }
                                PluginMethod::PowerUpdateTaskConditions(input) => {
                                    serde_json::to_value(
                                        power.update_task_conditions(&live, input)?,
                                    )
                                    .map_err(|_| error("response.invalid"))
                                }
                                PluginMethod::PowerStopTask(input) => {
                                    power.stop_task(&live, input)?;
                                    Ok(Value::Null)
                                }
                                PluginMethod::PowerRelease(input) => {
                                    power.release(&live, input)?;
                                    Ok(Value::Null)
                                }
                                _ => Err(error("request.invalid")),
                            }
                        })
                    })
                    .map_err(|_| error("plugin.unavailable"))?
            })(),
            PluginMethod::DiagnosticsEmit(input) => {
                (|| {
                    crate::services::diagnostics::events::validate(&input)
                        .map_err(|_| error("request.invalid"))?;
                    // Registry -> session -> diagnostics is the lifecycle lock order. Keep the
                    // live registry guard until admission so revocation cannot race the write.
                    app.state::<PluginRegistryState>().read_registry(|registry| {
                    let live = owner_from_registry(registry, &info.plugin_id, &info.surface_id)
                        .map_err(|_| error("session.stale"))?;
                    let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
                    sessions.commit_live(&caller, &request, &live, true, Instant::now(), || {
                        app.state::<std::sync::Arc<crate::services::diagnostics::Diagnostics>>()
                            .emit(crate::services::diagnostics::contracts::Source::Extension,
                                Some(&info.plugin_id), input, Default::default(), None)
                            .map_err(|e| error(&format!("diagnostics.{}", e.code)))?;
                        Ok(Value::Null)
                    })
                }).map_err(|_| error("plugin.unavailable"))?
                })()
            }

            PluginMethod::ShowMessage(input) => (|| {
                if input.message.is_empty() || input.message.chars().count() > 2048 {
                    return Err(error("request.invalid"));
                }
                app.state::<PluginRegistryState>()
                    .read_registry(|registry| {
                        let live = owner_from_registry(registry, &info.plugin_id, &info.surface_id)
                            .map_err(|_| error("session.stale"))?;
                        let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
                        sessions.commit_live(&caller, &request, &live, true, Instant::now(), || {
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
                    })
                    .map_err(|_| error("plugin.unavailable"))?
            })(),
        };
        let result =
            if request.method.starts_with("media.") || request.method.starts_with("wallpaper.") {
                result.and_then(|value| {
                    app.state::<PluginRegistryState>()
                        .read_registry(|registry| {
                            let mut sessions = state.0.lock().map_err(|_| error("session.lock"))?;
                            let session =
                                sessions.get(&request.session_id, &caller, request.generation)?;
                            let live = owner_from_registry(
                                registry,
                                &session.owner.plugin_id,
                                &session.owner.view_id,
                            )
                            .map_err(|_| error("session.stale"))?;
                            let value = sessions.commit_live(
                                &caller,
                                &request,
                                &live,
                                true,
                                Instant::now(),
                                || Ok(value),
                            )?;
                            sessions.finish(&caller, &request, Instant::now())?;
                            Ok(value)
                        })
                        .map_err(|_| error("plugin.unavailable"))?
                })
            } else {
                result
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

fn fetch_network(
    app: &tauri::AppHandle,
    input: super::protocol::NetworkFetchInput,
    plugin: &str,
    view: &str,
    caller: &str,
    request: &super::protocol::PluginRequest,
) -> Result<Value, PluginError> {
    let started = Instant::now();
    let mut admission = app
        .state::<PluginRegistryState>()
        .read_registry(|registry| {
            let live =
                owner_from_registry(registry, plugin, view).map_err(|_| error("session.stale"))?;
            let scopes = registry
                .records()
                .iter()
                .find(|record| record.name == plugin)
                .and_then(|record| record.protocol_manifest.as_ref())
                .and_then(|manifest| manifest.network.as_ref())
                .ok_or_else(|| error("network.scopeDenied"))?
                .allowed_origins
                .clone();
            let state = app.state::<WebSessions>();
            let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
            sessions.commit_live(caller, request, &live, true, Instant::now(), || {
                app.state::<crate::services::network_fetch::NetworkFetchState>()
                    .admit(&live, request, scopes, started)
            })
        })
        .map_err(|_| error("plugin.unavailable"))??;
    // Both authorization locks are released before polling any network IO.
    let output = tauri::async_runtime::block_on(admission.execute(input))?;
    app.state::<PluginRegistryState>()
        .read_registry(|registry| {
            let live =
                owner_from_registry(registry, plugin, view).map_err(|_| error("session.stale"))?;
            let state = app.state::<WebSessions>();
            let mut sessions = state.0.lock().map_err(|_| error("session.lock"))?;
            let value =
                sessions.commit_live(caller, request, &live, true, Instant::now(), || {
                    admission.ensure_active()?;
                    serde_json::to_value(output).map_err(|_| error("response.invalid"))
                })?;
            sessions.finish(caller, request, Instant::now())?;
            Ok(value)
        })
        .map_err(|_| error("plugin.unavailable"))?
}

fn storage(
    app: &tauri::AppHandle,
    plugin: &str,
    key: &str,
    value: Option<Value>,
    expected: Option<Value>,
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
                let prepared = match expected {
                    Some(expected) => super::storage::prepare_compare_and_set(
                        &root,
                        key,
                        expected,
                        value.ok_or_else(|| error("request.invalid"))?,
                    )?,
                    None => super::storage::prepare(&root, key, value)?,
                };
                let state = app.state::<WebSessions>();
                app.state::<PluginRegistryState>()
                    .read_registry(|registry| {
                        let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
                        let session =
                            sessions.get(&request.session_id, caller, request.generation)?;
                        let live = owner_from_registry(
                            registry,
                            &session.owner.plugin_id,
                            &session.owner.view_id,
                        )
                        .map_err(|_| error("session.stale"))?;
                        sessions.commit_live(caller, request, &live, true, Instant::now(), || {
                            prepared.commit()
                        })
                    })
                    .map_err(|_| error("plugin.unavailable"))?
            })())
        })
        .map_err(|_| error("storage.unavailable"))?
}

pub fn revoke(app: &tauri::AppHandle, plugin: &str) -> Result<(), PluginError> {
    // A failed durable revocation still tears down all ephemeral authority.
    app.state::<super::media_runtime::NativeMediaState>()
        .revoke(plugin);
    let fenced = super::background_runtime::fence(app, plugin);
    let labels = app
        .state::<WebSessions>()
        .0
        .lock()
        .map(|mut s| s.revoke(plugin))
        .map_err(|_| error("session.lock"));
    app.state::<crate::services::power_lease::PowerLeaseState>()
        .revoke(plugin);
    app.state::<crate::services::network_fetch::NetworkFetchState>()
        .revoke(plugin);
    for label in labels.as_ref().into_iter().flatten() {
        if let Some(window) = app.get_webview_window(label) {
            let _ = crate::services::surface_activity::destroy_surface(&window);
        }
    }
    let persisted = super::background_runtime::revoke(app, plugin);
    fenced?;
    labels?;
    persisted
}

pub(crate) fn open_background(
    app: &tauri::AppHandle,
    occurrence: super::scheduler::Occurrence,
) -> Result<String, PluginError> {
    let surface = format!("background:{}", occurrence.schedule.event_id);
    let owner = live_owner(app, &occurrence.owner.plugin_id, &surface)?;
    if super::background_runtime::scheduled_owner(&owner) != occurrence.owner {
        return Err(error("session.stale"));
    }
    let main = app
        .state::<PluginRegistryState>()
        .read_registry(|registry| {
            registry
                .records()
                .iter()
                .find(|r| r.name == owner.plugin_id)
                .and_then(|r| r.protocol_manifest.as_ref())
                .and_then(|m| m.background.as_ref())
                .map(|b| b.main.clone())
                .ok_or_else(|| error("background.unavailable"))
        })
        .map_err(|_| error("plugin.unavailable"))??;
    let started =
        crate::services::continuous_clock::now_ms().map_err(|_| error("background.clock"))?;
    let info = app
        .state::<WebSessions>()
        .0
        .lock()
        .map_err(|_| error("session.lock"))?
        .issue_background(owner, occurrence.clone(), main, started, Instant::now())?;
    let label = format!("plugin-{}", info.session_id);
    if let Err(error) = super::background_runtime::reserve(app, occurrence, label.clone(), started)
    {
        app.state::<WebSessions>()
            .0
            .lock()
            .map_err(|_| error.clone())?
            .close_window(&label);
        return Err(error);
    }
    let url = format!("zero-plugin://{}/__zero_background.html", info.session_id);
    let navigation_url = url.clone();
    let script = include_str!("web_bootstrap.js").replace(
        "__ZERO_SESSION_BINDING__",
        &serde_json::to_string(&info).map_err(|_| error("session.serialize"))?,
    );
    let result = tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::CustomProtocol(url.parse().map_err(|_| error("asset.url"))?),
    )
    .visible(false)
    .focused(false)
    .focusable(false)
    .devtools(false)
    .skip_taskbar(true)
    .title("Zero background task")
    .initialization_script(script)
    .on_navigation(move |url| url.as_str() == navigation_url)
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
    .build();
    let window = match result {
        Ok(window) => window,
        Err(_) => {
            close_background(app, &label);
            return Err(error("window.create"));
        }
    };
    let closed_app = app.clone();
    let closed_label = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            close_background(&closed_app, &closed_label);
        }
    });
    let timeout_app = app.clone();
    let timeout_label = label.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let expired = timeout_app
            .state::<WebSessions>()
            .0
            .lock()
            .map(|mut s| s.expire_unready(&info.session_id))
            .unwrap_or(true);
        if expired {
            super::background_runtime::destroy(&timeout_app, &timeout_label);
        }
    });
    Ok(label)
}

pub(crate) fn close_background(app: &tauri::AppHandle, label: &str) {
    app.state::<super::media_runtime::NativeMediaState>()
        .close_window(label);
    if let Ok(mut sessions) = app.state::<WebSessions>().0.lock() {
        sessions.close_window(label);
    }
    app.state::<crate::services::network_fetch::NetworkFetchState>()
        .close_window(label);
    super::background_runtime::closed(app, label);
}
