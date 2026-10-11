use std::time::SystemTime;
use tauri::{Emitter, Manager};

use super::caffeine::{
    CaffeineAction, CaffeineErrorCode, CaffeineExpiry, CaffeineSnapshot, CaffeineState,
};
use crate::brand::ZERO_AWAKE_PLUGIN_ID;

pub const STATE_CHANGED_EVENT: &str = "caffeine-state-changed";

#[derive(Debug, Clone, Copy)]
pub enum AwakeRequest {
    Set {
        enabled: bool,
        duration: Option<u64>,
    },
    Toggle,
    Exit,
}

impl AwakeRequest {
    fn action(self) -> CaffeineAction {
        match self {
            Self::Set { enabled: true, .. } => CaffeineAction::Enable,
            Self::Set { enabled: false, .. } => CaffeineAction::Disable,
            Self::Toggle => CaffeineAction::Toggle,
            Self::Exit => CaffeineAction::Exit,
        }
    }
}

// Stop first: a failed visibility write must never restart a native session.
fn stop_then_hide(
    stop: impl FnOnce() -> Result<(), String>,
    hide: impl FnOnce() -> Result<(), String>,
) -> Result<(), CaffeineErrorCode> {
    stop().map_err(|_| CaffeineErrorCode::OperationFailed)?;
    hide().map_err(|_| CaffeineErrorCode::HideFailed)
}

pub async fn execute(
    app: tauri::AppHandle,
    request: AwakeRequest,
) -> Result<CaffeineSnapshot, String> {
    let worker_app = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || execute_blocking(&worker_app, request))
            .await
            .map_err(|_| "Awake state worker failed".to_string())
            .and_then(|result| result);
    if result.is_err() {
        let state = app.state::<CaffeineState>();
        if state
            .snapshot()
            .is_ok_and(|snapshot| snapshot.action_error.is_none())
        {
            state.record_action_error(request.action(), CaffeineErrorCode::OperationFailed);
        }
        let _ = app.emit(STATE_CHANGED_EVENT, ());
    }
    result
}

fn execute_blocking(
    app: &tauri::AppHandle,
    request: AwakeRequest,
) -> Result<CaffeineSnapshot, String> {
    app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
        .run(ZERO_AWAKE_PLUGIN_ID, || {
            let state = app.state::<CaffeineState>();
            let result = (|| {
                if matches!(request, AwakeRequest::Exit) {
                    stop_then_hide(
                        || state.set_enabled(false, None).map(|_| ()),
                        || {
                            super::status_bar::persist_status_bar_settings(
                                app,
                                super::status_bar::UpdateStatusBarSettingsInput {
                                    enabled: None,
                                    show_plugin_items_on_launch: None,
                                    plugin_items_collapsed: None,
                                    visible_plugin_items: Some(std::collections::HashMap::from([
                                        (ZERO_AWAKE_PLUGIN_ID.into(), false),
                                    ])),
                                },
                            )
                            .map(|_| ())
                        },
                    )?;
                } else {
                    let (enabled, duration) = match request {
                        AwakeRequest::Set { enabled, duration } => (enabled, duration),
                        AwakeRequest::Toggle => (
                            !state
                                .snapshot()
                                .map_err(|_| CaffeineErrorCode::OperationFailed)?
                                .enabled,
                            None,
                        ),
                        AwakeRequest::Exit => unreachable!(),
                    };
                    if enabled && !crate::plugin_is_enabled(app, ZERO_AWAKE_PLUGIN_ID) {
                        return Err(CaffeineErrorCode::OperationFailed);
                    }
                    let transition = state
                        .set_enabled(enabled, duration)
                        .map_err(|_| CaffeineErrorCode::OperationFailed)?;
                    if let Some(expiry) = transition.expiry {
                        schedule_expiry(app.clone(), expiry);
                    }
                    observe_backend(app);
                }
                super::status_bar::refresh_status_bar(app)
                    .map_err(|_| CaffeineErrorCode::DisplayFailed)?;
                Ok(())
            })();
            if let Err(code) = result {
                state.record_action_error(request.action(), code);
            }
            let _ = app.emit(STATE_CHANGED_EVENT, ());
            result.map_err(|code| format!("{code:?}"))?;
            state.snapshot()
        })
}

pub fn dispatch_native(app: tauri::AppHandle, request: AwakeRequest) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute(app.clone(), request).await {
            tracing::warn!(%error, "Awake native action failed");
            show_native_error(&app);
        }
    });
}

fn show_native_error(app: &tauri::AppHandle) {
    let zh = super::status_bar::status_bar_language(app).starts_with("zh");
    let hide_failed = app
        .state::<CaffeineState>()
        .snapshot()
        .ok()
        .and_then(|s| s.action_error)
        .is_some_and(|e| e.code == CaffeineErrorCode::HideFailed);
    let message = match (zh, hide_failed) {
        (true, true) => "Awake 已关闭，但隐藏状态栏入口失败。请在设置中重试。",
        (false, true) => "Awake stopped, but its status icon could not be hidden. Retry in Settings.",
        (true, false) => "Awake 操作失败。请打开 Zero Awake 查看当前状态并重试。",
        (false, false) => "Awake could not complete the action. Open Zero Awake to check its current state and retry.",
    };
    tauri::async_runtime::spawn(async move {
        super::surface_activity::show_error_dialog("Zero Awake", message).await;
    });
}

#[cfg(target_os = "macos")]
fn observe_backend(app: &tauri::AppHandle) {
    if let Some(generation) = app.state::<CaffeineState>().diagnostic_generation() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                if !app
                    .state::<CaffeineState>()
                    .observe_owned_backend(generation)
                {
                    break;
                }
            }
        });
    }
}
#[cfg(not(target_os = "macos"))]
fn observe_backend(_app: &tauri::AppHandle) {}

pub fn schedule_expiry(app: tauri::AppHandle, expiry: CaffeineExpiry) {
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let mut delay = expiry
            .expires_at
            .duration_since(SystemTime::now())
            .unwrap_or_default();
        loop {
            tokio::time::sleep(delay).await;
            let native_app = task_app.clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                native_app
                    .state::<crate::plugins::lifecycle::LifecycleCoordinator>()
                    .run(ZERO_AWAKE_PLUGIN_ID, || {
                        let state = native_app.state::<CaffeineState>();
                        let now = SystemTime::now();
                        // Tokio's monotonic wake and the wall-clock deadline can differ.
                        // Re-arm an early wake instead of abandoning the finite session.
                        if let Some(remaining) =
                            state.expiry_delay_if_current(expiry.generation, now)?
                        {
                            return Ok(Some(remaining));
                        }
                        match state.expire_if_current(expiry.generation, now) {
                            Ok(false) => Ok(None),
                            Ok(true) => {
                                let result = super::status_bar::refresh_status_bar(&native_app);
                                if result.is_err() {
                                    state.record_action_error(
                                        CaffeineAction::Expiry,
                                        CaffeineErrorCode::DisplayFailed,
                                    );
                                }
                                let _ = native_app.emit(STATE_CHANGED_EVENT, ());
                                result.map(|_| None)
                            }
                            Err(error) => {
                                state.record_action_error(
                                    CaffeineAction::Expiry,
                                    CaffeineErrorCode::OperationFailed,
                                );
                                let _ = native_app.emit(STATE_CHANGED_EVENT, ());
                                Err(error)
                            }
                        }
                    })
            })
            .await;
            match result {
                Ok(Ok(Some(remaining))) => delay = remaining,
                Ok(Ok(None)) => break,
                _ => {
                    show_native_error(&task_app);
                    break;
                }
            }
        }
    });
    app.state::<CaffeineState>()
        .install_expiry_task(expiry.generation, task);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn failed_stop_never_hides_entry() {
        let hidden = Cell::new(false);
        assert_eq!(
            stop_then_hide(
                || Err("stop failed".into()),
                || {
                    hidden.set(true);
                    Ok(())
                }
            ),
            Err(CaffeineErrorCode::OperationFailed)
        );
        assert!(!hidden.get());
    }

    #[test]
    fn failed_hide_leaves_function_stopped() {
        let active = Cell::new(true);
        assert_eq!(
            stop_then_hide(
                || {
                    active.set(false);
                    Ok(())
                },
                || Err("save failed".into())
            ),
            Err(CaffeineErrorCode::HideFailed)
        );
        assert!(!active.get());
        assert!(stop_then_hide(|| Ok(()), || Ok(())).is_ok());
    }
}
