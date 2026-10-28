use crate::services::caffeine::{CaffeineSnapshot, CaffeineState};
use crate::services::caffeine_runtime::{self, AwakeRequest};

#[tauri::command]
pub async fn get_caffeine_state(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<CaffeineSnapshot, String> {
    crate::services::main_navigation::ensure_shell_caller(window.label())?;
    use tauri::{Emitter, Manager};
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::plugins::lifecycle::LifecycleCoordinator>()
            .run(crate::brand::ZERO_AWAKE_PLUGIN_ID, || {
                let state = app.state::<CaffeineState>();
                if let Some(generation) = state.generation() {
                    if state.expire_if_current(generation, std::time::SystemTime::now())? {
                        let _ = crate::services::status_bar::refresh_status_bar(&app);
                        let _ = app.emit(caffeine_runtime::STATE_CHANGED_EVENT, ());
                    }
                }
                state.snapshot()
            })
    })
    .await
    .map_err(|_| "session_unavailable")?
}

#[tauri::command]
pub async fn toggle_keep_awake(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: bool,
    duration_minutes: Option<u64>,
) -> Result<CaffeineSnapshot, String> {
    crate::services::main_navigation::ensure_shell_caller(window.label())?;
    caffeine_runtime::execute(
        app,
        AwakeRequest::Set {
            enabled,
            duration: duration_minutes,
        },
    )
    .await
}

#[tauri::command]
pub async fn set_caffeine_schedule(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    schedule: crate::services::caffeine_schedule::CaffeineSchedule,
    input: Option<crate::services::awake_preferences::AwakeCustomInput>,
) -> Result<CaffeineSnapshot, String> {
    crate::services::main_navigation::ensure_shell_caller(window.label())?;
    caffeine_runtime::execute(app, AwakeRequest::Schedule { schedule, input }).await
}
#[tauri::command]
pub async fn get_awake_preferences(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<crate::services::awake_preferences::AwakePreferences, String> {
    crate::services::main_navigation::ensure_shell_caller(window.label())?;
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        caffeine_runtime::read_preferences(&app.state::<CaffeineState>())
    })
    .await
    .map_err(|_| "preferences_unavailable")?
}
#[tauri::command]
pub async fn get_awake_power_state(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<crate::services::awake_battery::AwakePowerSnapshot, String> {
    crate::services::main_navigation::ensure_shell_caller(window.label())?;
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || app.state::<CaffeineState>().power_reader.read())
        .await
        .map_err(|_| "power_unavailable".into())
}
#[tauri::command]
pub async fn update_awake_battery_policy(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    policy: crate::services::awake_battery::AwakeBatteryPolicy,
) -> Result<caffeine_runtime::AwakeBatteryPolicyUpdate, String> {
    crate::services::main_navigation::ensure_shell_caller(window.label())?;
    caffeine_runtime::update_policy(app, policy).await
}
