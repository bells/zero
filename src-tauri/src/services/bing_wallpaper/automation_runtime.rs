use super::*;
use tauri::Manager;

pub fn start(app: &tauri::AppHandle) {
    let state = app.state::<BingWallpaperState>();
    let automation = &state.automation;
    if automation.started.swap(true, Ordering::SeqCst) {
        return;
    }
    *automation.app.lock().unwrap_or_else(|e| e.into_inner()) = Some(app.clone());
    let owner = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = owner.state::<BingWallpaperState>();
        let automation = &state.automation;
        let mut events = None;
        let mut event_revision = crate::services::power_events::resume_revision();
        let mut schedule = Schedule::default();
        let mut previously_running = false;
        loop {
            if automation.stopping.load(Ordering::SeqCst) {
                break;
            }
            let setting = automation.settings().await;
            let running = automation.enabled.load(Ordering::SeqCst)
                && setting.is_ok_and(|s| s.auto_change_daily);
            if running {
                if events.is_none() {
                    events = Some(crate::services::power_events::subscribe());
                }
                let now = automation.clock.now();
                let tick = std::time::Instant::now();
                let revision = crate::services::power_events::resume_revision();
                let resume = revision != event_revision;
                event_revision = revision;
                let explicit = automation.explicit_enable.swap(false, Ordering::SeqCst);
                if schedule.due(
                    now,
                    tick,
                    resume
                        || !previously_running
                        || automation.reconcile_requested.swap(false, Ordering::SeqCst),
                    explicit,
                ) {
                    automation.check(&state, true, explicit).await;
                    let result = automation.snapshot();
                    let delay = schedule.completed(
                        automation.clock.now(),
                        std::time::Instant::now(),
                        &result,
                    );
                    automation.record_next_check(delay).await;
                }
            } else {
                events = None;
                schedule = Schedule::default();
            }
            previously_running = running;
            if !running {
                automation.wake.notified().await;
                continue;
            }
            let _ = futures_util::future::select(
                Box::pin(tokio::time::sleep(std::time::Duration::from_secs(60))),
                Box::pin(automation.wake.notified()),
            )
            .await;
        }
    });
}

#[derive(Default)]
pub(super) struct Schedule {
    day: Option<chrono::NaiveDate>,
    due_at: Option<std::time::Instant>,
    last_success: Option<std::time::Instant>,
    last_tick: Option<std::time::Instant>,
    last_wall: Option<DateTime<Utc>>,
    failures: usize,
    terminal: bool,
}
impl Schedule {
    pub(super) fn due(
        &mut self,
        now: DateTime<Utc>,
        tick: std::time::Instant,
        event: bool,
        explicit: bool,
    ) -> bool {
        let day_changed = self.day != Some(market_day(now));
        let gap = self
            .last_tick
            .is_some_and(|last| tick.saturating_duration_since(last).as_secs() > 120);
        let gap = gap
            || self
                .last_wall
                .is_some_and(|last| (now - last).num_seconds().unsigned_abs() > 120);
        self.last_wall = Some(now);
        self.last_tick = Some(tick);
        self.day = Some(market_day(now));
        if explicit || day_changed {
            self.terminal = false;
            return true;
        }
        if self.terminal {
            return false;
        }
        if (event || gap) && self.failures == 0 {
            self.due_at = Some(
                self.last_success
                    .map(|last| last + std::time::Duration::from_secs(60))
                    .unwrap_or(tick),
            );
        }
        self.due_at.is_none_or(|due| tick >= due)
    }
    pub(super) fn completed(
        &mut self,
        _now: DateTime<Utc>,
        tick: std::time::Instant,
        result: &PaperRuntimeSnapshot,
    ) -> Option<u64> {
        let delay = if let Some(e) = &result.error {
            if !e.retryable {
                self.terminal = true;
                self.due_at = None;
                return None;
            }
            let delay = retry_seconds(self.failures);
            self.failures += 1;
            delay
        } else {
            self.failures = 0;
            self.last_success = Some(tick);
            if result.phase == PaperAutomationPhase::Unsupported {
                self.terminal = true;
                self.due_at = None;
                return None;
            }
            if result.phase == PaperAutomationPhase::RetryWaiting {
                1800
            } else {
                6 * 3600
            }
        };
        self.due_at = Some(tick + std::time::Duration::from_secs(delay));
        Some(delay)
    }
}
