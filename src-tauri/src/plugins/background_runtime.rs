//! Host-owned execution lifetime; no package calendar, retry policy or tool IDs.
use super::{
    protocol::PluginError,
    scheduler::{Occurrence, Owner, Prepared, Published, Scheduler, SchedulerError},
    session::error,
};
use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Clone)]
struct Worker {
    occurrence: Occurrence,
    label: String,
    started_ms: u64,
    committed: bool,
}
#[derive(Default)]
struct Workers {
    active: HashMap<String, Worker>,
}
impl Workers {
    fn reserve(&mut self, worker: Worker, clock: Result<u64, String>) -> Result<(), PluginError> {
        let now = clock.map_err(|_| error("background.clock"))?;
        if now
            .checked_sub(worker.started_ms)
            .is_none_or(|n| n >= 60_000)
        {
            return Err(error("background.timeout"));
        }
        if self.active.len() >= 4
            || self.active.contains_key(&worker.label)
            || self
                .active
                .values()
                .any(|w| w.occurrence.owner.plugin_id == worker.occurrence.owner.plugin_id)
        {
            return Err(error("background.quota"));
        }
        self.active.insert(worker.label.clone(), worker);
        Ok(())
    }
    fn publish_completion<'a, T>(
        &mut self,
        label: &str,
        occurrence: &Occurrence,
        clock: Result<u64, String>,
        prepared: &mut Prepared<'a, T>,
    ) -> Result<Published<'a, T>, PluginError> {
        let worker = self
            .active
            .get_mut(label)
            .ok_or_else(|| error("background.stale"))?;
        let now = clock.map_err(|_| error("background.clock"))?;
        if worker.committed
            || worker.occurrence != *occurrence
            || now
                .checked_sub(worker.started_ms)
                .is_none_or(|elapsed| elapsed >= 60_000)
        {
            return Err(error("background.timeout"));
        }
        let published = prepared.publish().map_err(publish_error)?;
        // Publication commits the receipt, not the native session lifetime.
        // Keep quota/watchdog tracking until close has aborted owned IO; cleanup
        // must never interrupt an already committed next generation.
        worker.committed = true;
        Ok(published)
    }
    fn closed(&mut self, label: &str) -> Option<Occurrence> {
        self.active
            .remove(label)
            .filter(|worker| !worker.committed)
            .map(|worker| worker.occurrence)
    }
    fn expired(&self, clock: Result<u64, String>) -> Vec<String> {
        self.active
            .iter()
            .filter(|(_, worker)| {
                clock
                    .as_ref()
                    .ok()
                    .and_then(|now| now.checked_sub(worker.started_ms))
                    .is_none_or(|n| n >= 60_000)
            })
            .map(|(label, _)| label.clone())
            .collect()
    }
}
#[derive(Default)]
struct Revocations {
    plugins: Mutex<HashSet<String>>,
}
impl Revocations {
    fn revoke(&self, scheduler: Option<&Scheduler>, plugin: &str) -> Result<(), PluginError> {
        self.plugins
            .lock()
            .map_err(|_| error("background.lock"))?
            .insert(plugin.into());
        if let Some(scheduler) = scheduler {
            let snapshot = scheduler
                .snapshot()
                .map_err(|_| error("schedule.revocationFailed"))?;
            let mut owners = Vec::new();
            for (owner, _) in snapshot {
                if owner.plugin_id == plugin && !owners.contains(&owner) {
                    owners.push(owner);
                }
            }
            for owner in owners {
                scheduler
                    .revoke(&owner)
                    .map_err(|_| error("schedule.revocationFailed"))?;
            }
        }
        Ok(())
    }
    fn blocked(&self) -> Result<Vec<String>, PluginError> {
        Ok(self
            .plugins
            .lock()
            .map_err(|_| error("background.lock"))?
            .iter()
            .cloned()
            .collect())
    }
    fn allow(&self, plugin: &str) -> Result<(), PluginError> {
        self.plugins
            .lock()
            .map_err(|_| error("background.lock"))?
            .remove(plugin);
        Ok(())
    }
}
#[derive(Default)]
pub struct BackgroundRuntime {
    store: Mutex<Option<Arc<Scheduler>>>,
    revocations: Revocations,
    workers: Mutex<Workers>,
    wake: tokio::sync::Notify,
    started: AtomicBool,
    stopped: AtomicBool,
}

pub fn scheduled_owner(owner: &super::session::SessionOwner) -> Owner {
    Owner {
        plugin_id: owner.plugin_id.clone(),
        version: owner.version.clone(),
        digest: owner.digest.clone(),
        root: owner.root.clone(),
    }
}
fn store(app: &tauri::AppHandle, create: bool) -> Result<Option<Arc<Scheduler>>, PluginError> {
    let runtime = app.state::<BackgroundRuntime>();
    let path = app
        .state::<super::registry::PluginRegistryState>()
        .read_registry(|r| r.scheduler_path())
        .map_err(|_| error("plugin.unavailable"))?;
    let mut slot = runtime.store.lock().map_err(|_| error("background.lock"))?;
    if let Some(store) = slot.as_ref() {
        return Ok(Some(store.clone()));
    }
    if !create && !path.exists() {
        return Ok(None);
    }
    let scheduler = Arc::new(Scheduler::open(&path).map_err(|_| error("schedule.unavailable"))?);
    *slot = Some(scheduler.clone());
    Ok(Some(scheduler))
}
fn authorized_owner(app: &tauri::AppHandle, occurrence: &Occurrence) -> Result<(), PluginError> {
    if app
        .state::<BackgroundRuntime>()
        .revocations
        .blocked()?
        .contains(&occurrence.owner.plugin_id)
    {
        return Err(error("background.revoked"));
    }
    let surface = format!("background:{}", occurrence.schedule.event_id);
    let live = app
        .state::<super::registry::PluginRegistryState>()
        .read_registry(|r| {
            super::web_runtime::owner_from_registry(r, &occurrence.owner.plugin_id, &surface)
        })
        .map_err(|_| error("plugin.unavailable"))?
        .map_err(|_| error("session.stale"))?;
    if scheduled_owner(&live) != occurrence.owner {
        return Err(error("session.stale"));
    }
    Ok(())
}
pub fn initialize(app: &tauri::AppHandle) {
    if !super::protocol::web_runtime_enabled() {
        return;
    }
    let initialized = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(Some(scheduler)) = store(&initialized, false) {
            if let Ok(snapshot) = scheduler.snapshot() {
                for (owner, schedule) in snapshot {
                    let probe = Occurrence {
                        owner: owner.clone(),
                        schedule,
                        generation: 0,
                        occurrence_id: String::new(),
                        attempt: 0,
                    };
                    if authorized_owner(&initialized, &probe).is_err() {
                        let _ = scheduler.revoke(&owner);
                    }
                }
            }
            start(&initialized);
        }
    });
}
fn start(app: &tauri::AppHandle) {
    let runtime = app.state::<BackgroundRuntime>();
    runtime.wake.notify_one();
    if runtime.started.swap(true, Ordering::SeqCst) || runtime.stopped.load(Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let runtime = app.state::<BackgroundRuntime>();
            let notified = runtime.wake.notified();
            // Register before inspecting state so schedule changes cannot lose a wake.
            tokio::pin!(notified);
            notified.as_mut().enable();
            if runtime.stopped.load(Ordering::SeqCst) {
                break;
            }
            let tick_app = app.clone();
            let wait = tauri::async_runtime::spawn_blocking(move || tick(&tick_app))
                .await
                .unwrap_or(None);
            match wait {
                Some(wait) => {
                    let _ = tokio::time::timeout(wait, &mut notified).await;
                }
                None => notified.await,
            }
        }
    });
}
fn wall_ms() -> Result<u64, PluginError> {
    u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| error("background.clock"))?
            .as_millis(),
    )
    .map_err(|_| error("background.clock"))
}
fn tick(app: &tauri::AppHandle) -> Option<Duration> {
    let runtime = app.state::<BackgroundRuntime>();
    let scheduler = store(app, false).ok()??;
    let expired = runtime
        .workers
        .lock()
        .ok()?
        .expired(crate::services::continuous_clock::now_ms());
    for label in expired {
        destroy(app, &label);
    }
    for _ in 0..4 {
        if runtime.stopped.load(Ordering::SeqCst) {
            return None;
        }
        let mut excluded = {
            let workers = runtime.workers.lock().ok()?;
            if workers.active.len() >= 4 {
                break;
            }
            workers
                .active
                .values()
                .map(|w| w.occurrence.owner.plugin_id.clone())
                .collect::<Vec<_>>()
        };
        excluded.extend(runtime.revocations.blocked().ok()?);
        let occurrence = match scheduler.claim_due_excluding(wall_ms().ok()?, &excluded) {
            Ok(Some(o)) => o,
            Ok(None) => break,
            Err(_) => {
                return if runtime.workers.lock().ok()?.active.is_empty() {
                    None
                } else {
                    Some(Duration::from_millis(200))
                }
            }
        };
        let plugin = occurrence.owner.plugin_id.clone();
        let result = app
            .state::<super::lifecycle::LifecycleCoordinator>()
            .run(&plugin, || {
                authorized_owner(app, &occurrence).map_err(|e| e.code)?;
                super::web_runtime::open_background(app, occurrence.clone()).map_err(|e| e.code)
            });
        if result.is_err() {
            let _ = scheduler.fail(&occurrence);
        }
    }
    let workers = runtime.workers.lock().ok()?;
    let has_workers = !workers.active.is_empty();
    let mut excluded = workers
        .active
        .values()
        .map(|w| w.occurrence.owner.plugin_id.clone())
        .collect::<Vec<_>>();
    excluded.extend(runtime.revocations.blocked().ok()?);
    let quota_full = workers.active.len() >= 4;
    drop(workers); // A journal read may wait on fsync; teardown must retain worker admission.
    let deadline = if quota_full {
        None
    } else {
        scheduler.next_deadline(&excluded).ok()?
    };
    runner_wait(deadline, wall_ms().ok(), has_workers)
}
fn runner_wait(deadline: Option<u64>, wall: Option<u64>, has_workers: bool) -> Option<Duration> {
    let next =
        deadline.map(|at| Duration::from_millis(at.saturating_sub(wall.unwrap_or(at)).max(1)));
    if has_workers {
        Some(next.map_or(Duration::from_millis(200), |d| {
            d.min(Duration::from_millis(200))
        }))
    } else {
        // Tokio uptime can stop during sleep. Only persisted pending work gets
        // this bounded wall-clock guard; an empty store remains notification-only.
        next.map(|wait| wait.min(Duration::from_secs(1)))
    }
}

pub fn reserve(
    app: &tauri::AppHandle,
    occurrence: Occurrence,
    label: String,
    started_ms: u64,
) -> Result<(), PluginError> {
    let runtime = app.state::<BackgroundRuntime>();
    if runtime.stopped.load(Ordering::SeqCst) {
        return Err(error("background.stopped"));
    }
    let result = runtime
        .workers
        .lock()
        .map_err(|_| error("background.lock"))?
        .reserve(
            Worker {
                occurrence,
                label: label.clone(),
                started_ms,
                committed: false,
            },
            crate::services::continuous_clock::now_ms(),
        );
    result?;
    let watchdog_app = app.clone();
    let watchdog_label = label;
    tauri::async_runtime::spawn(async move {
        watch_until_closed(
            || {
                let runtime = watchdog_app.state::<BackgroundRuntime>();
                runtime
                    .workers
                    .lock()
                    .map(|workers| {
                        workers.active.get(&watchdog_label).map(|worker| {
                            crate::services::continuous_clock::now_ms()
                                .ok()
                                .and_then(|now| now.checked_sub(worker.started_ms))
                                .is_none_or(|elapsed| elapsed >= 60_000)
                        })
                    })
                    .unwrap_or(Some(true))
            },
            || destroy(&watchdog_app, &watchdog_label),
        )
        .await;
    });
    Ok(())
}
/// A worker's deadline observer never enters the scheduler or waits for journal
/// I/O. Teardown closes the session/view and aborts requests before offloaded
/// interruption persistence. No observer exists in the empty state.
pub(super) async fn watch_until_closed(
    mut expired: impl FnMut() -> Option<bool>,
    mut cleanup: impl FnMut(),
) {
    loop {
        tokio::time::sleep(Duration::from_millis(200)).await;
        match expired() {
            None => break,
            Some(true) => {
                cleanup();
                break;
            }
            Some(false) => {}
        }
    }
}

pub fn closed(app: &tauri::AppHandle, label: &str) {
    let runtime = app.state::<BackgroundRuntime>();
    let worker = runtime
        .workers
        .lock()
        .ok()
        .and_then(|mut w| w.closed(label));
    if let Some(occurrence) = worker {
        let interrupted_app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Ok(Some(scheduler)) = store(&interrupted_app, false) {
                let _ = scheduler.interrupt(&occurrence);
            }
            interrupted_app
                .state::<BackgroundRuntime>()
                .wake
                .notify_one();
        });
    }
    runtime.wake.notify_one();
}
pub fn destroy(app: &tauri::AppHandle, label: &str) {
    super::web_runtime::close_background(app, label);
    if let Some(window) = app.get_webview_window(label) {
        let _ = crate::services::surface_activity::destroy_surface(&window);
    }
}
fn stop_task(app: &tauri::AppHandle, owner: &Owner, task: Option<&str>) {
    let runtime = app.state::<BackgroundRuntime>();
    let labels = runtime
        .workers
        .lock()
        .map(|workers| {
            workers
                .active
                .iter()
                .filter(|(_, w)| {
                    w.occurrence.owner == *owner
                        && task.is_none_or(|id| w.occurrence.schedule.task_id == id)
                })
                .map(|(label, _)| label.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for label in labels {
        destroy(app, &label);
    }
    runtime.wake.notify_one();
}
/// Fence delivery and cancel ephemeral workers before attempting any journal IO.
pub(crate) fn fence(app: &tauri::AppHandle, plugin: &str) -> Result<(), PluginError> {
    let Some(runtime) = app.try_state::<BackgroundRuntime>() else {
        return Ok(());
    };
    let result = runtime.revocations.revoke(None, plugin);
    let labels = runtime
        .workers
        .lock()
        .map(|workers| {
            workers
                .active
                .iter()
                .filter(|(_, worker)| worker.occurrence.owner.plugin_id == plugin)
                .map(|(label, _)| label.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for label in labels {
        destroy(app, &label);
    }
    runtime.wake.notify_one();
    result
}
pub fn revoke(app: &tauri::AppHandle, plugin: &str) -> Result<(), PluginError> {
    let Some(runtime) = app.try_state::<BackgroundRuntime>() else {
        return Ok(());
    };
    let scheduler = store(app, false).map_err(|_| error("schedule.revocationFailed"))?;
    runtime.revocations.revoke(scheduler.as_deref(), plugin)
}
pub fn shutdown(app: &tauri::AppHandle) {
    let runtime = app.state::<BackgroundRuntime>();
    runtime.stopped.store(true, Ordering::SeqCst);
    runtime.wake.notify_one();
    let labels = runtime
        .workers
        .lock()
        .map(|w| w.active.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    for label in labels {
        destroy(app, &label);
    }
}

fn publish_error(error: SchedulerError) -> PluginError {
    match error {
        SchedulerError::Busy => self::error("schedule.busy"),
        _ => self::error("schedule.stale"),
    }
}
/// Re-stage a conflicting snapshot without replaying package effects. Both
/// staging and bounded retry waits run after final authorization guards drop.
fn publish_with_retry<'a, T>(
    mut prepare: impl FnMut() -> Result<Prepared<'a, T>, SchedulerError>,
    mut authorize: impl FnMut(&mut Prepared<'a, T>) -> Result<Published<'a, T>, PluginError>,
    invalid: &str,
) -> Result<T, PluginError> {
    for attempt in 0..32 {
        let mut prepared = prepare().map_err(|_| error(invalid))?;
        let published = authorize(&mut prepared);
        drop(prepared); // Temporary cleanup must also remain outside authorization.
        match published {
            Ok(published) => return Ok(published.finish()),
            Err(error) if error.code == "schedule.busy" && attempt < 31 => {
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(error) => return Err(error),
        }
    }
    Err(error("schedule.busy"))
}

fn final_commit<T>(
    app: &tauri::AppHandle,
    caller: &str,
    request: &super::protocol::PluginRequest,
    operation: impl FnOnce() -> Result<T, PluginError>,
) -> Result<T, PluginError> {
    app.state::<super::registry::PluginRegistryState>()
        .read_registry(|registry| {
            let state = app.state::<super::web_assets::WebSessions>();
            let sessions = state.0.lock().map_err(|_| error("session.lock"))?;
            let session = sessions.get(&request.session_id, caller, request.generation)?;
            let live = super::web_runtime::owner_from_registry(
                registry,
                &session.owner.plugin_id,
                &session.owner.view_id,
            )
            .map_err(|_| error("session.stale"))?;
            sessions.commit_live(
                caller,
                request,
                &live,
                true,
                std::time::Instant::now(),
                operation,
            )
        })
        .map_err(|_| error("plugin.unavailable"))?
}

pub fn dispatch(
    app: &tauri::AppHandle,
    caller: &str,
    request: &super::protocol::PluginRequest,
    method: super::protocol::PluginMethod,
) -> Result<serde_json::Value, PluginError> {
    use super::protocol::{BackgroundOutcome, PluginMethod};
    let info = app
        .state::<super::web_assets::WebSessions>()
        .0
        .lock()
        .map_err(|_| error("session.lock"))?
        .get(&request.session_id, caller, request.generation)?
        .info
        .clone();
    app.state::<super::lifecycle::LifecycleCoordinator>()
        .run(&info.plugin_id, || {
            let result = (|| {
                if app
                    .state::<BackgroundRuntime>()
                    .stopped
                    .load(Ordering::SeqCst)
                {
                    return Err(error("background.stopped"));
                }
                let (owner, occurrence) = app
                    .state::<super::registry::PluginRegistryState>()
                    .read_registry(|registry| {
                        let live = super::web_runtime::owner_from_registry(
                            registry,
                            &info.plugin_id,
                            &info.surface_id,
                        )
                        .map_err(|_| error("session.stale"))?;
                        let sessions = app.state::<super::web_assets::WebSessions>();
                        let sessions = sessions.0.lock().map_err(|_| error("session.lock"))?;
                        sessions.commit_live(
                            caller,
                            request,
                            &live,
                            true,
                            std::time::Instant::now(),
                            || {
                                let manifest = registry
                                    .records()
                                    .iter()
                                    .find(|r| r.name == live.plugin_id)
                                    .and_then(|r| r.protocol_manifest.as_ref())
                                    .ok_or_else(|| error("session.stale"))?;
                                let background = manifest
                                    .background
                                    .as_ref()
                                    .ok_or_else(|| error("background.unavailable"))?;
                                if !live.permissions.iter().any(|p| p == "background.schedule") {
                                    return Err(error("permission.denied"));
                                }
                                if let PluginMethod::ScheduleUpsert(input) = &method {
                                    if !background.events.contains(&input.event_id) {
                                        return Err(error("background.eventDenied"));
                                    }
                                }
                                let session = sessions.get(
                                    &request.session_id,
                                    caller,
                                    request.generation,
                                )?;
                                let occurrence = match &session.kind {
                                    super::session::SessionKind::Background {
                                        occurrence, ..
                                    } => Some(occurrence.clone()),
                                    _ => None,
                                };
                                Ok((scheduled_owner(&live), occurrence))
                            },
                        )
                    })
                    .map_err(|_| error("plugin.unavailable"))??;
                // The lifecycle gate fences disable/update. Registry/session guards are
                // released before scheduler disk IO or any window operation.
                let scheduler = store(app, true)?.ok_or_else(|| error("schedule.unavailable"))?;
                let value = match method {
                    PluginMethod::ScheduleUpsert(input) => {
                        let task = input.task_id.clone();
                        let generation = publish_with_retry(
                            || {
                                scheduler.prepare_upsert(
                                    &owner,
                                    super::scheduler::Schedule {
                                        task_id: input.task_id.clone(),
                                        event_id: input.event_id.clone(),
                                        next_at_ms: input.next_at_ms,
                                        payload: input.payload.clone(),
                                    },
                                )
                            },
                            |prepared| {
                                final_commit(app, caller, request, || {
                                    prepared.publish().map_err(publish_error)
                                })
                            },
                            "schedule.invalid",
                        )?;
                        app.state::<BackgroundRuntime>()
                            .revocations
                            .allow(&owner.plugin_id)?;
                        stop_task(app, &owner, Some(&task));
                        serde_json::json!({"generation":generation})
                    }
                    PluginMethod::ScheduleCancel(input) => {
                        let cancelled = publish_with_retry(
                            || scheduler.prepare_cancel(&owner, &input.task_id),
                            |prepared| {
                                final_commit(app, caller, request, || {
                                    prepared.publish().map_err(publish_error)
                                })
                            },
                            "schedule.invalid",
                        )?;
                        stop_task(app, &owner, Some(&input.task_id));
                        serde_json::json!({"cancelled":cancelled})
                    }
                    PluginMethod::BackgroundComplete(input) => {
                        let occurrence = occurrence.ok_or_else(|| error("session.kind"))?;
                        let generation = publish_with_retry(
                            || match input.outcome {
                                BackgroundOutcome::Completed => scheduler
                                    .prepare_finish_and_schedule(&occurrence, input.next_at_ms),
                                BackgroundOutcome::Retry => {
                                    let next = input.next_at_ms.ok_or(SchedulerError::Invalid)?;
                                    scheduler
                                        .prepare_defer_retry(&occurrence, next)
                                        .and_then(|p| p.map(|()| Some(occurrence.generation)))
                                }
                                BackgroundOutcome::Failed => {
                                    if input.next_at_ms.is_some() {
                                        return Err(SchedulerError::Invalid);
                                    }
                                    scheduler
                                        .prepare_fail(&occurrence)
                                        .and_then(|p| p.map(|()| None))
                                }
                            },
                            |prepared| {
                                final_commit(app, caller, request, || {
                                    let runtime = app.state::<BackgroundRuntime>();
                                    let mut workers = runtime
                                        .workers
                                        .lock()
                                        .map_err(|_| error("background.lock"))?;
                                    workers.publish_completion(
                                        caller,
                                        &occurrence,
                                        crate::services::continuous_clock::now_ms(),
                                        prepared,
                                    )
                                })
                            },
                            "background.stale",
                        )?;
                        // Persist the receipt/next generation before tearing down its view.
                        destroy(app, caller);
                        serde_json::json!({"generation":generation})
                    }
                    _ => return Err(error("request.invalid")),
                };
                start(app);
                Ok(value)
            })();
            Ok(result)
        })
        .map_err(|_| error("background.unavailable"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn worker(owner: &str, id: &str, started: u64) -> Worker {
        Worker {
            label: id.into(),
            started_ms: started,
            committed: false,
            occurrence: Occurrence {
                owner: Owner {
                    plugin_id: owner.into(),
                    version: "1.0.0".into(),
                    digest: "ab".repeat(32),
                    root: std::env::temp_dir(),
                },
                schedule: super::super::scheduler::Schedule {
                    task_id: id.into(),
                    event_id: "scheduled.test".into(),
                    next_at_ms: 0,
                    payload: serde_json::Value::Null,
                },
                generation: 1,
                occurrence_id: id.into(),
                attempt: 1,
            },
        }
    }
    #[test]
    fn pending_wall_deadlines_are_rechecked_without_waiting_for_monotonic_elapsed_time() {
        // A deadline hours away must be revisited promptly after sleep or a wall jump.
        let wait = runner_wait(Some(3_600_000), Some(0), false).unwrap();
        assert!(
            wait <= Duration::from_secs(1),
            "pending wall-clock recheck took {wait:?}"
        );
        assert_eq!(
            runner_wait(Some(3_600_000), Some(7_200_000), false),
            Some(Duration::from_millis(1))
        );
        assert_eq!(runner_wait(None, Some(7_200_000), false), None);
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "zero-background-wall-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let scheduler = Scheduler::open(&root.join("schedules.json")).unwrap();
        let mut owner = worker("test.wall", "task", 0).occurrence.owner;
        owner.root = root.clone();
        scheduler
            .upsert(
                &owner,
                super::super::scheduler::Schedule {
                    task_id: "task".into(),
                    event_id: "refresh".into(),
                    next_at_ms: 3_600_000,
                    payload: serde_json::Value::Null,
                },
            )
            .unwrap();
        assert!(scheduler.claim_due(0).unwrap().is_none());
        // The next bounded guard samples the advanced wall clock, independently
        // of how much monotonic uptime elapsed during the intervening sleep.
        let occurrence = scheduler.claim_due(7_200_000).unwrap().unwrap();
        assert_eq!(occurrence.schedule.next_at_ms, 3_600_000);
        assert!(scheduler.claim_due(7_200_000).unwrap().is_none());
        scheduler.complete(&occurrence).unwrap();
        assert_eq!(
            runner_wait(
                scheduler.next_deadline(&[]).unwrap(),
                Some(7_200_000),
                false
            ),
            None
        );
        drop(scheduler);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn committed_completion_remains_tracked_through_stalled_directory_sync_and_timeout_cleanup() {
        use super::super::session::{SessionOwner, Sessions};
        use crate::services::network_fetch::NetworkFetchState;
        use std::time::Instant;
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "zero-background-post-sync-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let scheduler = Scheduler::open(&root.join("schedules.json")).unwrap();
        let mut owner = worker("test.finishing", "task", 100).occurrence.owner;
        owner.root = root.clone();
        scheduler
            .upsert(
                &owner,
                super::super::scheduler::Schedule {
                    task_id: "task".into(),
                    event_id: "refresh".into(),
                    next_at_ms: 1,
                    payload: serde_json::Value::Null,
                },
            )
            .unwrap();
        let occurrence = scheduler.claim_due(1).unwrap().unwrap();
        let now = Instant::now();
        let live = SessionOwner {
            plugin_id: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
            view_id: "background:refresh".into(),
            revision: 1,
            permissions: vec!["background.schedule".into(), "network".into()],
        };
        let mut sessions = Sessions::default();
        let info = sessions
            .issue_background(
                live.clone(),
                occurrence.clone(),
                "background.js".into(),
                crate::services::continuous_clock::now_ms().unwrap(),
                now,
            )
            .unwrap();
        let caller = format!("plugin-{}", info.session_id);
        sessions
            .ready(&info.session_id, &caller, info.generation, now)
            .unwrap();
        let request: super::super::protocol::PluginRequest = serde_json::from_value(serde_json::json!({"protocolVersion":"1.0.0","requestId":"complete","sessionId":info.session_id,"generation":info.generation,"method":"background.complete","payload":{"outcome":"completed","nextAtMs":50}})).unwrap();
        sessions.begin(&caller, &request, &live, true, now).unwrap();
        let mut network_request = request.clone();
        network_request.request_id = "network".into();
        network_request.method = "network.fetch".into();
        network_request.payload =
            serde_json::json!({"url":"https://example.com/data","method":"GET"});
        let network = NetworkFetchState::default();
        let admission = network
            .admit(
                &live,
                &network_request,
                vec!["https://example.com".into()],
                now,
            )
            .unwrap();
        let sessions = Mutex::new(sessions);
        let workers = Mutex::new(Workers::default());
        let mut target = worker("test.finishing", &caller, 100);
        target.occurrence = occurrence.clone();
        workers.lock().unwrap().reserve(target, Ok(100)).unwrap();
        for i in 0..3 {
            workers
                .lock()
                .unwrap()
                .reserve(
                    worker(&format!("peer{i}"), &format!("peer{i}"), 100),
                    Ok(100),
                )
                .unwrap();
        }
        let (sync_tx, sync_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let result = std::thread::scope(|scope| {
            let scheduler = &scheduler;
            let workers = &workers;
            let sessions = &sessions;
            let caller = &caller;
            let request = &request;
            let live = &live;
            let occurrence = &occurrence;
            let finishing = scope.spawn(move || {
                super::super::scheduler::SYNC_OBSERVER.with(|slot| {
                    *slot.borrow_mut() = Some(Box::new(move |_| {
                        sync_tx.send(()).unwrap();
                        release_rx.recv().unwrap();
                    }))
                });
                let result = publish_with_retry(
                    || scheduler.prepare_finish_and_schedule(occurrence, Some(50)),
                    |prepared| {
                        sessions.lock().unwrap().commit_live(
                            caller,
                            request,
                            live,
                            true,
                            now,
                            || {
                                workers.lock().unwrap().publish_completion(
                                    caller,
                                    occurrence,
                                    Ok(100),
                                    prepared,
                                )
                            },
                        )
                    },
                    "background.stale",
                );
                super::super::scheduler::SYNC_OBSERVER.with(|slot| *slot.borrow_mut() = None);
                result
            });
            sync_rx.recv_timeout(Duration::from_secs(2)).unwrap();
            // Rename is committed, while its real post-publication sync boundary
            // is still held. The old view/IO lifetime must retain both quotas.
            let tracked = workers.lock().unwrap().active.contains_key(caller);
            let mut global_probe = Workers {
                active: workers.lock().unwrap().active.clone(),
            };
            let global_reserved = global_probe
                .reserve(worker("fifth", "fifth", 100), Ok(100))
                .is_err();
            let mut owner_probe = Workers {
                active: workers.lock().unwrap().active.clone(),
            };
            owner_probe.active.remove("peer0");
            let owner_reserved = owner_probe
                .reserve(worker("test.finishing", "same-owner", 100), Ok(100))
                .is_err();
            let mut cleanup_ran = false;
            let mut interruption = None;
            // Run the same native watcher with a continuous clock advanced to
            // the60s bound. Real session/network cleanup must not wait for fsync.
            tauri::async_runtime::block_on(watch_until_closed(
                || {
                    let workers = workers.lock().unwrap();
                    workers
                        .active
                        .get(caller)
                        .map(|_| workers.expired(Ok(60_100)).contains(caller))
                },
                || {
                    sessions.lock().unwrap().close_window(caller);
                    network.close_window(caller);
                    interruption = workers.lock().unwrap().closed(caller);
                    cleanup_ran = true;
                },
            ));
            let session_closed = sessions
                .lock()
                .unwrap()
                .get(&info.session_id, caller, info.generation)
                .is_err();
            let io_aborted = admission
                .ensure_active()
                .is_err_and(|error| error.code == "request.cancelled");
            let quota_released_after_cleanup = workers
                .lock()
                .unwrap()
                .reserve(worker("replacement", "replacement", 100), Ok(100))
                .is_ok();
            release_tx.send(()).unwrap();
            let generation = finishing.join().unwrap().unwrap().unwrap();
            // The ordinary completion path may also reach teardown after fsync.
            let duplicate_cleanup = workers.lock().unwrap().closed(caller);
            (
                tracked,
                global_reserved,
                owner_reserved,
                cleanup_ran,
                interruption,
                session_closed,
                io_aborted,
                quota_released_after_cleanup,
                generation,
                duplicate_cleanup,
            )
        });
        assert!(
            result.0,
            "committed worker disappeared while directory sync was held"
        );
        assert!(
            result.1 && result.2,
            "finishing worker released quota before cleanup"
        );
        assert!(
            result.3 && result.5 && result.6,
            "watchdog failed to close session and abort IO during sync"
        );
        assert!(
            result.4.is_none(),
            "committed receipt must not be interrupted during teardown"
        );
        assert!(result.7);
        assert!(
            result.9.is_none(),
            "ordinary teardown must remain idempotent"
        );
        assert!(scheduler
            .finish_and_schedule(&occurrence, Some(70))
            .is_err());
        assert!(scheduler.claim_due(49).unwrap().is_none());
        let next = scheduler.claim_due(50).unwrap().unwrap();
        assert_eq!(next.generation, result.8);
        assert_ne!(next.occurrence_id, occurrence.occurrence_id);
        scheduler.complete(&next).unwrap();
        assert!(scheduler.claim_due(100).unwrap().is_none());
        drop(admission);
        drop(scheduler);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn busy_completion_retries_publication_without_replaying_or_losing_next_schedule() {
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "zero-background-retry-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let scheduler = Scheduler::open(&root.join("schedules.json")).unwrap();
        let mut owner = worker("test.owner", "task", 0).occurrence.owner;
        owner.root = root.clone();
        let schedule = super::super::scheduler::Schedule {
            task_id: "task".into(),
            event_id: "refresh".into(),
            next_at_ms: 1,
            payload: serde_json::Value::Null,
        };
        scheduler.upsert(&owner, schedule.clone()).unwrap();
        let occurrence = scheduler.claim_due(1).unwrap().unwrap();
        // The package effect already ran. Only the receipt/next-generation
        // publication is retried when another owner changes the journal.
        let mut first = true;
        let mut peer = owner.clone();
        peer.plugin_id = "test.peer".into();
        let generation = publish_with_retry(
            || scheduler.prepare_finish_and_schedule(&occurrence, Some(50)),
            |prepared| {
                if first {
                    first = false;
                    scheduler.upsert(&peer, schedule.clone()).unwrap();
                }
                prepared.publish().map_err(publish_error)
            },
            "background.stale",
        )
        .unwrap()
        .unwrap();
        assert!(generation > occurrence.generation);
        assert!(scheduler
            .finish_and_schedule(&occurrence, Some(70))
            .is_err());
        let peer_work = scheduler.claim_due(1).unwrap().unwrap();
        assert_eq!(peer_work.owner, peer);
        scheduler.complete(&peer_work).unwrap();
        assert!(scheduler.claim_due(49).unwrap().is_none());
        let next = scheduler.claim_due(50).unwrap().unwrap();
        assert_eq!(next.owner, owner);
        assert_eq!(next.generation, generation);
        assert_ne!(next.occurrence_id, occurrence.occurrence_id);
        scheduler.complete(&next).unwrap();
        assert!(scheduler.claim_due(100).unwrap().is_none());
        drop(scheduler);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_revoke_is_reported_before_mutation_and_fences_old_tasks_until_explicit_reschedule() {
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "zero-bg-revoke-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("schedules.json");
        let scheduler = Scheduler::open(&path).unwrap();
        let mut target = worker("test.owner", "target", 0).occurrence.owner;
        target.root = root.clone();
        let mut peer = target.clone();
        peer.plugin_id = "test.peer".into();
        let schedule = super::super::scheduler::Schedule {
            task_id: "task".into(),
            event_id: "scheduled.test".into(),
            next_at_ms: 1,
            payload: serde_json::Value::Null,
        };
        scheduler.upsert(&target, schedule.clone()).unwrap();
        scheduler.upsert(&peer, schedule.clone()).unwrap();
        let saved = root.join("saved.json");
        std::fs::rename(&path, &saved).unwrap();
        std::fs::create_dir(&path).unwrap();
        let fences = Revocations::default();
        let mut enabled = true;
        let result = fences
            .revoke(Some(&scheduler), "test.owner")
            .map(|()| enabled = false);
        assert!(result.is_err());
        assert!(
            enabled,
            "failed revocation must not claim successful disable"
        );
        std::fs::remove_dir(&path).unwrap();
        std::fs::rename(saved, &path).unwrap();
        let blocked = fences.blocked().unwrap();
        assert!(blocked.contains(&target.plugin_id));
        let delivered = scheduler.claim_due_excluding(2, &blocked).unwrap().unwrap();
        assert_eq!(delivered.owner, peer);
        scheduler.complete(&delivered).unwrap();
        // Re-enable has no implicit fence-removal path. Only a fresh native-authorized
        // reschedule may replace the old generation and reauthorize wake delivery.
        assert_eq!(
            scheduler.next_deadline(&fences.blocked().unwrap()).unwrap(),
            None
        );
        scheduler.upsert(&target, schedule).unwrap();
        fences.allow("test.owner").unwrap();
        assert_eq!(
            scheduler
                .claim_due_excluding(2, &fences.blocked().unwrap())
                .unwrap()
                .unwrap()
                .owner,
            target
        );
        drop(scheduler);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn worker_quota_is_global_and_per_owner_and_cleanup_releases_it() {
        let mut workers = Workers::default();
        for index in 0..4 {
            workers
                .reserve(
                    worker(&format!("owner{index}"), &format!("s{index}"), 100),
                    Ok(100),
                )
                .unwrap();
        }
        assert!(workers
            .reserve(worker("peer", "fifth", 100), Ok(100))
            .is_err());
        assert_eq!(workers.closed("s0").unwrap().owner.plugin_id, "owner0");
        assert!(workers
            .reserve(worker("owner1", "same-owner", 100), Ok(100))
            .is_err());
        workers
            .reserve(worker("peer", "replacement", 100), Ok(100))
            .unwrap();
        assert_eq!(workers.active.len(), 4);
    }
    #[test]
    fn watchdog_is_suspend_inclusive_and_clock_failure_is_closed() {
        let mut workers = Workers::default();
        workers
            .reserve(worker("owner", "s1", 100), Ok(100))
            .unwrap();
        assert!(workers.expired(Ok(60099)).is_empty());
        assert_eq!(workers.expired(Ok(60100)), vec!["s1"]);
        assert_eq!(workers.expired(Err("unavailable".into())), vec!["s1"]);
        assert_eq!(workers.expired(Ok(99)), vec!["s1"]);
        assert!(Workers::default()
            .expired(Err("unavailable".into()))
            .is_empty());
    }
}
