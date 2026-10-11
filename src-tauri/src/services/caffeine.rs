use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
use std::process::Child;

use serde::Serialize;

pub const ALLOWED_DURATION_MINUTES: [u64; 7] = [5, 10, 15, 30, 60, 120, 300];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaffeineAction {
    Enable,
    Disable,
    Toggle,
    Exit,
    Expiry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaffeineErrorCode {
    OperationFailed,
    HideFailed,
    DisplayFailed,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaffeineActionError {
    pub action: CaffeineAction,
    pub code: CaffeineErrorCode,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaffeineSnapshot {
    pub enabled: bool,
    pub started_at_ms: Option<u64>,
    pub duration_minutes: Option<u64>,
    pub expires_at_ms: Option<u64>,
    pub message: String,
    pub action_error: Option<CaffeineActionError>,
}

#[derive(Debug, Clone, Copy)]
pub struct CaffeineExpiry {
    pub generation: u64,
    pub expires_at: SystemTime,
}

pub struct CaffeineTransition {
    pub snapshot: CaffeineSnapshot,
    pub expiry: Option<CaffeineExpiry>,
}

#[derive(Debug, Clone, Default)]
struct CaffeineSession {
    enabled: bool,
    started_at: Option<SystemTime>,
    duration_minutes: Option<u64>,
    expires_at: Option<SystemTime>,
    generation: u64,
    action_error: Option<CaffeineActionError>,
}

impl CaffeineSession {
    fn enable_at(
        &mut self,
        started_at: SystemTime,
        duration_minutes: Option<u64>,
    ) -> Result<u64, String> {
        if !is_allowed_duration_minutes(duration_minutes) {
            return Err("不支持的咖啡因持续时长".into());
        }

        self.generation = self.generation.saturating_add(1);
        self.enabled = true;
        self.action_error = None;
        self.started_at = Some(started_at);
        self.duration_minutes = duration_minutes;
        self.expires_at = expires_at_for(started_at, duration_minutes)?;

        Ok(self.generation)
    }

    fn disable(&mut self) {
        self.generation = self.generation.saturating_add(1);
        self.enabled = false;
        self.action_error = None;
        self.started_at = None;
        self.duration_minutes = None;
        self.expires_at = None;
    }

    fn expire_if_current(&mut self, generation: u64, now: SystemTime) -> bool {
        if !self.should_expire(generation, now) {
            return false;
        }

        self.disable();
        true
    }

    fn should_expire(&self, generation: u64, now: SystemTime) -> bool {
        self.enabled
            && self.generation == generation
            && self
                .expires_at
                .is_some_and(|expires_at| now.duration_since(expires_at).is_ok())
    }

    fn snapshot(&self) -> CaffeineSnapshot {
        CaffeineSnapshot {
            enabled: self.enabled,
            started_at_ms: self.started_at.and_then(system_time_to_ms),
            duration_minutes: self.duration_minutes,
            expires_at_ms: self.expires_at.and_then(system_time_to_ms),
            message: if self.enabled {
                "咖啡因模式已开启".into()
            } else {
                "咖啡因模式已关闭".into()
            },
            action_error: self.action_error.clone(),
        }
    }

    fn expiry(&self) -> Option<CaffeineExpiry> {
        self.expires_at.map(|expires_at| CaffeineExpiry {
            generation: self.generation,
            expires_at,
        })
    }
}

pub struct CaffeineState {
    expiry_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    session: Mutex<CaffeineSession>,
    backend_failed: AtomicBool,
    #[cfg(target_os = "macos")]
    process: Mutex<Option<Child>>,
}

impl Default for CaffeineState {
    fn default() -> Self {
        Self::new()
    }
}

impl CaffeineState {
    pub fn diagnostic_health(
        &self,
    ) -> Result<
        super::diagnostics::contracts::HealthSnapshot,
        super::diagnostics::contracts::DiagnosticsError,
    > {
        use super::diagnostics::contracts::*;
        let session = self
            .session
            .try_lock()
            .map_err(|_| DiagnosticsError::new("unavailable"))?;
        let supported = cfg!(any(target_os = "macos", target_os = "windows"));
        let mut health = HealthSnapshot::state(if !supported {
            HealthState::Unsupported
        } else if self.backend_failed.load(Ordering::Relaxed) {
            HealthState::Degraded
        } else if session.enabled {
            HealthState::Active
        } else {
            HealthState::Ready
        });
        health.metadata.backend = Some(if cfg!(target_os = "macos") {
            Backend::Macos
        } else if cfg!(target_os = "windows") {
            Backend::Windows
        } else {
            Backend::Unsupported
        });
        Ok(health)
    }

    pub fn new() -> Self {
        Self {
            session: Mutex::new(CaffeineSession::default()),
            expiry_task: Mutex::new(None),
            backend_failed: AtomicBool::new(false),
            #[cfg(target_os = "macos")]
            process: Mutex::new(None),
        }
    }

    pub fn install_expiry_task(&self, generation: u64, task: tauri::async_runtime::JoinHandle<()>) {
        let Ok(session) = self.session.lock() else {
            task.abort();
            return;
        };
        if !session.enabled || session.generation != generation {
            task.abort();
            return;
        }
        if let Ok(mut owner) = self.expiry_task.lock() {
            if let Some(previous) = owner.replace(task) {
                previous.abort();
            }
        } else {
            task.abort();
        }
    }

    fn cancel_expiry_task(&self) {
        if let Ok(mut task) = self.expiry_task.lock() {
            if let Some(task) = task.take() {
                task.abort();
            }
        }
    }

    pub fn snapshot(&self) -> Result<CaffeineSnapshot, String> {
        let session = self.session.lock().map_err(|e| e.to_string())?;
        Ok(session.snapshot())
    }

    pub fn record_action_error(&self, action: CaffeineAction, code: CaffeineErrorCode) {
        if let Ok(mut session) = self.session.lock() {
            session.action_error = Some(CaffeineActionError { action, code });
        }
    }

    pub fn set_enabled(
        &self,
        enabled: bool,
        duration_minutes: Option<u64>,
    ) -> Result<CaffeineTransition, String> {
        let mut diagnostic = crate::services::diagnostics::Operation::new(
            Some("zero.awake"),
            if enabled { "enable" } else { "disable" },
        );
        let result = (|| {
            self.backend_failed.store(false, Ordering::Relaxed);
            let mut session = self.session.lock().map_err(|e| e.to_string())?;

            if enabled {
                if !is_allowed_duration_minutes(duration_minutes) {
                    return Err("不支持的咖啡因持续时长".into());
                }

                apply_platform_awake(self, true)?;
                self.cancel_expiry_task();
                session.enable_at(SystemTime::now(), duration_minutes)?;

                return Ok(CaffeineTransition {
                    snapshot: session.snapshot(),
                    expiry: session.expiry(),
                });
            }

            apply_platform_awake(self, false)?;
            self.cancel_expiry_task();
            session.disable();

            Ok(CaffeineTransition {
                snapshot: session.snapshot(),
                expiry: None,
            })
        })();
        diagnostic.finish(&result);
        result
    }

    #[cfg(target_os = "macos")]
    pub fn diagnostic_generation(&self) -> Option<u64> {
        self.session
            .try_lock()
            .ok()
            .filter(|s| s.enabled)
            .map(|s| s.generation)
    }

    #[cfg(target_os = "macos")]
    pub fn observe_owned_backend(&self, generation: u64) -> bool {
        let Ok(session) = self.session.try_lock() else {
            return true;
        };
        if !session.enabled || session.generation != generation {
            return false;
        }
        let Ok(mut process) = self.process.try_lock() else {
            return true;
        };
        let code = match process.as_mut().map(|child| child.try_wait()) {
            Some(Ok(None)) => return true,
            Some(Ok(Some(_))) | None => "backend.child_exited",
            Some(Err(_)) => "backend.monitor_failed",
        };
        self.backend_failed.store(true, Ordering::Relaxed);
        crate::services::diagnostics::record(
            Some("zero.awake"),
            "backend",
            code,
            crate::services::diagnostics::contracts::Outcome::Failed,
            Default::default(),
        );
        false
    }

    pub fn expire_if_current(&self, generation: u64, now: SystemTime) -> Result<bool, String> {
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        if !session.should_expire(generation, now) {
            return Ok(false);
        }

        let result = apply_platform_awake(self, false);
        crate::services::diagnostics::observe(Some("zero.awake"), "expiry", &result);
        result?;
        Ok(session.expire_if_current(generation, now))
    }

    pub fn expiry_delay_if_current(
        &self,
        generation: u64,
        now: SystemTime,
    ) -> Result<Option<Duration>, String> {
        let session = self.session.lock().map_err(|e| e.to_string())?;
        if !session.enabled || session.generation != generation {
            return Ok(None);
        }
        Ok(session.expires_at.and_then(|deadline| {
            deadline
                .duration_since(now)
                .ok()
                .filter(|delay| !delay.is_zero())
        }))
    }
}

impl Drop for CaffeineState {
    fn drop(&mut self) {
        self.cancel_expiry_task();
        #[cfg(target_os = "macos")]
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut child) = process.take() {
                let killed = child.kill();
                crate::services::diagnostics::observe(Some("zero.awake"), "cleanup", &killed);
                let waited = child.wait();
                crate::services::diagnostics::observe(Some("zero.awake"), "cleanup", &waited);
            }
        }
    }
}

fn system_time_to_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}

pub fn is_allowed_duration_minutes(duration_minutes: Option<u64>) -> bool {
    duration_minutes.is_none_or(|minutes| ALLOWED_DURATION_MINUTES.contains(&minutes))
}

fn expires_at_for(
    started_at: SystemTime,
    duration_minutes: Option<u64>,
) -> Result<Option<SystemTime>, String> {
    let Some(minutes) = duration_minutes else {
        return Ok(None);
    };

    let seconds = minutes
        .checked_mul(60)
        .ok_or_else(|| "咖啡因持续时长过长".to_string())?;

    started_at
        .checked_add(Duration::from_secs(seconds))
        .map(Some)
        .ok_or_else(|| "咖啡因结束时间超出范围".to_string())
}

#[cfg(target_os = "macos")]
fn apply_platform_awake(state: &CaffeineState, enabled: bool) -> Result<(), String> {
    let mut diagnostic =
        crate::services::diagnostics::Operation::new(Some("zero.awake"), "backend");
    let result = (|| {
        let mut process = state.process.lock().map_err(|e| e.to_string())?;

        if enabled {
            if process.is_none() {
                let child = std::process::Command::new("caffeinate")
                    .args(["-d", "-i"])
                    .spawn()
                    .map_err(|e| format!("启动 caffeinate 失败: {e}"))?;
                *process = Some(child);
            }
        } else if let Some(child) = process.as_mut() {
            if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                child
                    .kill()
                    .map_err(|e| format!("停止 caffeinate 失败: {e}"))?;
                child
                    .wait()
                    .map_err(|e| format!("等待 caffeinate 退出失败: {e}"))?;
            }
            *process = None;
        }

        Ok(())
    })();
    diagnostic.finish(&result);
    result
}

#[cfg(target_os = "windows")]
fn apply_platform_awake(state: &CaffeineState, enabled: bool) -> Result<(), String> {
    use windows::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };

    unsafe {
        let flags = if enabled {
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        } else {
            ES_CONTINUOUS
        };
        let previous = SetThreadExecutionState(flags);
        let failed = previous.0 == 0;
        state.backend_failed.store(failed, Ordering::Relaxed);
        crate::services::diagnostics::native(
            Some("zero.awake"),
            "backend",
            if failed {
                crate::services::diagnostics::contracts::Outcome::Failed
            } else {
                crate::services::diagnostics::contracts::Outcome::Succeeded
            },
        );
        if failed {
            return Err("Windows 防休眠状态设置失败".into());
        }
    }

    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_platform_awake(_state: &CaffeineState, _enabled: bool) -> Result<(), String> {
    Err("当前平台暂不支持咖啡因模式".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn early_expiry_wake_keeps_a_delay_but_stale_or_due_sessions_do_not() {
        let state = CaffeineState::new();
        let start = UNIX_EPOCH + Duration::from_secs(1000);
        state
            .session
            .lock()
            .unwrap()
            .enable_at(start, Some(5))
            .unwrap();
        let expiry = state.session.lock().unwrap().expiry().unwrap();
        let early = expiry.expires_at - Duration::from_micros(500);
        assert_eq!(
            state
                .expiry_delay_if_current(expiry.generation, early)
                .unwrap(),
            Some(Duration::from_micros(500))
        );
        assert_eq!(
            state
                .expiry_delay_if_current(expiry.generation, expiry.expires_at)
                .unwrap(),
            None
        );
        assert_eq!(
            state
                .expiry_delay_if_current(expiry.generation + 1, early)
                .unwrap(),
            None
        );
        state.session.lock().unwrap().disable();
        assert_eq!(
            state
                .expiry_delay_if_current(expiry.generation, early)
                .unwrap(),
            None
        );
    }

    #[test]
    fn action_error_contract_uses_explicit_wire_names_and_preserves_session() {
        let state = CaffeineState::new();
        state.record_action_error(CaffeineAction::Exit, CaffeineErrorCode::HideFailed);
        let snapshot = state.snapshot().unwrap();
        assert!(!snapshot.enabled);
        assert_eq!(
            serde_json::to_value(snapshot).unwrap()["action_error"],
            serde_json::json!({"action":"exit", "code":"hide_failed"})
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn unexpected_child_exit_is_cached_without_snapshot_probing_or_false_active_health() {
        let state = CaffeineState::new();
        let generation = state
            .session
            .lock()
            .unwrap()
            .enable_at(SystemTime::now(), None)
            .unwrap();
        let mut child = std::process::Command::new("/usr/bin/true").spawn().unwrap();
        child.wait().unwrap();
        *state.process.lock().unwrap() = Some(child);
        assert!(!state.observe_owned_backend(generation));
        assert_eq!(
            state.diagnostic_health().unwrap().state,
            super::super::diagnostics::contracts::HealthState::Degraded
        );
        assert!(!state.observe_owned_backend(generation + 1));
    }

    #[test]
    fn duration_validation_accepts_no_limit_and_supported_presets() {
        assert!(is_allowed_duration_minutes(None));

        for minutes in ALLOWED_DURATION_MINUTES {
            assert!(
                is_allowed_duration_minutes(Some(minutes)),
                "{minutes} minutes should be accepted",
            );
        }
    }

    #[test]
    fn duration_validation_rejects_unsupported_presets() {
        for minutes in [1, 4, 6, 45, 121, 301] {
            assert!(
                !is_allowed_duration_minutes(Some(minutes)),
                "{minutes} minutes should be rejected",
            );
        }
    }

    #[test]
    fn enabling_no_limit_has_no_expiry_metadata() {
        let started_at = UNIX_EPOCH + Duration::from_secs(1_000);
        let mut session = CaffeineSession::default();

        session
            .enable_at(started_at, None)
            .expect("no-limit duration should be valid");

        let snapshot = session.snapshot();
        assert!(snapshot.enabled);
        assert_eq!(snapshot.started_at_ms, Some(1_000_000));
        assert_eq!(snapshot.duration_minutes, None);
        assert_eq!(snapshot.expires_at_ms, None);
    }

    #[test]
    fn finite_duration_sets_expiry_metadata() {
        let started_at = UNIX_EPOCH + Duration::from_secs(1_000);
        let mut session = CaffeineSession::default();

        session
            .enable_at(started_at, Some(10))
            .expect("supported duration should be valid");

        let snapshot = session.snapshot();
        assert!(snapshot.enabled);
        assert_eq!(snapshot.duration_minutes, Some(10));
        assert_eq!(snapshot.expires_at_ms, Some(1_600_000));
    }

    #[test]
    fn matching_expiry_disables_finite_session() {
        let started_at = UNIX_EPOCH + Duration::from_secs(1_000);
        let mut session = CaffeineSession::default();
        let generation = session
            .enable_at(started_at, Some(5))
            .expect("supported duration should be valid");

        assert!(session.expire_if_current(generation, started_at + Duration::from_secs(5 * 60)));

        let snapshot = session.snapshot();
        assert!(!snapshot.enabled);
        assert_eq!(snapshot.started_at_ms, None);
        assert_eq!(snapshot.duration_minutes, None);
        assert_eq!(snapshot.expires_at_ms, None);
    }

    #[test]
    fn stale_expiry_does_not_disable_newer_session() {
        let first_start = UNIX_EPOCH + Duration::from_secs(1_000);
        let second_start = UNIX_EPOCH + Duration::from_secs(1_100);
        let mut session = CaffeineSession::default();
        let old_generation = session
            .enable_at(first_start, Some(5))
            .expect("supported duration should be valid");

        session
            .enable_at(second_start, None)
            .expect("switching to no limit should be valid");

        assert!(
            !session.expire_if_current(old_generation, first_start + Duration::from_secs(5 * 60))
        );

        let snapshot = session.snapshot();
        assert!(snapshot.enabled);
        assert_eq!(snapshot.started_at_ms, Some(1_100_000));
        assert_eq!(snapshot.duration_minutes, None);
        assert_eq!(snapshot.expires_at_ms, None);
    }
}
