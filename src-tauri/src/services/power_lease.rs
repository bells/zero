//! Host-owned power leases. Tool policy and UI are deliberately outside this provider.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::power_snapshot::{AwakeBatteryPolicy, AwakePowerSnapshot, PowerReader};
use crate::plugins::protocol::{PluginError, PluginRequest, PowerAcquireInput, PowerReleaseInput};
use crate::plugins::protocol::{
    PowerStartTaskInput, PowerStopTaskInput, PowerTaskConditions, PowerTaskSchedule,
    PowerUpdateTaskConditionsInput,
};
use crate::plugins::session::{error, SessionOwner};
use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Eq, Hash)]
struct NativeOwner {
    plugin_id: String,
    version: String,
    digest: String,
    root: PathBuf,
}
impl From<&SessionOwner> for NativeOwner {
    fn from(owner: &SessionOwner) -> Self {
        Self {
            plugin_id: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
        }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerLeaseInfo {
    pub lease_id: String,
    pub generation: u64,
    pub expires_at_ms: Option<u64>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PowerLeaseStatus {
    pub leases: Vec<PowerLeaseInfo>,
}

trait PowerGuard: Send {
    fn alive(&mut self) -> bool {
        true
    }
}
impl PowerGuard for () {}

trait LeaseClock: Send + Sync {
    fn wall_ms(&self) -> Result<u64, PluginError>;
    fn continuous_ms(&self) -> Result<u64, PluginError>;
}
struct SystemLeaseClock;
impl LeaseClock for SystemLeaseClock {
    fn wall_ms(&self) -> Result<u64, PluginError> {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| error("power.clock"))?
            .as_millis()
            .try_into()
            .map_err(|_| error("power.clock"))
    }
    fn continuous_ms(&self) -> Result<u64, PluginError> {
        super::continuous_clock::now_ms().map_err(|_| error("power.clock"))
    }
}

struct WorkerPermit(Arc<AtomicUsize>);
impl WorkerPermit {
    fn new(counter: Arc<AtomicUsize>) -> Self {
        counter.fetch_add(1, Ordering::SeqCst);
        Self(counter)
    }
}
impl Drop for WorkerPermit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

struct LeaseWorker {
    continuous_start: u64,
    cancel: mpsc::Sender<()>,
    task: Option<JoinHandle<()>>,
}
impl Drop for LeaseWorker {
    fn drop(&mut self) {
        let _ = self.cancel.send(());
        if let Some(task) = self.task.take() {
            let _ = task.join();
        }
    }
}
impl LeaseWorker {
    fn start_with<G: PowerGuard + 'static>(
        duration: Option<Duration>,
        clock: Arc<dyn LeaseClock>,
        permit: WorkerPermit,
        start: impl FnOnce() -> Result<G, PluginError> + Send + 'static,
    ) -> Result<Self, PluginError> {
        Self::start_monitored(duration, clock, permit, start, |_| true)
    }
    fn start_monitored<G: PowerGuard + 'static>(
        duration: Option<Duration>,
        clock: Arc<dyn LeaseClock>,
        permit: WorkerPermit,
        start: impl FnOnce() -> Result<G, PluginError> + Send + 'static,
        mut keep_alive: impl FnMut(u64) -> bool + Send + 'static,
    ) -> Result<Self, PluginError> {
        let (cancel, receiver) = mpsc::channel();
        let (reply, started) = mpsc::sync_channel(1);
        let task = std::thread::Builder::new()
            .name("zero-power-lease".into())
            .spawn(move || {
                let _permit = permit;
                let mut guard = match start() {
                    Ok(guard) => guard,
                    Err(error) => {
                        let _ = reply.send(Err(error));
                        return;
                    }
                };
                let started_clock = match clock.continuous_ms() {
                    Ok(now) => now,
                    Err(error) => {
                        let _ = reply.send(Err(error));
                        return;
                    }
                };
                let deadline = match duration {
                    Some(duration) => {
                        match started_clock.checked_add(duration.as_millis() as u64) {
                            Some(deadline) => Some(deadline),
                            None => {
                                let _ = reply.send(Err(error("power.clock")));
                                return;
                            }
                        }
                    }
                    None => None,
                };
                if reply.send(Ok(started_clock)).is_err() {
                    return;
                }
                loop {
                    if !guard.alive() || !keep_alive(started_clock) {
                        break;
                    }
                    let wait = match deadline {
                        Some(deadline) => match clock.continuous_ms() {
                            Ok(now) if now < deadline => Duration::from_millis(deadline - now)
                                .min(Duration::from_millis(250)),
                            _ => break,
                        },
                        None => Duration::from_millis(250),
                    };
                    match receiver.recv_timeout(wait) {
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        _ => break,
                    }
                }
                drop(guard);
            })
            .map_err(|_| error("power.backendFailed"))?;
        match started.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(continuous_start)) => Ok(Self {
                continuous_start,
                cancel,
                task: Some(task),
            }),
            Ok(Err(error)) => {
                let _ = task.join();
                Err(error)
            }
            Err(_) => {
                // The OS startup call itself cannot be interrupted. Abandon its reply,
                // so a late guard is immediately dropped on the owning thread.
                drop(started);
                let _ = cancel.send(());
                drop(task);
                Err(error("power.backendTimeout"))
            }
        }
    }

    fn finished(&self) -> bool {
        self.task.as_ref().is_none_or(JoinHandle::is_finished)
    }
}
struct Lease {
    info: PowerLeaseInfo,
    owner: NativeOwner,
    request_id: String,
    session_id: String,
    session_generation: u64,
    worker: LeaseWorker,
}
pub struct PowerLeaseState {
    leases: Mutex<LeaseStore>,
    clock: Arc<dyn LeaseClock>,
    reader: Arc<PowerReader>,
}
impl Default for PowerLeaseState {
    fn default() -> Self {
        Self {
            leases: Mutex::default(),
            clock: Arc::new(SystemLeaseClock),
            reader: Arc::new(PowerReader::default()),
        }
    }
}
#[derive(Default)]
struct LeaseStore {
    generation: u64,
    leases: HashMap<String, Lease>,
    workers: HashMap<NativeOwner, Arc<AtomicUsize>>,
    tasks: HashMap<NativeOwner, NativeTask>,
}

impl PowerLeaseState {
    pub fn acquire(
        &self,
        owner: &SessionOwner,
        request: &PluginRequest,
        input: PowerAcquireInput,
    ) -> Result<PowerLeaseInfo, PluginError> {
        self.acquire_with(owner, request, input, platform_guard)
    }
    fn acquire_with<G: PowerGuard + 'static>(
        &self,
        owner: &SessionOwner,
        request: &PluginRequest,
        input: PowerAcquireInput,
        start: impl FnOnce() -> Result<G, PluginError> + Send + 'static,
    ) -> Result<PowerLeaseInfo, PluginError> {
        let duration = match input.duration_minutes {
            Some(minutes @ 1..=10080) => Some(Duration::from_secs(u64::from(minutes) * 60)),
            None => None,
            _ => return Err(error("request.invalid")),
        };
        let mut store = self.leases.lock().map_err(|_| error("power.unavailable"))?;
        store.leases.retain(|_, lease| !lease.worker.finished());
        let native_owner = NativeOwner::from(owner);
        store
            .workers
            .retain(|_, counter| counter.load(Ordering::SeqCst) > 0);
        let total_workers: usize = store
            .workers
            .values()
            .map(|counter| counter.load(Ordering::SeqCst))
            .sum();
        let owner_workers = store
            .workers
            .get(&native_owner)
            .map_or(0, |counter| counter.load(Ordering::SeqCst));
        if total_workers >= 16 || owner_workers >= 4 || store.generation >= 9_007_199_254_740_991 {
            return Err(error("power.limit"));
        }
        let expires_at_ms = duration
            .map(|duration| {
                self.clock
                    .wall_ms()?
                    .checked_add(duration.as_millis() as u64)
                    .filter(|value| *value <= 9_007_199_254_740_991)
                    .ok_or_else(|| error("power.clock"))
            })
            .transpose()?;
        let mut nonce = [0u8; 32];
        getrandom::fill(&mut nonce).map_err(|_| error("power.entropy"))?;
        let lease_id = nonce
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let counter = store
            .workers
            .entry(native_owner.clone())
            .or_default()
            .clone();
        let permit = WorkerPermit::new(counter);
        let worker = LeaseWorker::start_with(duration, Arc::clone(&self.clock), permit, start)?;
        store.generation += 1;
        let info = PowerLeaseInfo {
            lease_id: lease_id.clone(),
            generation: store.generation,
            expires_at_ms,
        };
        store.leases.insert(
            lease_id,
            Lease {
                info: info.clone(),
                owner: native_owner,
                request_id: request.request_id.clone(),
                session_id: request.session_id.clone(),
                session_generation: request.generation,
                worker,
            },
        );
        Ok(info)
    }
    pub fn status(&self, owner: &SessionOwner) -> Result<PowerLeaseStatus, PluginError> {
        let mut store = self.leases.lock().map_err(|_| error("power.unavailable"))?;
        store.leases.retain(|_, lease| !lease.worker.finished());
        let owner = NativeOwner::from(owner);
        let mut leases = store
            .leases
            .values()
            .filter(|lease| lease.owner == owner)
            .map(|lease| lease.info.clone())
            .collect::<Vec<_>>();
        leases.sort_by_key(|lease| lease.generation);
        Ok(PowerLeaseStatus { leases })
    }
    pub fn release(
        &self,
        owner: &SessionOwner,
        input: PowerReleaseInput,
    ) -> Result<(), PluginError> {
        let mut store = self.leases.lock().map_err(|_| error("power.unavailable"))?;
        let lease = store
            .leases
            .get(&input.lease_id)
            .filter(|lease| {
                lease.owner == NativeOwner::from(owner) && lease.info.generation == input.generation
            })
            .ok_or_else(|| error("power.leaseNotFound"))?;
        let id = lease.info.lease_id.clone();
        store.leases.remove(&id);
        Ok(())
    }
    pub fn revoke(&self, plugin: &str) {
        if let Ok(mut store) = self.leases.lock() {
            store
                .leases
                .retain(|_, lease| lease.owner.plugin_id != plugin);
            store.tasks.retain(|owner, _| owner.plugin_id != plugin);
        }
    }
    pub fn shutdown(&self) {
        if let Ok(mut store) = self.leases.lock() {
            store.leases.clear();
            store.tasks.clear();
        }
    }
    pub fn cancel(&self, request: &PluginRequest) {
        if let Ok(mut store) = self.leases.lock() {
            store.tasks.retain(|_, task| {
                !(task.request_id == request.request_id
                    && task.session_id == request.session_id
                    && task.session_generation == request.generation)
            });
            store.leases.retain(|_, lease| {
                !(lease.request_id == request.request_id
                    && lease.session_id == request.session_id
                    && lease.session_generation == request.generation)
            });
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerTaskStatus {
    pub generation: u64,
    pub active: bool,
    pub schedule: PowerTaskSchedule,
    pub conditions: PowerTaskConditions,
    pub conditions_revision: u64,
    pub started_at_ms: u64,
    pub expires_at_ms: Option<u64>,
    pub elapsed_ms: u64,
    pub remaining_ms: Option<u64>,
    pub battery_threshold_overridden: bool,
    pub protection_unavailable: bool,
    pub last_stop_reason: Option<String>,
}
struct NativeTask {
    status: Arc<Mutex<PowerTaskStatus>>,
    continuous_start: u64,
    worker: LeaseWorker,
    request_id: String,
    session_id: String,
    session_generation: u64,
}
fn policy(conditions: &PowerTaskConditions) -> Result<AwakeBatteryPolicy, PluginError> {
    if conditions
        .battery_threshold_percent
        .is_some_and(|n| !(10..=90).contains(&n) || n % 5 != 0)
    {
        return Err(error("request.invalid"));
    }
    Ok(AwakeBatteryPolicy {
        stop_on_low_battery: conditions.battery_threshold_percent.is_some(),
        threshold_percent: conditions.battery_threshold_percent.unwrap_or(10) as u8,
        stop_on_low_power_mode: conditions.stop_on_low_power_mode,
    })
}
fn update_guard(
    status: &mut PowerTaskStatus,
    snapshot: &AwakePowerSnapshot,
) -> Result<(), PluginError> {
    let policy = policy(&status.conditions)?;
    status.protection_unavailable = policy.unavailable(snapshot);
    if let Some(reason) = policy.stop_reason(snapshot, status.battery_threshold_overridden) {
        let code = match reason {
            super::power_snapshot::StopReason::LowBattery => "power.lowBattery",
            _ => "power.lowPowerMode",
        };
        return Err(error(code));
    }
    Ok(())
}
impl PowerLeaseState {
    pub fn read_snapshot(&self) -> AwakePowerSnapshot {
        self.reader.read()
    }
    pub fn start_task(
        &self,
        owner: &SessionOwner,
        request: &PluginRequest,
        input: PowerStartTaskInput,
    ) -> Result<PowerTaskStatus, PluginError> {
        self.start_task_with(owner, request, input, platform_guard)
    }
    fn start_task_with<G: PowerGuard + 'static>(
        &self,
        owner: &SessionOwner,
        request: &PluginRequest,
        input: PowerStartTaskInput,
        start: impl FnOnce() -> Result<G, PluginError> + Send + 'static,
    ) -> Result<PowerTaskStatus, PluginError> {
        if input.expected_generation.is_some() != input.expected_conditions_revision.is_some() {
            return Err(error("request.invalid"));
        }
        let battery_policy = policy(&input.conditions)?;
        let now = self.clock.wall_ms()?;
        let expires_at_ms = match input.schedule {
            PowerTaskSchedule::Unlimited => None,
            PowerTaskSchedule::Duration { minutes: 1..=1440 } => {
                let PowerTaskSchedule::Duration { minutes } = input.schedule else {
                    unreachable!()
                };
                Some(
                    now.checked_add(u64::from(minutes) * 60_000)
                        .ok_or_else(|| error("power.clock"))?,
                )
            }
            PowerTaskSchedule::Until { expires_at_ms }
                if expires_at_ms > now && expires_at_ms - now <= 48 * 60 * 60 * 1000 =>
            {
                Some(expires_at_ms)
            }
            _ => return Err(error("request.invalid")),
        };
        let snapshot = self.reader.read();
        let mut status = PowerTaskStatus {
            generation: 0,
            active: true,
            schedule: input.schedule,
            conditions: input.conditions,
            conditions_revision: 1,
            started_at_ms: now,
            expires_at_ms,
            elapsed_ms: 0,
            remaining_ms: expires_at_ms.map(|n| n - now),
            battery_threshold_overridden: false,
            protection_unavailable: false,
            last_stop_reason: None,
        };
        status.battery_threshold_overridden =
            status.conditions.allow_low_battery_start && battery_policy.manual_override(&snapshot);
        update_guard(&mut status, &snapshot)?;
        let mut store = self.leases.lock().map_err(|_| error("power.unavailable"))?;
        let owner = NativeOwner::from(owner);
        let current = store
            .tasks
            .get(&owner)
            .filter(|t| !t.worker.finished())
            .map(|t| {
                t.status
                    .lock()
                    .map(|s| (s.generation, s.conditions_revision))
            })
            .transpose()
            .map_err(|_| error("power.unavailable"))?;
        if current
            != input
                .expected_generation
                .zip(input.expected_conditions_revision)
        {
            return Err(error("power.taskConflict"));
        }
        store.workers.retain(|_, n| n.load(Ordering::SeqCst) > 0);
        if store
            .workers
            .values()
            .map(|n| n.load(Ordering::SeqCst))
            .sum::<usize>()
            >= 16
            || store
                .workers
                .get(&owner)
                .is_some_and(|n| n.load(Ordering::SeqCst) >= 4)
            || store.generation >= 9_007_199_254_740_991
        {
            return Err(error("power.limit"));
        }
        let counter = store.workers.entry(owner.clone()).or_default().clone();
        status.generation = store.generation + 1;
        let shared = Arc::new(Mutex::new(status.clone()));
        let monitor = shared.clone();
        let clock = self.clock.clone();
        let reader = self.reader.clone();
        let worker = LeaseWorker::start_monitored(
            None,
            self.clock.clone(),
            WorkerPermit::new(counter),
            start,
            move |native_start| {
                let Ok(mut status) = monitor.lock() else {
                    return false;
                };
                let Ok(continuous_now) = clock.continuous_ms() else {
                    status.active = false;
                    status.last_stop_reason = Some("power.clock".into());
                    return false;
                };
                status.elapsed_ms = continuous_now.saturating_sub(native_start);
                status.remaining_ms = match status.schedule {
                    PowerTaskSchedule::Unlimited => None,
                    PowerTaskSchedule::Duration { minutes } => {
                        Some((u64::from(minutes) * 60_000).saturating_sub(status.elapsed_ms))
                    }
                    PowerTaskSchedule::Until { expires_at_ms } => match clock.wall_ms() {
                        Ok(now) => Some(expires_at_ms.saturating_sub(now)),
                        Err(_) => {
                            status.active = false;
                            status.last_stop_reason = Some("power.clock".into());
                            return false;
                        }
                    },
                };
                if status.remaining_ms == Some(0) {
                    status.active = false;
                    status.last_stop_reason = Some("expired".into());
                    return false;
                }
                if let Err(reason) = update_guard(&mut status, &reader.read()) {
                    status.active = false;
                    status.last_stop_reason = Some(reason.code);
                    return false;
                }
                true
            },
        )?;
        let admission = (|| {
            let mut current = shared.lock().map_err(|_| error("power.unavailable"))?;
            let elapsed = self
                .clock
                .continuous_ms()?
                .saturating_sub(worker.continuous_start);
            current.started_at_ms = self.clock.wall_ms()?.saturating_sub(elapsed);
            current.elapsed_ms = elapsed;
            if let PowerTaskSchedule::Duration { minutes } = current.schedule {
                current.expires_at_ms = current
                    .started_at_ms
                    .checked_add(u64::from(minutes) * 60_000);
                current.remaining_ms = Some((u64::from(minutes) * 60_000).saturating_sub(elapsed));
            }
            update_guard(&mut current, &self.reader.read())?;
            if !current.active {
                return Err(error(
                    current
                        .last_stop_reason
                        .as_deref()
                        .unwrap_or("power.backendExited"),
                ));
            }
            if let PowerTaskSchedule::Until { expires_at_ms } = current.schedule {
                if self.clock.wall_ms()? >= expires_at_ms {
                    return Err(error("power.expired"));
                }
            }
            if worker.finished() {
                return Err(error("power.backendExited"));
            }
            Ok(current.clone())
        })();
        let status = admission?;
        store.generation += 1;
        // The candidate is ready before the previous guard is dropped.
        let continuous_start = worker.continuous_start;
        store.tasks.insert(
            owner,
            NativeTask {
                status: shared,
                continuous_start,
                worker,
                request_id: request.request_id.clone(),
                session_id: request.session_id.clone(),
                session_generation: request.generation,
            },
        );
        Ok(status)
    }
    pub fn task_status(
        &self,
        owner: &SessionOwner,
    ) -> Result<Option<PowerTaskStatus>, PluginError> {
        let store = self.leases.lock().map_err(|_| error("power.unavailable"))?;
        store
            .tasks
            .get(&NativeOwner::from(owner))
            .map(|task| {
                let mut status = task
                    .status
                    .lock()
                    .map_err(|_| error("power.unavailable"))?
                    .clone();
                if task.worker.finished() && status.active {
                    status.active = false;
                    status.last_stop_reason = Some("power.backendExited".into());
                }
                if status.active {
                    status.elapsed_ms = self
                        .clock
                        .continuous_ms()?
                        .saturating_sub(task.continuous_start);
                }
                Ok(status)
            })
            .transpose()
    }
    pub fn stop_task(
        &self,
        owner: &SessionOwner,
        input: PowerStopTaskInput,
    ) -> Result<(), PluginError> {
        let mut store = self.leases.lock().map_err(|_| error("power.unavailable"))?;
        let task = store
            .tasks
            .get(&NativeOwner::from(owner))
            .ok_or_else(|| error("power.taskNotFound"))?;
        if task
            .status
            .lock()
            .map_err(|_| error("power.unavailable"))?
            .generation
            != input.generation
        {
            return Err(error("power.taskConflict"));
        }
        store.tasks.remove(&NativeOwner::from(owner));
        Ok(())
    }
    pub fn update_task_conditions(
        &self,
        owner: &SessionOwner,
        input: PowerUpdateTaskConditionsInput,
    ) -> Result<PowerTaskStatus, PluginError> {
        policy(&input.conditions)?;
        let snapshot = self.reader.read();
        let mut store = self.leases.lock().map_err(|_| error("power.unavailable"))?;
        let task = store
            .tasks
            .get_mut(&NativeOwner::from(owner))
            .ok_or_else(|| error("power.taskNotFound"))?;
        let mut status = task.status.lock().map_err(|_| error("power.unavailable"))?;
        if status.generation != input.generation
            || status.conditions_revision != input.expected_conditions_revision
        {
            return Err(error("power.taskConflict"));
        }
        if status.conditions_revision >= 9_007_199_254_740_991 {
            return Err(error("power.limit"));
        }
        status.conditions_revision += 1;
        status.conditions = input.conditions;
        status.battery_threshold_overridden = false;
        let must_stop = if status.active {
            match update_guard(&mut status, &snapshot) {
                Err(reason) => {
                    status.active = false;
                    status.last_stop_reason = Some(reason.code);
                    true
                }
                Ok(()) => false,
            }
        } else {
            false
        };
        let result = status.clone();
        drop(status);
        if must_stop {
            let _ = task.worker.cancel.send(());
            if let Some(thread) = task.worker.task.take() {
                let _ = thread.join();
            }
        }
        Ok(result)
    }
}

#[cfg(target_os = "macos")]
struct PlatformGuard(std::process::Child);
#[cfg(target_os = "macos")]
impl PowerGuard for PlatformGuard {
    fn alive(&mut self) -> bool {
        matches!(self.0.try_wait(), Ok(None))
    }
}
#[cfg(target_os = "macos")]
impl Drop for PlatformGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
#[cfg(target_os = "macos")]
fn platform_guard() -> Result<PlatformGuard, PluginError> {
    std::process::Command::new("/usr/bin/caffeinate")
        .args(["-d", "-i", "-w", &std::process::id().to_string()])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(PlatformGuard)
        .map_err(|_| error("power.backendFailed"))
}
#[cfg(target_os = "windows")]
struct PlatformGuard;
#[cfg(target_os = "windows")]
impl PowerGuard for PlatformGuard {}
#[cfg(target_os = "windows")]
impl Drop for PlatformGuard {
    fn drop(&mut self) {
        use windows::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};
        unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
    }
}
#[cfg(target_os = "windows")]
fn platform_guard() -> Result<PlatformGuard, PluginError> {
    use windows::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };
    if unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED) }
        .0
        == 0
    {
        return Err(error("power.backendFailed"));
    }
    Ok(PlatformGuard)
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_guard() -> Result<(), PluginError> {
    Err(error("platform.unsupported"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    fn permit() -> WorkerPermit {
        WorkerPermit::new(Arc::new(AtomicUsize::new(0)))
    }
    struct Guard(Arc<AtomicUsize>);
    impl PowerGuard for Guard {}
    impl Drop for Guard {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }
    fn owner(id: &str) -> SessionOwner {
        SessionOwner {
            plugin_id: id.into(),
            version: "0.1.0".into(),
            digest: "ab".repeat(32),
            root: PathBuf::from(format!("/test/{id}")),
            view_id: format!("{id}.main"),
            revision: 1,
            permissions: vec!["power.preventSleep".into()],
        }
    }
    fn request(id: &str) -> PluginRequest {
        PluginRequest {
            protocol_version: "1.0.0".into(),
            request_id: id.into(),
            session_id: "session-one".into(),
            generation: 1,
            method: "power.acquire".into(),
            payload: serde_json::json!({"durationMinutes":null}),
        }
    }
    #[test]
    fn guarded_tasks_replace_atomically_and_keep_native_ownership() {
        let state = PowerLeaseState::default();
        let a = owner("zero.awake");
        let input = |generation| PowerStartTaskInput {
            expected_generation: generation,
            expected_conditions_revision: generation.map(|_| 1),
            schedule: PowerTaskSchedule::Duration { minutes: 30 },
            conditions: PowerTaskConditions {
                battery_threshold_percent: Some(10),
                stop_on_low_power_mode: true,
                allow_low_battery_start: false,
            },
        };
        let drops = Arc::new(AtomicUsize::new(0));
        let first = state
            .start_task_with(&a, &request("first"), input(None), {
                let drops = drops.clone();
                move || Ok(Guard(drops))
            })
            .unwrap();
        assert!(first.active);
        assert_eq!(
            state
                .start_task_with::<Guard>(
                    &a,
                    &request("bad"),
                    input(Some(first.generation)),
                    || Err(error("power.backendFailed"))
                )
                .unwrap_err()
                .code,
            "power.backendFailed"
        );
        assert_eq!(
            state.task_status(&a).unwrap().unwrap().generation,
            first.generation
        );
        assert_eq!(drops.load(Ordering::SeqCst), 0);
        assert_eq!(
            state
                .start_task_with::<Guard>(&a, &request("stale"), input(None), || Err(error(
                    "not.reached"
                )))
                .unwrap_err()
                .code,
            "power.taskConflict"
        );
        let second = state
            .start_task_with(&a, &request("second"), input(Some(first.generation)), {
                let drops = drops.clone();
                move || Ok(Guard(drops))
            })
            .unwrap();
        assert!(second.generation > first.generation);
        assert_eq!(drops.load(Ordering::SeqCst), 1);
        assert!(state.task_status(&owner("test.peer")).unwrap().is_none());
        state.revoke("zero.awake");
        assert_eq!(drops.load(Ordering::SeqCst), 2);
        assert!(state.task_status(&a).unwrap().is_none());
    }
    #[test]
    fn guarded_task_battery_decisions_preserve_existing_task_and_stop_without_ui() {
        use super::super::power_snapshot::{PowerCapability, PowerSource};
        static LEVEL: AtomicUsize = AtomicUsize::new(100);
        fn snapshot() -> AwakePowerSnapshot {
            let value = LEVEL.load(Ordering::SeqCst);
            AwakePowerSnapshot {
                source: PowerSource::Battery,
                battery: PowerCapability::Supported,
                battery_percent: Some(value.min(100) as u8),
                low_power_mode_capability: PowerCapability::Supported,
                low_power_mode: Some(value == 101),
            }
        }
        let state = PowerLeaseState {
            reader: Arc::new(PowerReader::testing(snapshot)),
            ..Default::default()
        };
        let a = owner("test.battery");
        let input = |generation, allow| PowerStartTaskInput {
            expected_generation: generation,
            expected_conditions_revision: generation.map(|_| 1),
            schedule: PowerTaskSchedule::Unlimited,
            conditions: PowerTaskConditions {
                battery_threshold_percent: Some(10),
                stop_on_low_power_mode: true,
                allow_low_battery_start: allow,
            },
        };
        let mut initial = input(None, false);
        initial.conditions.battery_threshold_percent = None;
        let first = state
            .start_task_with(&a, &request("battery1"), initial, || Ok(()))
            .unwrap();
        LEVEL.store(5, Ordering::SeqCst);
        assert_eq!(
            state
                .start_task_with::<()>(
                    &a,
                    &request("blocked"),
                    input(Some(first.generation), false),
                    || panic!("battery denial must precede acquisition")
                )
                .unwrap_err()
                .code,
            "power.lowBattery"
        );
        assert_eq!(
            state.task_status(&a).unwrap().unwrap().generation,
            first.generation
        );
        let override_task = state
            .start_task_with(
                &a,
                &request("override"),
                input(Some(first.generation), true),
                || Ok(()),
            )
            .unwrap();
        assert!(override_task.battery_threshold_overridden);
        LEVEL.store(101, Ordering::SeqCst);
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        loop {
            let status = state.task_status(&a).unwrap().unwrap();
            if !status.active {
                assert_eq!(
                    status.last_stop_reason.as_deref(),
                    Some("power.lowPowerMode")
                );
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "low power must stop without UI requests"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        LEVEL.store(100, Ordering::SeqCst);
    }
    #[test]
    fn guarded_task_duration_and_absolute_deadline_have_distinct_clocks() {
        use std::sync::atomic::AtomicU64;
        struct Clock {
            wall: AtomicU64,
            continuous: AtomicU64,
        }
        impl LeaseClock for Clock {
            fn wall_ms(&self) -> Result<u64, PluginError> {
                Ok(self.wall.load(Ordering::SeqCst))
            }
            fn continuous_ms(&self) -> Result<u64, PluginError> {
                Ok(self.continuous.load(Ordering::SeqCst))
            }
        }
        let clock = Arc::new(Clock {
            wall: AtomicU64::new(100_000),
            continuous: AtomicU64::new(0),
        });
        let state = PowerLeaseState {
            clock: clock.clone(),
            ..Default::default()
        };
        let a = owner("test.clock");
        let input = |schedule| PowerStartTaskInput {
            expected_generation: None,
            expected_conditions_revision: None,
            schedule,
            conditions: PowerTaskConditions {
                battery_threshold_percent: None,
                stop_on_low_power_mode: false,
                allow_low_battery_start: false,
            },
        };
        state
            .start_task_with(
                &a,
                &request("elapsed"),
                input(PowerTaskSchedule::Duration { minutes: 1 }),
                || Ok(()),
            )
            .unwrap();
        clock.wall.store(1, Ordering::SeqCst);
        clock.continuous.store(60_001, Ordering::SeqCst);
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while state.task_status(&a).unwrap().unwrap().active {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            state
                .task_status(&a)
                .unwrap()
                .unwrap()
                .last_stop_reason
                .as_deref(),
            Some("expired")
        );
        state.revoke(&a.plugin_id);
        clock.wall.store(100_000, Ordering::SeqCst);
        state
            .start_task_with(
                &a,
                &request("until"),
                input(PowerTaskSchedule::Until {
                    expires_at_ms: 101_000,
                }),
                || Ok(()),
            )
            .unwrap();
        clock.wall.store(101_001, Ordering::SeqCst);
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while state.task_status(&a).unwrap().unwrap().active {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            state
                .task_status(&a)
                .unwrap()
                .unwrap()
                .last_stop_reason
                .as_deref(),
            Some("expired")
        );
    }
    #[test]
    fn changing_conditions_enforces_guard_before_returning_authoritative_status() {
        fn low() -> AwakePowerSnapshot {
            use super::super::power_snapshot::{PowerCapability, PowerSource};
            AwakePowerSnapshot {
                source: PowerSource::Battery,
                battery: PowerCapability::Supported,
                battery_percent: Some(5),
                low_power_mode_capability: PowerCapability::Supported,
                low_power_mode: Some(false),
            }
        }
        let state = PowerLeaseState {
            reader: Arc::new(PowerReader::testing(low)),
            ..Default::default()
        };
        let a = owner("test.policychange");
        let drops = Arc::new(AtomicUsize::new(0));
        let task = state
            .start_task_with(
                &a,
                &request("unprotected"),
                PowerStartTaskInput {
                    expected_generation: None,
                    expected_conditions_revision: None,
                    schedule: PowerTaskSchedule::Unlimited,
                    conditions: PowerTaskConditions {
                        battery_threshold_percent: None,
                        stop_on_low_power_mode: false,
                        allow_low_battery_start: false,
                    },
                },
                {
                    let drops = drops.clone();
                    move || Ok(Guard(drops))
                },
            )
            .unwrap();
        let status = state
            .update_task_conditions(
                &a,
                PowerUpdateTaskConditionsInput {
                    generation: task.generation,
                    expected_conditions_revision: task.conditions_revision,
                    conditions: PowerTaskConditions {
                        battery_threshold_percent: Some(10),
                        stop_on_low_power_mode: false,
                        allow_low_battery_start: false,
                    },
                },
            )
            .unwrap();
        assert!(
            !status.active,
            "new protection must be reflected in the returned native status"
        );
        assert_eq!(status.last_stop_reason.as_deref(), Some("power.lowBattery"));
        assert_eq!(
            drops.load(Ordering::SeqCst),
            1,
            "new guard releases owned backend before reply"
        );
    }
    #[test]
    fn battery_change_during_native_start_preserves_previous_task() {
        static LOW: AtomicUsize = AtomicUsize::new(0);
        fn snapshot() -> AwakePowerSnapshot {
            use super::super::power_snapshot::{PowerCapability, PowerSource};
            AwakePowerSnapshot {
                source: PowerSource::Battery,
                battery: PowerCapability::Supported,
                battery_percent: Some(if LOW.load(Ordering::SeqCst) == 0 {
                    100
                } else {
                    5
                }),
                low_power_mode_capability: PowerCapability::Supported,
                low_power_mode: Some(false),
            }
        }
        let state = PowerLeaseState {
            reader: Arc::new(PowerReader::testing(snapshot)),
            ..Default::default()
        };
        let a = owner("test.batteryrace");
        let drops = Arc::new(AtomicUsize::new(0));
        let input = |expected_generation, threshold| PowerStartTaskInput {
            expected_generation,
            expected_conditions_revision: expected_generation.map(|_| 1),
            schedule: PowerTaskSchedule::Unlimited,
            conditions: PowerTaskConditions {
                battery_threshold_percent: threshold,
                stop_on_low_power_mode: false,
                allow_low_battery_start: false,
            },
        };
        let old = state
            .start_task_with(&a, &request("old"), input(None, None), || Ok(()))
            .unwrap();
        let result = state.start_task_with(
            &a,
            &request("candidate"),
            input(Some(old.generation), Some(10)),
            {
                let drops = drops.clone();
                move || {
                    LOW.store(1, Ordering::SeqCst);
                    Ok(Guard(drops))
                }
            },
        );
        assert_eq!(
            result.unwrap_err().code,
            "power.lowBattery",
            "admission must recheck guards after native startup"
        );
        assert_eq!(
            state.task_status(&a).unwrap().unwrap().generation,
            old.generation
        );
        assert_eq!(
            drops.load(Ordering::SeqCst),
            1,
            "failed candidate backend must be released"
        );
    }
    #[test]
    fn guarded_duration_starts_when_native_acquisition_finishes() {
        use std::sync::atomic::AtomicU64;
        struct Clock(AtomicU64);
        impl LeaseClock for Clock {
            fn wall_ms(&self) -> Result<u64, PluginError> {
                Ok(100_000 + self.0.load(Ordering::SeqCst))
            }
            fn continuous_ms(&self) -> Result<u64, PluginError> {
                Ok(self.0.load(Ordering::SeqCst))
            }
        }
        let clock = Arc::new(Clock(AtomicU64::new(0)));
        let state = PowerLeaseState {
            clock: clock.clone(),
            ..Default::default()
        };
        let a = owner("test.durationstart");
        let task = state
            .start_task_with(
                &a,
                &request("durationstart"),
                PowerStartTaskInput {
                    expected_generation: None,
                    expected_conditions_revision: None,
                    schedule: PowerTaskSchedule::Duration { minutes: 1 },
                    conditions: PowerTaskConditions {
                        battery_threshold_percent: None,
                        stop_on_low_power_mode: false,
                        allow_low_battery_start: false,
                    },
                },
                move || {
                    clock.0.store(50_000, Ordering::SeqCst);
                    Ok(())
                },
            )
            .unwrap();
        assert_eq!(
            task.elapsed_ms, 0,
            "OS startup must not consume the requested duration"
        );
        assert_eq!(task.remaining_ms, Some(60_000));
        assert_eq!(task.started_at_ms, 150_000);
        assert_eq!(task.expires_at_ms, Some(210_000));
    }
    #[test]
    fn late_policy_updates_and_replacements_require_current_conditions_revision() {
        let state = PowerLeaseState::default();
        let a = owner("test.policyrevision");
        let conditions = PowerTaskConditions {
            battery_threshold_percent: None,
            stop_on_low_power_mode: false,
            allow_low_battery_start: false,
        };
        let first = state
            .start_task_with(
                &a,
                &request("start"),
                PowerStartTaskInput {
                    expected_generation: None,
                    expected_conditions_revision: None,
                    schedule: PowerTaskSchedule::Unlimited,
                    conditions: conditions.clone(),
                },
                || Ok(()),
            )
            .unwrap();
        let second = state
            .update_task_conditions(
                &a,
                PowerUpdateTaskConditionsInput {
                    generation: first.generation,
                    expected_conditions_revision: first.conditions_revision,
                    conditions: conditions.clone(),
                },
            )
            .unwrap();
        assert_eq!(second.conditions_revision, first.conditions_revision + 1);
        assert_eq!(
            state
                .update_task_conditions(
                    &a,
                    PowerUpdateTaskConditionsInput {
                        generation: first.generation,
                        expected_conditions_revision: first.conditions_revision,
                        conditions: conditions.clone()
                    }
                )
                .unwrap_err()
                .code,
            "power.taskConflict"
        );
        assert_eq!(
            state
                .start_task_with(
                    &a,
                    &request("late-start"),
                    PowerStartTaskInput {
                        expected_generation: Some(first.generation),
                        expected_conditions_revision: Some(first.conditions_revision),
                        schedule: PowerTaskSchedule::Unlimited,
                        conditions
                    },
                    || Ok(())
                )
                .unwrap_err()
                .code,
            "power.taskConflict"
        );
        assert_eq!(
            state.task_status(&a).unwrap().unwrap().conditions_revision,
            second.conditions_revision
        );
    }
    #[test]
    fn owner_identity_isolation_revocation_and_cancel_release_native_resources() {
        let state = PowerLeaseState::default();
        let drops = Arc::new(AtomicUsize::new(0));
        let a = owner("test.a");
        let b = owner("test.b");
        let acquire = |owner: &SessionOwner, id: &str| {
            let drops = drops.clone();
            state
                .acquire_with(
                    owner,
                    &request(id),
                    PowerAcquireInput {
                        duration_minutes: None,
                    },
                    move || Ok(Guard(drops)),
                )
                .unwrap()
        };
        let first = acquire(&a, "r1");
        let mut sessions = crate::plugins::session::Sessions::default();
        let info = sessions
            .issue(a.clone(), std::time::Instant::now())
            .unwrap();
        sessions.close_window(&format!("plugin-{}", info.session_id));
        assert_eq!(state.status(&a).unwrap().leases, vec![first.clone()]);
        let second = acquire(&b, "r2");
        let release = |info: &PowerLeaseInfo| PowerReleaseInput {
            lease_id: info.lease_id.clone(),
            generation: info.generation,
        };
        let mut stale_release = release(&first);
        stale_release.generation += 1;
        assert!(state.release(&a, stale_release).is_err());
        assert_eq!(
            state.release(&b, release(&first)).unwrap_err().code,
            "power.leaseNotFound"
        );
        let mut updated = a.clone();
        updated.digest = "cd".repeat(32);
        assert!(state.status(&updated).unwrap().leases.is_empty());
        assert!(state.release(&updated, release(&first)).is_err());
        let mut fresh = a.clone();
        fresh.view_id = "test.a.other".into();
        fresh.revision = 20;
        assert_eq!(state.status(&fresh).unwrap().leases, vec![first.clone()]);
        state.revoke(&a.plugin_id);
        assert_eq!(drops.load(Ordering::SeqCst), 1);
        assert_eq!(state.status(&b).unwrap().leases, vec![second]);
        let mut wrong = request("r2");
        wrong.generation = 2;
        state.cancel(&wrong);
        assert_eq!(drops.load(Ordering::SeqCst), 1);
        state.cancel(&request("r2"));
        assert_eq!(drops.load(Ordering::SeqCst), 2);
        assert!(state.status(&b).unwrap().leases.is_empty());
    }
    #[test]
    fn expiry_releases_resource_without_a_view_or_polling() {
        let (started, ready) = mpsc::channel();
        let (dropped, done) = mpsc::channel();
        struct Notify(mpsc::Sender<()>);
        impl PowerGuard for Notify {}
        impl Drop for Notify {
            fn drop(&mut self) {
                let _ = self.0.send(());
            }
        }
        let _worker = LeaseWorker::start_with(
            Some(Duration::from_millis(20)),
            Arc::new(SystemLeaseClock),
            permit(),
            move || {
                started.send(()).unwrap();
                Ok(Notify(dropped))
            },
        )
        .unwrap();
        ready
            .recv_timeout(Duration::from_secs(1))
            .expect("native guard started");
        done.recv_timeout(Duration::from_secs(1))
            .expect("native guard expired without UI");
    }
    #[test]
    fn unexpectedly_exited_backend_releases_owner_without_ui_polling() {
        struct Exited(mpsc::Sender<()>);
        impl PowerGuard for Exited {
            fn alive(&mut self) -> bool {
                false
            }
        }
        impl Drop for Exited {
            fn drop(&mut self) {
                let _ = self.0.send(());
            }
        }
        let (dropped, done) = mpsc::channel();
        let _worker =
            LeaseWorker::start_with(None, Arc::new(SystemLeaseClock), permit(), move || {
                Ok(Exited(dropped))
            })
            .unwrap();
        done.recv_timeout(Duration::from_secs(2))
            .expect("dead native backend must not leave a live lease");
    }
    #[test]
    fn stalled_startup_timeout_returns_before_backend_gate_opens_and_cleans_late_guard() {
        let state = Arc::new(PowerLeaseState::default());
        let worker_state = state.clone();
        let (gate, unblock) = mpsc::channel();
        let (result, completed) = mpsc::channel();
        let (cleanup, released) = mpsc::channel();
        struct LateGuard(mpsc::Sender<()>);
        impl PowerGuard for LateGuard {}
        impl Drop for LateGuard {
            fn drop(&mut self) {
                let _ = self.0.send(());
            }
        }
        let thread = std::thread::spawn(move || {
            let response = worker_state.acquire_with(
                &owner("test.stalled"),
                &request("stalled"),
                PowerAcquireInput {
                    duration_minutes: None,
                },
                move || {
                    unblock.recv().unwrap();
                    Ok(LateGuard(cleanup))
                },
            );
            result.send(response.map_err(|error| error.code)).unwrap();
        });
        let observed = completed.recv_timeout(Duration::from_secs(3));
        gate.send(()).unwrap();
        thread.join().unwrap();
        assert_eq!(
            observed
                .expect("startup deadline must return while backend remains blocked")
                .unwrap_err(),
            "power.backendTimeout"
        );
        released
            .recv_timeout(Duration::from_secs(1))
            .expect("late native resource must be cleaned");
        assert!(state
            .status(&owner("test.stalled"))
            .unwrap()
            .leases
            .is_empty());
    }
    #[test]
    fn duration_expiry_ignores_wall_clock_reversal() {
        use std::sync::atomic::AtomicU64;
        struct Clock {
            wall: AtomicU64,
            continuous: AtomicU64,
        }
        impl LeaseClock for Clock {
            fn wall_ms(&self) -> Result<u64, PluginError> {
                Ok(self.wall.load(Ordering::SeqCst))
            }
            fn continuous_ms(&self) -> Result<u64, PluginError> {
                Ok(self.continuous.load(Ordering::SeqCst))
            }
        }

        struct Notify(mpsc::Sender<()>);
        impl PowerGuard for Notify {}
        impl Drop for Notify {
            fn drop(&mut self) {
                let _ = self.0.send(());
            }
        }
        let clock = Arc::new(Clock {
            wall: AtomicU64::new(100_000),
            continuous: AtomicU64::new(100),
        });
        let (cleanup, released) = mpsc::channel();
        let _worker = LeaseWorker::start_with(
            Some(Duration::from_millis(50)),
            clock.clone(),
            permit(),
            move || Ok(Notify(cleanup)),
        )
        .unwrap();
        clock.wall.store(1, Ordering::SeqCst);
        clock.continuous.store(200, Ordering::SeqCst);
        released
            .recv_timeout(Duration::from_secs(1))
            .expect("duration elapsed despite wall clock reversal");
    }
    #[test]
    fn timed_out_startups_keep_capacity_reserved_until_worker_terminates() {
        let state = PowerLeaseState::default();
        let a = owner("test.stalled-capacity");
        let mut gates = Vec::new();
        let (cleanup, released) = mpsc::channel();
        struct Late(mpsc::Sender<()>);
        impl PowerGuard for Late {}
        impl Drop for Late {
            fn drop(&mut self) {
                let _ = self.0.send(());
            }
        }
        for index in 0..4 {
            let (gate, unblock) = mpsc::channel();
            gates.push(gate);
            let cleanup = cleanup.clone();
            let result = state.acquire_with(
                &a,
                &request(&format!("stalled{index}")),
                PowerAcquireInput {
                    duration_minutes: None,
                },
                move || {
                    unblock.recv().unwrap();
                    Ok(Late(cleanup))
                },
            );
            assert_eq!(result.unwrap_err().code, "power.backendTimeout");
        }
        assert!(state.status(&a).unwrap().leases.is_empty());
        let started = std::time::Instant::now();
        let overflow = state.acquire_with(
            &a,
            &request("overflow"),
            PowerAcquireInput {
                duration_minutes: None,
            },
            || Ok(()),
        );
        for gate in gates {
            gate.send(()).unwrap();
        }
        for _ in 0..4 {
            released.recv_timeout(Duration::from_secs(1)).unwrap();
        }
        assert_eq!(overflow.unwrap_err().code, "power.limit");
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "capacity rejection must not await native startup"
        );
        let deadline = std::time::Instant::now() + Duration::from_secs(1);
        loop {
            match state.acquire_with(
                &a,
                &request("recovered"),
                PowerAcquireInput {
                    duration_minutes: None,
                },
                || Ok(()),
            ) {
                Ok(_) => break,
                Err(error)
                    if error.code == "power.limit" && std::time::Instant::now() < deadline =>
                {
                    std::thread::yield_now()
                }
                Err(error) => panic!("capacity failed to recover: {}", error.code),
            }
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn macos_native_worker_cancels_and_reaps_its_owned_child() {
        let state = PowerLeaseState::default();
        let a = owner("test.native");
        let (pid_sender, pid_receiver) = mpsc::channel();
        state
            .acquire_with(
                &a,
                &request("native"),
                PowerAcquireInput {
                    duration_minutes: None,
                },
                move || {
                    let guard = platform_guard()?;
                    pid_sender.send(guard.0.id()).unwrap();
                    Ok(guard)
                },
            )
            .unwrap();
        let pid = pid_receiver.recv_timeout(Duration::from_secs(1)).unwrap() as i32;
        assert_eq!(
            unsafe { libc::kill(pid, 0) },
            0,
            "owned caffeinate child exists"
        );
        state.revoke(&a.plugin_id);
        assert_eq!(
            unsafe { libc::kill(pid, 0) },
            -1,
            "revocation reaps owned child"
        );
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ESRCH)
        );
    }
    #[test]
    fn invalid_duration_limit_and_backend_failure_leave_no_leases() {
        let state = PowerLeaseState::default();
        let a = owner("test.a");
        for duration in [0, 10081, u32::MAX] {
            assert!(state
                .acquire_with(
                    &a,
                    &request("r"),
                    PowerAcquireInput {
                        duration_minutes: Some(duration)
                    },
                    || -> Result<(), _> { panic!("invalid input must not start native work") }
                )
                .is_err());
        }
        assert!(state
            .acquire_with(
                &a,
                &request("failed"),
                PowerAcquireInput {
                    duration_minutes: None
                },
                || Err::<(), _>(error("power.backendFailed"))
            )
            .is_err());
        assert!(state.status(&a).unwrap().leases.is_empty());
        for n in 0..4 {
            state
                .acquire_with(
                    &a,
                    &request(&format!("r{n}")),
                    PowerAcquireInput {
                        duration_minutes: None,
                    },
                    || Ok(()),
                )
                .unwrap();
        }
        assert_eq!(
            state
                .acquire_with(
                    &a,
                    &request("overflow"),
                    PowerAcquireInput {
                        duration_minutes: None
                    },
                    || Ok(())
                )
                .unwrap_err()
                .code,
            "power.limit"
        );
        state.shutdown();
        assert!(state.status(&a).unwrap().leases.is_empty());
    }
}
