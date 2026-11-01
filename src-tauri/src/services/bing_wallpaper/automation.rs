use super::policy::{market_day, next_midnight, publication_date, retry_seconds};
use super::{
    error, BingWallpaperActionResult, BingWallpaperError, BingWallpaperSnapshot,
    BingWallpaperState, SystemWallpaperSetter, WallpaperSetter,
};
use crate::services::native_resources::write_plugin_file;
use chrono::{DateTime, Utc};
use std::fs;
#[cfg(test)]
use std::path::Path;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex as StdMutex,
};
use tauri::Emitter;
use tokio::sync::{Mutex, Notify};

#[path = "automation_store.rs"]
mod store;
use store::{load, save, Applied, ApplyIntent, Stored};
#[cfg(test)]
use store::{persist, STATE_FILE};
pub use store::{PaperAutomationPhase, PaperRuntimeSnapshot, PaperSettings, PaperSettingsUpdate};
pub const STATE_EVENT: &str = "zero://paper-state-changed";

pub trait PaperClock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}
struct SystemClock;
impl PaperClock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

pub struct PaperAutomation {
    root: PathBuf,
    data: Mutex<Result<Stored, BingWallpaperError>>,
    application_queue: Mutex<()>,
    check_queue: Mutex<()>,
    check_sequence: AtomicU64,
    generation: Arc<AtomicU64>,
    enabled: Arc<AtomicBool>,
    stopping: Arc<AtomicBool>,
    started: AtomicBool,
    explicit_enable: AtomicBool,
    reconcile_requested: AtomicBool,
    pub wake: Notify,
    snapshot: StdMutex<PaperRuntimeSnapshot>,
    app: StdMutex<Option<tauri::AppHandle>>,
    clock: Arc<dyn PaperClock>,
    setter: Arc<dyn WallpaperSetter>,
}
impl PaperAutomation {
    pub fn new(root: PathBuf) -> Self {
        Self::with_clock(root, Arc::new(SystemClock))
    }
    pub fn with_clock(root: PathBuf, clock: Arc<dyn PaperClock>) -> Self {
        Self::with_dependencies(root, clock, Arc::new(SystemWallpaperSetter))
    }
    pub fn with_dependencies(
        root: PathBuf,
        clock: Arc<dyn PaperClock>,
        setter: Arc<dyn WallpaperSetter>,
    ) -> Self {
        let data = load(&root);
        let mut snapshot = PaperRuntimeSnapshot::default();
        match &data {
            Ok(data) => {
                snapshot.phase = if data.pending_intent.is_some() {
                    PaperAutomationPhase::Error
                } else if data.settings.auto_change_daily {
                    PaperAutomationPhase::Idle
                } else {
                    PaperAutomationPhase::Off
                };
                if data.pending_intent.is_some() {
                    snapshot.error = Some(uncertain());
                }
                hydrate(&mut snapshot, data);
            }
            Err(e) => {
                snapshot.phase = PaperAutomationPhase::Error;
                snapshot.error = Some(e.clone());
            }
        }
        Self {
            root,
            data: Mutex::new(data),
            application_queue: Mutex::new(()),
            check_queue: Mutex::new(()),
            check_sequence: AtomicU64::new(0),
            generation: Arc::new(AtomicU64::new(0)),
            enabled: Arc::new(AtomicBool::new(true)),
            stopping: Arc::new(AtomicBool::new(false)),
            started: AtomicBool::new(false),
            explicit_enable: AtomicBool::new(false),
            reconcile_requested: AtomicBool::new(false),
            wake: Notify::new(),
            snapshot: StdMutex::new(snapshot),
            app: StdMutex::new(None),
            clock,
            setter,
        }
    }
    pub fn snapshot(&self) -> PaperRuntimeSnapshot {
        self.snapshot
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    fn publish(&self, update: impl FnOnce(&mut PaperRuntimeSnapshot)) {
        let revision = {
            let mut snapshot = self.snapshot.lock().unwrap_or_else(|e| e.into_inner());
            update(&mut snapshot);
            snapshot.revision = snapshot.revision.wrapping_add(1);
            snapshot.revision
        };
        if let Some(app) = self.app.lock().ok().and_then(|app| app.clone()) {
            let _ = app.emit(STATE_EVENT, serde_json::json!({"revision": revision}));
        }
    }
    pub async fn settings(&self) -> Result<PaperSettings, BingWallpaperError> {
        self.data
            .lock()
            .await
            .as_ref()
            .map(|s| s.settings.clone())
            .map_err(Clone::clone)
    }
    pub async fn update(
        &self,
        input: PaperSettingsUpdate,
    ) -> Result<PaperSettings, BingWallpaperError> {
        let _application = if input.auto_change_daily {
            Some(self.application_queue.lock().await)
        } else {
            None
        };
        let mut guard = self.data.lock().await;
        let data = guard.as_ref().map_err(Clone::clone)?;
        if data.settings.auto_change_daily == input.auto_change_daily {
            return Ok(data.settings.clone());
        }
        let explicit = !data.settings.auto_change_daily && input.auto_change_daily;
        let mut next = data.clone();
        next.settings.auto_change_daily = input.auto_change_daily;
        if explicit {
            if let Some(intent) = &next.pending_intent {
                next.recovery_slot = Some(intent.slot);
            }
            next.pending_intent = None;
            next.manual_override_until = None;
        }
        save(self.root.clone(), next.clone()).await?;
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.explicit_enable.store(explicit, Ordering::SeqCst);
        let settings = next.settings.clone();
        self.publish(|s| {
            hydrate(s, &next);
            s.error = if next.pending_intent.is_some() {
                Some(uncertain())
            } else {
                None
            };
            s.phase = if settings.auto_change_daily {
                PaperAutomationPhase::Idle
            } else {
                PaperAutomationPhase::Off
            };
            s.next_check_at = None;
        });
        *guard = Ok(next);
        self.wake.notify_one();
        Ok(settings)
    }
    async fn record_next_check(&self, delay: Option<u64>) {
        let guard = self.data.lock().await;
        let allowed = self.enabled.load(Ordering::SeqCst)
            && !self.stopping.load(Ordering::SeqCst)
            && guard.as_ref().is_ok_and(|d| d.settings.auto_change_daily);
        self.publish(|s| {
            s.next_check_at = if allowed {
                delay.map(|seconds| {
                    (self.clock.now() + chrono::Duration::seconds(seconds as i64))
                        .min(next_midnight(self.clock.now()))
                        .to_rfc3339()
                })
            } else {
                None
            }
        });
    }
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        self.reconcile_requested.store(enabled, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        if !enabled {
            self.publish(|s| {
                s.phase = PaperAutomationPhase::Off;
                s.next_check_at = None;
            });
        }
        self.wake.notify_one();
    }
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        self.set_enabled(false);
    }
    async fn authorized(&self, generation: u64) -> bool {
        if self.stopping.load(Ordering::SeqCst)
            || !self.enabled.load(Ordering::SeqCst)
            || self.generation.load(Ordering::SeqCst) != generation
        {
            return false;
        }
        self.data
            .lock()
            .await
            .as_ref()
            .is_ok_and(|d| d.settings.auto_change_daily && d.pending_intent.is_none())
    }
    pub fn record_check(&self, snapshot: &BingWallpaperSnapshot) {
        let now = self.clock.now();
        self.publish(|s| {
            s.last_checked_at = Some(now.to_rfc3339());
            if !snapshot.stale {
                s.last_successful_refresh_at = Some(now.to_rfc3339());
            }
            s.latest_available_date = snapshot
                .items
                .first()
                .and_then(|i| publication_date(i.display_date.as_deref(), &i.start_date, now))
                .map(|d| d.to_string());
            // Application/persistence errors remain until an application or explicit setting recovery.
            if snapshot.error.is_some() {
                s.error = snapshot.error.clone();
            } else if s
                .error
                .as_ref()
                .is_some_and(|e| !e.code.starts_with("paper.") && !e.code.starts_with("wallpaper."))
            {
                s.error = None;
            }
        });
    }
    pub async fn check(
        &self,
        owner: &BingWallpaperState,
        force: bool,
        explicit: bool,
    ) -> BingWallpaperSnapshot {
        let observed = self.check_sequence.load(Ordering::SeqCst);
        let _check = self.check_queue.lock().await;
        let joined = self.check_sequence.load(Ordering::SeqCst) != observed;
        let generation = self.generation.load(Ordering::SeqCst);
        let prior = self.snapshot();
        let reuse = !force
            && prior
                .last_successful_refresh_at
                .as_deref()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .is_some_and(|at| {
                    (self.clock.now() - at.with_timezone(&Utc)).num_seconds() >= 0
                        && (self.clock.now() - at.with_timezone(&Utc)).num_seconds() < 300
                });
        self.publish(|s| s.phase = PaperAutomationPhase::Checking);
        let snapshot = if joined {
            owner
                .last_refresh
                .lock()
                .ok()
                .and_then(|s| s.clone())
                .unwrap_or_else(|| owner.snapshot())
        } else if reuse {
            owner.snapshot()
        } else {
            owner.refresh().await
        };
        let result = self
            .maybe_apply(owner, &snapshot, generation, explicit)
            .await;
        self.check_sequence.fetch_add(1, Ordering::SeqCst);
        if let Err(e) = result {
            if e.code == "paper.cancelled" {
                self.set_resting_phase().await;
            } else {
                self.publish(|s| {
                    s.phase = PaperAutomationPhase::Error;
                    s.error = Some(e);
                });
            }
        }
        snapshot
    }
    async fn maybe_apply(
        &self,
        owner: &BingWallpaperState,
        snapshot: &BingWallpaperSnapshot,
        generation: u64,
        explicit: bool,
    ) -> Result<(), BingWallpaperError> {
        if !self.authorized(generation).await {
            self.set_resting_phase().await;
            return Ok(());
        }
        if !snapshot.platform.supported {
            self.publish(|s| s.phase = PaperAutomationPhase::Unsupported);
            return Ok(());
        }
        if let Some(e) = &snapshot.error {
            if snapshot.stale {
                return Err(e.clone());
            }
        }
        let now = self.clock.now();
        let Some(item) = snapshot.items.first() else {
            return Ok(());
        };
        let date = publication_date(item.display_date.as_deref(), &item.start_date, now);
        {
            let guard = self.data.lock().await;
            let data = guard.as_ref().map_err(Clone::clone)?;
            if data.manual_override_until.is_some_and(|until| until > now) {
                self.publish(|s| s.phase = PaperAutomationPhase::PausedForManual);
                return Ok(());
            }
            if date.is_none() || !explicit && date != Some(market_day(now)) {
                self.publish(|s| s.phase = PaperAutomationPhase::RetryWaiting);
                return Ok(());
            }
            if data
                .last_applied
                .as_ref()
                .is_some_and(|last| last.wallpaper_id == item.id)
            {
                self.publish(|s| {
                    s.phase = if date == Some(market_day(now)) {
                        PaperAutomationPhase::Idle
                    } else {
                        PaperAutomationPhase::RetryWaiting
                    }
                });
                return Ok(());
            }
        }
        self.apply(owner, &item.id, Arc::clone(&self.setter), Some(generation))
            .await?;
        if date != Some(market_day(now)) && self.authorized(generation).await {
            self.publish(|s| s.phase = PaperAutomationPhase::RetryWaiting);
        }
        Ok(())
    }
    async fn set_resting_phase(&self) {
        let guard = self.data.lock().await;
        self.publish(|s| match guard.as_ref() {
            Err(e) => {
                s.phase = PaperAutomationPhase::Error;
                s.error = Some(e.clone());
            }
            Ok(d) if d.pending_intent.is_some() => {
                s.phase = PaperAutomationPhase::Error;
                s.error = Some(uncertain());
            }
            Ok(d) => {
                s.phase = if d.settings.auto_change_daily && self.enabled.load(Ordering::SeqCst) {
                    PaperAutomationPhase::Idle
                } else {
                    PaperAutomationPhase::Off
                };
            }
        });
    }
    pub async fn apply(
        &self,
        owner: &BingWallpaperState,
        id: &str,
        setter: Arc<dyn WallpaperSetter>,
        automatic: Option<u64>,
    ) -> Result<BingWallpaperActionResult, BingWallpaperError> {
        if automatic.is_none() {
            self.generation.fetch_add(1, Ordering::SeqCst);
        }
        let _queue = self.application_queue.lock().await;
        let result = self.apply_queued(owner, id, setter, automatic).await;
        if let Err(e) = &result {
            if e.code == "paper.cancelled" {
                self.set_resting_phase().await;
            } else {
                self.publish(|s| {
                    s.phase = PaperAutomationPhase::Error;
                    s.error = Some(e.clone());
                });
            }
        }
        result
    }
    async fn apply_queued(
        &self,
        owner: &BingWallpaperState,
        id: &str,
        setter: Arc<dyn WallpaperSetter>,
        automatic: Option<u64>,
    ) -> Result<BingWallpaperActionResult, BingWallpaperError> {
        if let Some(g) = automatic {
            if !self.authorized(g).await {
                return Err(cancelled());
            }
        }
        {
            let guard = self.data.lock().await;
            let data = guard.as_ref().map_err(Clone::clone)?;
            if data.pending_intent.is_some() {
                return Err(uncertain());
            }
        }
        let item = owner.ensure_cached(id).await?;
        // Pin a validated source while the gallery is locked, before rotation can remove it.
        let slot = {
            let mut guard = self.data.lock().await;
            let data = guard.as_ref().map_err(Clone::clone)?;
            // Three bounded slots leave one safe destination even when a crashed call
            // may have changed the OS reference without updating last_applied.
            let names = ["applied-a.jpg", "applied-b.jpg", "applied-c.jpg"];
            let slot = (0..3).find(|slot| data.last_applied.as_ref().is_none_or(|a| a.slot as usize != *slot)
                && data.pending_intent.as_ref().is_none_or(|i| i.slot as usize != *slot)
                && data.recovery_slot.map(usize::from) != Some(*slot)
                && (data.owned_slots[*slot] || !self.root.join(names[*slot]).exists()))
                .ok_or_else(|| error("paper.applied_conflict", "No safe managed wallpaper copy is available. Existing files were preserved.", false))?;
            if !data.owned_slots[slot] {
                let mut next = data.clone();
                next.owned_slots[slot] = true;
                save(self.root.clone(), next.clone()).await?;
                *guard = Ok(next);
            }
            slot as u8
        };
        let file = ["applied-a.jpg", "applied-b.jpg", "applied-c.jpg"][slot as usize];
        {
            let _cache = owner.refresh_lock.lock().await;
            let root = self.root.clone();
            let source = item.cache_file_name.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let path = super::wallpaper::validate_plugin_image(&root, &source)
                    .map_err(BingWallpaperError::from)?;
                let bytes =
                    fs::read(path).map_err(|e| error("paper.applied_copy", e.to_string(), true))?;
                write_plugin_file(&root, file, &bytes, super::MAX_IMAGE_BYTES)
                    .map_err(BingWallpaperError::from)?;
                Ok::<(), BingWallpaperError>(())
            })
            .await
            .map_err(|_| error("paper.copy_worker", "Wallpaper copy worker stopped.", true))??;
        }
        {
            let mut guard = self.data.lock().await;
            let data = guard.as_ref().map_err(Clone::clone)?;
            if let Some(g) = automatic {
                if !self.enabled.load(Ordering::SeqCst)
                    || self.stopping.load(Ordering::SeqCst)
                    || self.generation.load(Ordering::SeqCst) != g
                    || !data.settings.auto_change_daily
                    || data.pending_intent.is_some()
                    || data
                        .manual_override_until
                        .is_some_and(|t| t > self.clock.now())
                {
                    return Err(cancelled());
                }
                if data
                    .last_applied
                    .as_ref()
                    .is_some_and(|a| a.wallpaper_id == id)
                {
                    return Err(cancelled());
                }
            }
            let mut next = data.clone();
            next.pending_intent = Some(ApplyIntent {
                wallpaper_id: id.into(),
                slot,
            });
            save(self.root.clone(), next.clone()).await?;
            *guard = Ok(next);
        }
        self.publish(|s| {
            s.phase = PaperAutomationPhase::Applying;
            s.error = None;
        });
        let root = self.root.clone();
        // Recheck inside the worker immediately before the OS boundary. The data lock remains
        // free while the native call runs, so disabling cannot block behind system APIs.
        let generation = Arc::clone(&self.generation);
        let enabled = Arc::clone(&self.enabled);
        let stopping = Arc::clone(&self.stopping);
        let native_result = if automatic.is_some_and(|g| {
            self.generation.load(Ordering::SeqCst) != g
                || !self.enabled.load(Ordering::SeqCst)
                || self.stopping.load(Ordering::SeqCst)
        }) {
            Err(cancelled())
        } else {
            tauri::async_runtime::spawn_blocking(move || {
                if !super::platform_capability().supported {
                    return Err(error(
                        "platform_unsupported",
                        "Desktop wallpaper is unavailable on this platform.",
                        false,
                    ));
                }
                let path = super::wallpaper::validate_plugin_image(&root, file)
                    .map_err(BingWallpaperError::from)?;
                if automatic.is_some_and(|g| {
                    generation.load(Ordering::SeqCst) != g
                        || !enabled.load(Ordering::SeqCst)
                        || stopping.load(Ordering::SeqCst)
                }) {
                    return Err(cancelled());
                }
                setter
                    .set_from_path(&path)
                    .map_err(BingWallpaperError::from)?;
                Ok(path)
            })
            .await
            .map_err(|_| {
                error(
                    "wallpaper.worker",
                    "Wallpaper worker stopped; application outcome is uncertain.",
                    false,
                )
            })?
        };
        let now = self.clock.now();
        let date = publication_date(item.display_date.as_deref(), &item.start_date, now);
        let latest = owner
            .snapshot()
            .items
            .first()
            .and_then(|i| publication_date(i.display_date.as_deref(), &i.start_date, now));
        let mut guard = self.data.lock().await;
        let data = guard.as_ref().map_err(Clone::clone)?;
        let mut next = data.clone();
        next.pending_intent = None;
        if native_result.is_ok() {
            next.recovery_slot = None;
            next.last_applied = Some(Applied {
                wallpaper_id: id.into(),
                publication_date: date.map(|d| d.to_string()),
                applied_at: now,
                origin: if automatic.is_some() {
                    "automatic"
                } else {
                    "manual"
                }
                .into(),
                slot,
            });
            if automatic.is_none()
                && next.settings.auto_change_daily
                && (date.is_none()
                    || date.is_some_and(|d| d < market_day(now) || latest.is_some_and(|l| d < l)))
            {
                next.manual_override_until = Some(next_midnight(now));
            }
        }
        if let Err(save_error) = save(self.root.clone(), next.clone()).await {
            // Keep the durable pending intent; restart must not assume exactly-once semantics.
            self.publish(|s| {
                if native_result.is_ok() {
                    hydrate(s, &next);
                }
                s.phase = PaperAutomationPhase::Error;
            });
            return Err(error(
                if native_result.is_ok() {
                    "paper.applied_state_unsaved"
                } else {
                    "paper.outcome_unsaved"
                },
                format!(
                    "{} Safety state could not be saved; automation is blocked. {}",
                    if native_result.is_ok() {
                        "Desktop wallpaper changed."
                    } else {
                        "Wallpaper application failed."
                    },
                    save_error.message
                ),
                false,
            ));
        }
        self.publish(|s| {
            hydrate(s, &next);
            s.phase = if !next.settings.auto_change_daily || !self.enabled.load(Ordering::SeqCst) {
                PaperAutomationPhase::Off
            } else if next.manual_override_until.is_some_and(|t| t > now) {
                PaperAutomationPhase::PausedForManual
            } else {
                PaperAutomationPhase::Idle
            };
        });
        *guard = Ok(next);
        let path = native_result?;
        Ok(BingWallpaperActionResult {
            wallpaper_id: id.into(),
            path: path.to_string_lossy().into_owned(),
            message: "Wallpaper applied.".into(),
        })
    }
}
fn hydrate(snapshot: &mut PaperRuntimeSnapshot, data: &Stored) {
    snapshot.manual_override_until = data.manual_override_until.map(|t| t.to_rfc3339());
    if let Some(a) = &data.last_applied {
        snapshot.last_applied_wallpaper_id = Some(a.wallpaper_id.clone());
        snapshot.last_applied_date = a.publication_date.clone();
        snapshot.last_applied_at = Some(a.applied_at.to_rfc3339());
    }
}
fn uncertain() -> BingWallpaperError {
    error("paper.pending_intent", "A previous wallpaper operation has an uncertain outcome. Turn daily change off, then on to recover after storage is available.", false)
}
fn cancelled() -> BingWallpaperError {
    error(
        "paper.cancelled",
        "Wallpaper operation was superseded before application.",
        false,
    )
}

#[path = "automation_runtime.rs"]
mod runtime;
pub use runtime::start;
#[cfg(test)]
use runtime::Schedule;

#[cfg(test)]
mod tests {
    use super::*;
    fn root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "zero-paper-{name}-{}-{}",
            std::process::id(),
            super::super::now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn store_defaults_off_and_preserves_unknown_and_invalid_files() {
        let root = root("store");
        fs::write(root.join("mine.txt"), "keep").unwrap();
        assert!(!load(&root).unwrap().settings.auto_change_daily);
        let mut data = load(&root).unwrap();
        data.settings.auto_change_daily = true;
        persist(&root, &data).unwrap();
        assert!(load(&root).unwrap().settings.auto_change_daily);
        fs::write(root.join(STATE_FILE), r#"{"schemaVersion":999}"#).unwrap();
        let original = fs::read(root.join(STATE_FILE)).unwrap();
        assert!(load(&root).is_err());
        assert_eq!(fs::read(root.join(STATE_FILE)).unwrap(), original);
        assert_eq!(fs::read_to_string(root.join("mine.txt")).unwrap(), "keep");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn pending_and_manual_protection_survive_restart() {
        let root = root("intent");
        let mut data = load(&root).unwrap();
        data.pending_intent = Some(ApplyIntent {
            wallpaper_id: "older".into(),
            slot: 0,
        });
        data.manual_override_until = Some(Utc::now() + chrono::Duration::hours(2));
        persist(&root, &data).unwrap();
        let loaded = load(&root).unwrap();
        assert_eq!(
            loaded
                .pending_intent
                .as_ref()
                .map(|i| i.wallpaper_id.as_str()),
            Some("older")
        );
        assert!(loaded.manual_override_until.unwrap() > Utc::now());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn resume_does_not_bypass_network_backoff_or_replay_sleep() {
        let now = Utc::now();
        let tick = std::time::Instant::now();
        let mut schedule = Schedule::default();
        assert!(schedule.due(now, tick, false, false));
        let failed = PaperRuntimeSnapshot {
            error: Some(error("network.timeout", "offline", true)),
            ..Default::default()
        };
        schedule.completed(now, tick, &failed);
        assert!(!schedule.due(now, tick + std::time::Duration::from_secs(1), true, false));
        assert!(schedule.due(now, tick + std::time::Duration::from_secs(60), false, false));
        schedule.completed(now, tick + std::time::Duration::from_secs(60), &failed);
        assert!(!schedule.due(now, tick + std::time::Duration::from_secs(61), true, false));
        assert!(schedule.due(
            now + chrono::Duration::days(7),
            tick + std::time::Duration::from_secs(8 * 86400),
            false,
            false
        ));
        schedule.completed(
            now,
            tick + std::time::Duration::from_secs(8 * 86400),
            &PaperRuntimeSnapshot::default(),
        );
        assert!(!schedule.due(
            now + chrono::Duration::days(7),
            tick + std::time::Duration::from_secs(8 * 86400 + 1),
            false,
            false
        ));
    }
    #[test]
    fn wire_names_and_optional_fields_are_explicit() {
        let value = serde_json::to_value(PaperSettings::default()).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"version":1,"autoChangeDaily":false})
        );
        assert_eq!(
            serde_json::to_value(PaperAutomationPhase::PausedForManual).unwrap(),
            "pausedForManual"
        );
        let value = serde_json::to_value(PaperRuntimeSnapshot::default()).unwrap();
        assert!(value.get("lastCheckedAt").is_none());
        assert!(value.get("revision").is_some());
    }
}

#[cfg(test)]
#[path = "automation_tests.rs"]
mod runtime_tests;
