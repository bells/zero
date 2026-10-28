use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::SystemTime;

#[cfg(target_os = "macos")]
use std::process::Child;

use super::awake_battery::{AwakeBatteryPolicy, AwakePowerSnapshot, StopReason};
use super::awake_preferences::AwakePreferencesStore;
use super::caffeine_schedule::{CaffeineSchedule, ClockReading, SessionTiming};
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
    PreferencesSaveFailed,
    LowPowerMode,
    PolicyUnavailable,
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
    pub schedule: Option<CaffeineSchedule>,
    pub elapsed_ms: Option<u64>,
    pub remaining_ms: Option<u64>,
    pub battery_threshold_overridden: bool,
    pub protection_unavailable: bool,
    pub last_stop_reason: Option<StopReason>,
    pub message: String,
    pub action_error: Option<CaffeineActionError>,
}

#[derive(Debug, Clone, Default)]
struct CaffeineSession {
    enabled: bool,
    timing: Option<SessionTiming>,
    generation: u64,
    action_error: Option<CaffeineActionError>,
    battery_threshold_overridden: bool,
    protection_unavailable: bool,
    last_stop_reason: Option<StopReason>,
}
impl CaffeineSession {
    fn replace(
        &mut self,
        timing: SessionTiming,
        overridden: bool,
        unavailable: bool,
        apply: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        apply()?;
        self.enable(timing, overridden, unavailable);
        Ok(())
    }
    fn stop(
        &mut self,
        reason: Option<StopReason>,
        apply: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        apply()?;
        self.disable();
        self.last_stop_reason = reason;
        Ok(())
    }

    fn enable(&mut self, timing: SessionTiming, overridden: bool, unavailable: bool) {
        self.generation = self.generation.saturating_add(1);
        self.enabled = true;
        self.timing = Some(timing);
        self.action_error = None;
        self.battery_threshold_overridden = overridden;
        self.protection_unavailable = unavailable;
        self.last_stop_reason = None;
    }
    fn disable(&mut self) {
        self.generation = self.generation.saturating_add(1);
        self.enabled = false;
        self.timing = None;
        self.action_error = None;
        self.battery_threshold_overridden = false;
        self.protection_unavailable = false;
        self.last_stop_reason = None;
    }
    fn snapshot(&self, now: ClockReading) -> CaffeineSnapshot {
        let schedule = self.timing.map(|t| t.schedule);
        CaffeineSnapshot {
            enabled: self.enabled,
            started_at_ms: self.timing.map(|t| t.started.wall_ms),
            duration_minutes: match schedule {
                Some(CaffeineSchedule::Duration { minutes }) => Some(minutes),
                _ => None,
            },
            expires_at_ms: self.timing.and_then(|t| t.expires_at(now)),
            schedule,
            elapsed_ms: self.timing.map(|t| t.elapsed(now)),
            remaining_ms: self.timing.and_then(|t| t.remaining(now)),
            battery_threshold_overridden: self.battery_threshold_overridden,
            protection_unavailable: self.protection_unavailable,
            last_stop_reason: self.last_stop_reason,
            message: if self.enabled {
                "咖啡因模式已开启".into()
            } else {
                "咖啡因模式已关闭".into()
            },
            action_error: self.action_error.clone(),
        }
    }
}

pub struct CaffeineState {
    expiry_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    protection_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    monitor_revision: AtomicU64,
    session: Mutex<CaffeineSession>,
    backend_failed: AtomicBool,
    pub preferences: Mutex<AwakePreferencesStore>,
    pub power_reader: super::awake_battery::PowerReader,
    #[cfg(target_os = "windows")]
    windows_worker: Mutex<Option<WindowsAwakeWorker>>,
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
            protection_task: Mutex::new(None),
            monitor_revision: AtomicU64::new(0),
            backend_failed: AtomicBool::new(false),
            preferences: Mutex::new(AwakePreferencesStore::default()),
            power_reader: super::awake_battery::PowerReader::default(),
            #[cfg(target_os = "windows")]
            windows_worker: Mutex::new(None),
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

    pub fn install_protection_task(
        &self,
        generation: u64,
        revision: u64,
        task: tauri::async_runtime::JoinHandle<()>,
    ) {
        let Ok(session) = self.session.lock() else {
            task.abort();
            return;
        };
        if !session.enabled
            || session.generation != generation
            || self.monitor_revision.load(Ordering::SeqCst) != revision
        {
            task.abort();
            return;
        }
        if let Ok(mut owner) = self.protection_task.lock() {
            if let Some(old) = owner.replace(task) {
                old.abort();
            }
        } else {
            task.abort();
        }
    }
    pub fn begin_protection_monitor(&self) -> u64 {
        self.cancel_protection_task();
        self.monitor_revision.load(Ordering::SeqCst)
    }
    pub fn is_current_monitor(&self, generation: u64, revision: u64) -> bool {
        self.monitor_revision.load(Ordering::SeqCst) == revision
            && self.generation() == Some(generation)
    }
    pub fn cancel_protection_task(&self) {
        self.monitor_revision.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut owner) = self.protection_task.lock() {
            if let Some(old) = owner.take() {
                old.abort();
            }
        }
    }
    fn cancel_expiry_task(&self) {
        if let Ok(mut task) = self.expiry_task.lock() {
            if let Some(task) = task.take() {
                task.abort();
            }
        }
        self.cancel_protection_task();
    }

    pub fn snapshot(&self) -> Result<CaffeineSnapshot, String> {
        let session = self.session.lock().map_err(|e| e.to_string())?;
        Ok(session.snapshot(ClockReading::now()?))
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
    ) -> Result<CaffeineSnapshot, String> {
        if enabled {
            if !is_allowed_duration_minutes(duration_minutes) {
                return Err("invalid_schedule".into());
            }
            let schedule = duration_minutes
                .map(|minutes| CaffeineSchedule::Duration { minutes })
                .unwrap_or(CaffeineSchedule::Unlimited);
            return self.set_schedule(
                schedule,
                AwakeBatteryPolicy::default(),
                &AwakePowerSnapshot::unknown(),
                false,
            );
        }
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        apply_platform_awake(self, false)?;
        self.cancel_expiry_task();
        session.disable();
        Ok(session.snapshot(ClockReading::now()?))
    }

    pub fn set_schedule(
        &self,
        schedule: CaffeineSchedule,
        policy: AwakeBatteryPolicy,
        power: &AwakePowerSnapshot,
        policy_unavailable: bool,
    ) -> Result<CaffeineSnapshot, String> {
        let now = ClockReading::now()?;
        let timing = SessionTiming::new(schedule, now)?;
        if policy.stop_reason(power, true) == Some(StopReason::LowPowerMode) {
            return Err("low_power_mode".into());
        }
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        session.replace(
            timing,
            policy.manual_override(power),
            policy_unavailable || policy.unavailable(power),
            || {
                apply_platform_awake(self, true)?;
                self.cancel_expiry_task();
                Ok(())
            },
        )?;
        if let Some(timing) = session.timing.as_mut() {
            timing.started = ClockReading::now().unwrap_or(now);
        }
        self.backend_failed.store(false, Ordering::Relaxed);
        Ok(session.snapshot(ClockReading::now()?))
    }
    pub fn generation(&self) -> Option<u64> {
        self.session
            .lock()
            .ok()
            .filter(|s| s.enabled)
            .map(|s| s.generation)
    }

    pub fn evaluate(
        &self,
        generation: u64,
        now: ClockReading,
        policy: AwakeBatteryPolicy,
        power: &AwakePowerSnapshot,
        policy_unavailable: bool,
    ) -> Result<bool, String> {
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        if !session.enabled || session.generation != generation {
            return Ok(false);
        }
        session.protection_unavailable = policy_unavailable || policy.unavailable(power);
        let reason = if session.timing.and_then(|t| t.remaining(now)) == Some(0) {
            Some(StopReason::Expired)
        } else {
            policy.stop_reason(power, session.battery_threshold_overridden)
        };
        if let Some(reason) = reason {
            session.stop(Some(reason), || apply_platform_awake(self, false))?;
            // The owner exits its task; external stops cancel via set_enabled.
            return Ok(true);
        }
        Ok(false)
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

    pub fn expire_if_current(&self, generation: u64, _now: SystemTime) -> Result<bool, String> {
        let mut session = self.session.lock().map_err(|_| "session_unavailable")?;
        if !session.enabled || session.generation != generation {
            return Ok(false);
        }
        let now = ClockReading::now()?;
        if session.timing.and_then(|t| t.remaining(now)) != Some(0) {
            return Ok(false);
        }
        session.stop(Some(StopReason::Expired), || {
            apply_platform_awake(self, false)
        })?;
        self.cancel_protection_task();
        Ok(true)
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

pub fn is_allowed_duration_minutes(duration_minutes: Option<u64>) -> bool {
    duration_minutes.is_none_or(|minutes| ALLOWED_DURATION_MINUTES.contains(&minutes))
}

fn apply_platform_awake(state: &CaffeineState, enabled: bool) -> Result<(), String> {
    let mut diagnostic = super::diagnostics::Operation::new(
        Some("zero.awake"),
        if enabled { "enable" } else { "disable" },
    );
    let result = platform_awake(state, enabled);
    state
        .backend_failed
        .store(result.is_err(), Ordering::Relaxed);
    diagnostic.finish(&result);
    result
}

#[cfg(target_os = "macos")]
fn platform_awake(state: &CaffeineState, enabled: bool) -> Result<(), String> {
    let mut diagnostic =
        crate::services::diagnostics::Operation::new(Some("zero.awake"), "backend");
    let result = (|| {
        let mut process = state.process.lock().map_err(|e| e.to_string())?;

        if enabled {
            if let Some(child) = process.as_mut() {
                if child.try_wait().map_err(|_| "backend_failed")?.is_some() {
                    *process = None;
                }
            }
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
struct WindowsAwakeWorker {
    sender: std::sync::mpsc::Sender<(bool, std::sync::mpsc::SyncSender<Result<(), String>>)>,
    thread: Option<std::thread::JoinHandle<()>>,
}
#[cfg(target_os = "windows")]
impl WindowsAwakeWorker {
    fn new() -> Result<Self, String> {
        let (sender, receiver) =
            std::sync::mpsc::channel::<(bool, std::sync::mpsc::SyncSender<Result<(), String>>)>();
        let thread = std::thread::Builder::new()
            .name("zero-awake-owner".into())
            .spawn(move || {
                use windows::Win32::System::Power::{
                    SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
                };
                for (enabled, reply) in receiver {
                    let flags = if enabled {
                        ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
                    } else {
                        ES_CONTINUOUS
                    };
                    let result = if unsafe { SetThreadExecutionState(flags) }.0 == 0 {
                        Err("backend_failed".into())
                    } else {
                        Ok(())
                    };
                    let _ = reply.send(result);
                }
                unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
            })
            .map_err(|_| "backend_failed")?;
        Ok(Self {
            sender,
            thread: Some(thread),
        })
    }
    fn apply(&self, enabled: bool) -> Result<(), String> {
        let (reply, receiver) = std::sync::mpsc::sync_channel(1);
        self.sender
            .send((enabled, reply))
            .map_err(|_| "backend_failed")?;
        receiver.recv().map_err(|_| "backend_failed")?
    }
}
#[cfg(target_os = "windows")]
impl Drop for WindowsAwakeWorker {
    fn drop(&mut self) {
        let (closed, _) = std::sync::mpsc::channel();
        drop(std::mem::replace(&mut self.sender, closed));
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
#[cfg(target_os = "windows")]
fn platform_awake(state: &CaffeineState, enabled: bool) -> Result<(), String> {
    let mut worker = state.windows_worker.lock().map_err(|_| "backend_failed")?;
    if worker.is_none() {
        *worker = Some(WindowsAwakeWorker::new()?);
    }
    worker.as_ref().ok_or("backend_failed")?.apply(enabled)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_awake(_state: &CaffeineState, _enabled: bool) -> Result<(), String> {
    Err("当前平台暂不支持咖啡因模式".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaced_monitor_rejects_workers_in_flight_for_the_same_session() {
        let state = CaffeineState::new();
        let now = ClockReading::now().unwrap();
        state.session.lock().unwrap().enable(
            SessionTiming::new(CaffeineSchedule::Unlimited, now).unwrap(),
            false,
            false,
        );
        let generation = state.generation().unwrap();
        let old = state.begin_protection_monitor();
        assert!(state.is_current_monitor(generation, old));
        let new = state.begin_protection_monitor();
        assert!(!state.is_current_monitor(generation, old));
        assert!(state.is_current_monitor(generation, new));
        state.cancel_protection_task();
        assert!(!state.is_current_monitor(generation, new));
    }
    #[test]
    fn session_replacement_resets_timing_and_clear_stop_reason() {
        let mut session = CaffeineSession::default();
        let start = ClockReading {
            wall_ms: 1_000_000,
            continuous_ms: 100,
        };
        session.enable(
            SessionTiming::new(CaffeineSchedule::Duration { minutes: 45 }, start).unwrap(),
            true,
            false,
        );
        let old = session.generation;
        session.enable(
            SessionTiming::new(CaffeineSchedule::Unlimited, start).unwrap(),
            false,
            false,
        );
        assert_ne!(old, session.generation);
        let snapshot = session.snapshot(start);
        assert_eq!(snapshot.schedule, Some(CaffeineSchedule::Unlimited));
        assert_eq!(snapshot.remaining_ms, None);
        assert!(!snapshot.battery_threshold_overridden);
        session.disable();
        assert!(session.snapshot(start).schedule.is_none());
    }
    #[test]
    fn failed_native_start_or_stop_preserves_current_generation_and_reason() {
        let mut session = CaffeineSession::default();
        let now = ClockReading {
            wall_ms: 1_000_000,
            continuous_ms: 100,
        };
        let first = SessionTiming::new(CaffeineSchedule::Duration { minutes: 45 }, now).unwrap();
        session.enable(first, false, false);
        let generation = session.generation;
        let replacement = SessionTiming::new(CaffeineSchedule::Unlimited, now).unwrap();
        assert!(session
            .replace(replacement, true, false, || Err("denied".into()))
            .is_err());
        assert_eq!(session.generation, generation);
        assert_eq!(session.snapshot(now).duration_minutes, Some(45));
        assert!(session
            .stop(Some(StopReason::LowBattery), || Err("denied".into()))
            .is_err());
        assert!(session.enabled);
        assert_eq!(session.last_stop_reason, None);
        session
            .stop(Some(StopReason::LowBattery), || Ok(()))
            .unwrap();
        assert_eq!(session.last_stop_reason, Some(StopReason::LowBattery));
        assert!(!session.enabled);
        session
            .replace(replacement, false, false, || Ok(()))
            .unwrap();
        assert_eq!(session.last_stop_reason, None);
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn unexpected_child_exit_is_cached_without_snapshot_probing_or_false_active_health() {
        let state = CaffeineState::new();
        let now = ClockReading::now().unwrap();
        state.session.lock().unwrap().enable(
            SessionTiming::new(CaffeineSchedule::Unlimited, now).unwrap(),
            false,
            false,
        );
        let generation = state.generation().unwrap();
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
    fn duration_validation_keeps_legacy_presets() {
        assert!(is_allowed_duration_minutes(None));
        for m in ALLOWED_DURATION_MINUTES {
            assert!(is_allowed_duration_minutes(Some(m)));
        }
        for m in [0, 1, 45, 1440, u64::MAX] {
            assert!(!is_allowed_duration_minutes(Some(m)));
        }
    }
    #[test]
    fn invalid_schedule_and_stale_evaluation_leave_session_untouched() {
        let state = CaffeineState::new();
        assert!(state
            .set_schedule(
                CaffeineSchedule::Duration { minutes: 0 },
                AwakeBatteryPolicy::default(),
                &AwakePowerSnapshot::unknown(),
                false
            )
            .is_err());
        assert!(!state.snapshot().unwrap().enabled);
        assert!(!state
            .evaluate(
                99,
                ClockReading::now().unwrap(),
                AwakeBatteryPolicy::default(),
                &AwakePowerSnapshot::unknown(),
                false
            )
            .unwrap());
    }
}
