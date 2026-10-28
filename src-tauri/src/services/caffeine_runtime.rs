use super::awake_battery::{AwakeBatteryPolicy, AwakePowerSnapshot};
use super::awake_preferences::{AwakeCustomInput, AwakePreferences};
use super::caffeine_schedule::{CaffeineSchedule, ClockReading};
use tauri::{Emitter, Manager};

use super::caffeine::{CaffeineAction, CaffeineErrorCode, CaffeineSnapshot, CaffeineState};
use crate::brand::ZERO_AWAKE_PLUGIN_ID;

pub const STATE_CHANGED_EVENT: &str = "caffeine-state-changed";

#[derive(Debug, Clone, Copy)]
pub enum AwakeRequest {
    Set {
        enabled: bool,
        duration: Option<u64>,
    },
    Schedule {
        schedule: CaffeineSchedule,
        input: Option<AwakeCustomInput>,
    },
    Toggle,
    Exit,
}

impl AwakeRequest {
    fn action(self) -> CaffeineAction {
        match self {
            Self::Schedule { .. } | Self::Set { enabled: true, .. } => CaffeineAction::Enable,
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
    let state = app.state::<CaffeineState>();
    let power = if matches!(
        request,
        AwakeRequest::Exit | AwakeRequest::Set { enabled: false, .. }
    ) {
        AwakePowerSnapshot::unknown()
    } else {
        state.power_reader.read()
    };
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
                    if let AwakeRequest::Schedule { schedule, input } = request {
                        schedule
                            .validate(
                                ClockReading::now()
                                    .map_err(|_| CaffeineErrorCode::OperationFailed)?
                                    .wall_ms,
                            )
                            .map_err(|_| CaffeineErrorCode::OperationFailed)?;
                        if let Some(input) = input {
                            input
                                .validate()
                                .map_err(|_| CaffeineErrorCode::OperationFailed)?;
                            if !matches!(
                                (schedule, input.mode),
                                (
                                    CaffeineSchedule::Duration { .. },
                                    super::awake_preferences::CustomMode::Duration
                                ) | (
                                    CaffeineSchedule::Until { .. },
                                    super::awake_preferences::CustomMode::Until
                                )
                            ) {
                                return Err(CaffeineErrorCode::OperationFailed);
                            }
                            if let CaffeineSchedule::Duration { minutes } = schedule {
                                if minutes != input.duration_minutes {
                                    return Err(CaffeineErrorCode::OperationFailed);
                                }
                            }
                        }
                    }
                    let (enabled, duration) = match request {
                        AwakeRequest::Set { enabled, duration } => (enabled, duration),
                        AwakeRequest::Toggle => (
                            !state
                                .snapshot()
                                .map_err(|_| CaffeineErrorCode::OperationFailed)?
                                .enabled,
                            None,
                        ),
                        AwakeRequest::Schedule { .. } => (true, None),
                        AwakeRequest::Exit => unreachable!(),
                    };
                    if enabled && !crate::plugin_is_enabled(app, ZERO_AWAKE_PLUGIN_ID) {
                        return Err(CaffeineErrorCode::OperationFailed);
                    }
                    if enabled {
                        let (policy, unavailable) = effective_policy(&state);
                        let schedule = match request {
                            AwakeRequest::Schedule { schedule, .. } => schedule,
                            _ => {
                                if !super::caffeine::is_allowed_duration_minutes(duration) {
                                    return Err(CaffeineErrorCode::OperationFailed);
                                }
                                duration
                                    .map(|minutes| CaffeineSchedule::Duration { minutes })
                                    .unwrap_or(CaffeineSchedule::Unlimited)
                            }
                        };
                        state
                            .set_schedule(schedule, policy, &power, unavailable)
                            .map_err(|error| {
                                if error == "low_power_mode" {
                                    CaffeineErrorCode::LowPowerMode
                                } else {
                                    CaffeineErrorCode::OperationFailed
                                }
                            })?;
                        if let AwakeRequest::Schedule {
                            input: Some(input), ..
                        } = request
                        {
                            let saved = state
                                .preferences
                                .lock()
                                .map_err(|_| CaffeineErrorCode::PreferencesSaveFailed)?
                                .update(|p| p.custom_input = Some(input));
                            if saved.is_err() {
                                state.record_action_error(
                                    request.action(),
                                    CaffeineErrorCode::PreferencesSaveFailed,
                                );
                            }
                        }
                        schedule_monitor(app.clone());
                    } else {
                        state
                            .set_enabled(false, None)
                            .map_err(|_| CaffeineErrorCode::OperationFailed)?;
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
    let code = app
        .state::<CaffeineState>()
        .snapshot()
        .ok()
        .and_then(|s| s.action_error)
        .map(|e| e.code);
    let message = match (zh, code) {
        (true,Some(CaffeineErrorCode::LowPowerMode))=>"当前使用电池且低电量模式已开启，无法开始 Awake。",
        (false,Some(CaffeineErrorCode::LowPowerMode))=>"Cannot start Awake on battery while system low power mode is active.",
        (true, Some(CaffeineErrorCode::HideFailed)) => "Awake 已关闭，但隐藏状态栏入口失败。请在设置中重试。",
        (false, Some(CaffeineErrorCode::HideFailed)) => "Awake stopped, but its status icon could not be hidden. Retry in Settings.",
        (true, _) => "Awake 操作失败。请打开 Zero Awake 查看当前状态并重试。",
        (false, _) => "Awake could not complete the action. Open Zero Awake to check its current state and retry.",
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

pub fn effective_policy(state: &CaffeineState) -> (AwakeBatteryPolicy, bool) {
    let Ok(mut store) = state.preferences.lock() else {
        return (AwakeBatteryPolicy::default(), true);
    };
    let result = store.read();
    let unavailable = result.is_err();
    (
        result
            .ok()
            .or_else(|| store.last_good.clone())
            .map(|p| p.battery_policy)
            .unwrap_or_default(),
        unavailable,
    )
}

pub fn read_preferences(state: &CaffeineState) -> Result<AwakePreferences, String> {
    state
        .preferences
        .lock()
        .map_err(|_| "preferences_unavailable")?
        .read()
}

fn cached_policy(state: &CaffeineState) -> (AwakeBatteryPolicy, bool) {
    let Ok(store) = state.preferences.lock() else {
        return (AwakeBatteryPolicy::default(), true);
    };
    (
        store
            .last_good
            .as_ref()
            .map(|p| p.battery_policy)
            .unwrap_or_default(),
        store.unavailable,
    )
}
fn schedule_timer(app: tauri::AppHandle, generation: u64) {
    let state = app.state::<CaffeineState>();
    if !state.snapshot().is_ok_and(|s| s.remaining_ms.is_some()) {
        return;
    }
    let timer_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let worker = timer_app.clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                worker
                    .state::<crate::plugins::lifecycle::LifecycleCoordinator>()
                    .run(ZERO_AWAKE_PLUGIN_ID, || {
                        let state = worker.state::<CaffeineState>();
                        if state.generation() != Some(generation) {
                            return Ok(false);
                        }
                        match state.expire_if_current(generation, std::time::SystemTime::now()) {
                            Ok(true) => {
                                let _ = super::status_bar::refresh_status_bar(&worker);
                                let _ = worker.emit(STATE_CHANGED_EVENT, ());
                                Ok(false)
                            }
                            Ok(false) => Ok(true),
                            Err(error) => {
                                state.record_action_error(
                                    CaffeineAction::Expiry,
                                    CaffeineErrorCode::OperationFailed,
                                );
                                let _ = worker.emit(STATE_CHANGED_EVENT, ());
                                Err(error)
                            }
                        }
                    })
            })
            .await;
            match result {
                Ok(Ok(true)) => {}
                Ok(Ok(false)) => break,
                _ => {
                    show_native_error(&timer_app);
                    break;
                }
            }
        }
    });
    state.install_expiry_task(generation, task);
}

pub fn schedule_monitor(app: tauri::AppHandle) {
    let state = app.state::<CaffeineState>();
    let Some(generation) = state.generation() else {
        return;
    };
    schedule_timer(app.clone(), generation);
    let (policy, unavailable) = cached_policy(&state);
    if !policy.enabled() && !unavailable {
        state.cancel_protection_task();
        return;
    }
    let monitor_revision = state.begin_protection_monitor();
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let _events = super::awake_power_events::NativePowerEvents::new();
        let mut event_revision = super::awake_power_events::revision();
        let mut last_power = AwakePowerSnapshot::unknown();
        let mut ticks = 30u64;
        let mut next_power_read = std::time::Instant::now();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let native_app = task_app.clone();
            let previous = last_power.clone();
            let current_revision = super::awake_power_events::revision();
            let event_changed = current_revision != event_revision;
            event_revision = current_revision;
            let read_power = std::time::Instant::now() >= next_power_read
                || event_changed
                || ticks >= 4 && last_power.source == super::awake_battery::PowerSource::Unknown;
            if read_power {
                next_power_read = std::time::Instant::now() + std::time::Duration::from_secs(29);
            }
            let result = tauri::async_runtime::spawn_blocking(move || {
                let state = native_app.state::<CaffeineState>();
                if !state.is_current_monitor(generation, monitor_revision) {
                    return Ok(None);
                }
                let (policy, _unavailable) = if read_power {
                    effective_policy(&state)
                } else {
                    let store = state
                        .preferences
                        .lock()
                        .map_err(|_| "preferences_unavailable")?;
                    (
                        store
                            .last_good
                            .as_ref()
                            .map(|p| p.battery_policy)
                            .unwrap_or_default(),
                        store.unavailable,
                    )
                };
                let power = if policy.enabled() && read_power {
                    state.power_reader.read()
                } else {
                    previous
                };
                native_app
                    .state::<crate::plugins::lifecycle::LifecycleCoordinator>()
                    .run(ZERO_AWAKE_PLUGIN_ID, || {
                        if !state.is_current_monitor(generation, monitor_revision) {
                            return Ok(None);
                        }
                        let (policy, unavailable) = cached_policy(&state);
                        let before = state.snapshot()?;
                        if let Err(error) = state.evaluate(
                            generation,
                            ClockReading::now()?,
                            policy,
                            &power,
                            unavailable,
                        ) {
                            state.record_action_error(
                                CaffeineAction::Expiry,
                                CaffeineErrorCode::OperationFailed,
                            );
                            let _ = native_app.emit(STATE_CHANGED_EVENT, ());
                            return Err(error);
                        }
                        let after = state.snapshot()?;
                        if read_power
                            || before.enabled != after.enabled
                            || before.protection_unavailable != after.protection_unavailable
                        {
                            let _ = super::status_bar::refresh_status_bar(&native_app);
                            let _ = native_app.emit(STATE_CHANGED_EVENT, ());
                        }
                        if !after.enabled
                            || after.schedule == Some(CaffeineSchedule::Unlimited)
                                && !policy.enabled()
                                && !unavailable
                        {
                            return Ok(None);
                        }
                        Ok(Some(power))
                    })
            })
            .await;
            match result {
                Ok(Ok(Some(power))) => {
                    last_power = power;
                    ticks = if read_power { 0 } else { ticks + 1 };
                }
                Ok(Ok(None)) => break,
                _ => {
                    show_native_error(&task_app);
                    break;
                }
            }
        }
    });
    state.install_protection_task(generation, monitor_revision, task);
}

#[derive(serde::Serialize)]
pub struct AwakeBatteryPolicyUpdate {
    pub policy: AwakeBatteryPolicy,
    pub session: CaffeineSnapshot,
}
pub async fn update_policy(
    app: tauri::AppHandle,
    policy: AwakeBatteryPolicy,
) -> Result<AwakeBatteryPolicyUpdate, String> {
    tauri::async_runtime::spawn_blocking(move || {
        policy.validate()?;
        let state = app.state::<CaffeineState>();
        let power = state.power_reader.read();
        app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
            .run(ZERO_AWAKE_PLUGIN_ID, || {
                state
                    .preferences
                    .lock()
                    .map_err(|_| "preferences_unavailable")?
                    .update(|p| p.battery_policy = policy)?;
                if let Some(generation) = state.generation() {
                    if state
                        .evaluate(generation, ClockReading::now()?, policy, &power, false)
                        .is_err()
                    {
                        state.record_action_error(
                            CaffeineAction::Disable,
                            CaffeineErrorCode::OperationFailed,
                        );
                    }
                    schedule_monitor(app.clone());
                }
                let _ = super::status_bar::refresh_status_bar(&app);
                let _ = app.emit(STATE_CHANGED_EVENT, ());
                Ok(AwakeBatteryPolicyUpdate {
                    policy,
                    session: state.snapshot()?,
                })
            })
    })
    .await
    .map_err(|_| "preferences_save_failed")?
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
