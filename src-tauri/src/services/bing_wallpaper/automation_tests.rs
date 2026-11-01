use super::super::{empty_cache_index, persist_cache_index, BingWallpaperItem};
use super::*;
use crate::plugins::contracts::NativeResourceError;
use chrono::TimeZone;
use std::future::Future;
use std::sync::atomic::AtomicUsize;

struct Clock(StdMutex<DateTime<Utc>>);
impl PaperClock for Clock {
    fn now(&self) -> DateTime<Utc> {
        *self.0.lock().unwrap()
    }
}
#[derive(Default)]
struct Setter {
    calls: AtomicUsize,
    fail: AtomicBool,
    break_store: StdMutex<Option<PathBuf>>,
    paths: StdMutex<Vec<PathBuf>>,
}
impl WallpaperSetter for Setter {
    fn set_from_path(&self, path: &Path) -> Result<(), NativeResourceError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.paths.lock().unwrap().push(path.into());
        if let Some(root) = self.break_store.lock().unwrap().take() {
            fs::rename(root.join(STATE_FILE), root.join("pending-backup.json")).unwrap();
            fs::create_dir(root.join(STATE_FILE)).unwrap();
        }
        if self.fail.load(Ordering::SeqCst) {
            return Err(crate::services::native_resources::resource_error(
                "system.setWallpaper",
                "wallpaper.backend",
                "failed",
                true,
            ));
        }
        Ok(())
    }
}
static FIXTURE_SEQUENCE: AtomicUsize = AtomicUsize::new(0);
fn fixture() -> (BingWallpaperState, Arc<Clock>, Arc<Setter>) {
    let root = std::env::temp_dir().join(format!(
        "zero-paper-runtime-{}-{}-{}",
        std::process::id(),
        super::super::now_ms(),
        FIXTURE_SEQUENCE.fetch_add(1, Ordering::SeqCst)
    ));
    fs::create_dir_all(&root).unwrap();
    let clock = Arc::new(Clock(StdMutex::new(
        Utc.with_ymd_and_hms(2026, 10, 31, 10, 0, 0).unwrap(),
    )));
    let setter = Arc::new(Setter::default());
    let mut state = BingWallpaperState::new(root.clone());
    state.automation = PaperAutomation::with_dependencies(root, clock.clone(), setter.clone());
    (state, clock, setter)
}
fn seed(state: &BingWallpaperState, values: &[(&str, &str)]) -> BingWallpaperSnapshot {
    let mut index = empty_cache_index();
    for (id, date) in values {
        let file = format!("{date}-{id}.jpg");
        image::RgbImage::from_pixel(2, 2, image::Rgb([30, 60, 90]))
            .save(state.root.join(&file))
            .unwrap();
        index.items.push(BingWallpaperItem {
            id: id.to_string(),
            start_date: date.to_string(),
            display_date: None,
            title: id.to_string(),
            attribution: String::new(),
            copyright_url: None,
            remote_url: "https://www.bing.com/th?id=test".into(),
            cache_file_name: file,
            preview_file_name: None,
            cached: true,
        });
    }
    persist_cache_index(&state.root, &index).unwrap();
    state.snapshot()
}
#[test]
fn auto_eligibility_dedup_and_restarts_use_the_most_recent_success() {
    let (state, clock, setter) = fixture();
    tauri::async_runtime::block_on(async {
        let old = seed(&state, &[("old", "20261030")]);
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        let generation = state.automation.generation.load(Ordering::SeqCst);
        state
            .automation
            .maybe_apply(&state, &old, generation, false)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            state.automation.snapshot().phase,
            PaperAutomationPhase::RetryWaiting
        );
        state
            .automation
            .maybe_apply(&state, &old, generation, true)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            state.automation.snapshot().phase,
            PaperAutomationPhase::RetryWaiting
        );
        state
            .automation
            .maybe_apply(&state, &old, generation, true)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            state.automation.snapshot().phase,
            PaperAutomationPhase::RetryWaiting
        );
        let reloaded =
            PaperAutomation::with_dependencies(state.root.clone(), clock.clone(), setter.clone());
        reloaded.maybe_apply(&state, &old, 0, true).await.unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
        let current = seed(&state, &[("today", "20261031"), ("old", "20261030")]);
        state
            .automation
            .maybe_apply(&state, &current, generation, false)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 2);
    });
    fs::remove_dir_all(state.root()).unwrap();
}
#[test]
fn successful_manual_history_protects_across_restart_until_next_china_day() {
    let (state, clock, setter) = fixture();
    tauri::async_runtime::block_on(async {
        let snapshot = seed(&state, &[("today", "20261031"), ("old", "20261030")]);
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        state.apply("old", setter.clone()).await.unwrap();
        let until = state.automation.snapshot().manual_override_until.unwrap();
        assert_eq!(until, "2026-10-31T16:00:00+00:00");
        let reloaded =
            PaperAutomation::with_dependencies(state.root.clone(), clock.clone(), setter.clone());
        reloaded
            .maybe_apply(&state, &snapshot, 0, false)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
        *clock.0.lock().unwrap() = Utc.with_ymd_and_hms(2026, 10, 31, 16, 0, 1).unwrap();
        reloaded
            .maybe_apply(&state, &snapshot, 0, false)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
        let next = seed(&state, &[("next", "20261101")]);
        reloaded.maybe_apply(&state, &next, 0, false).await.unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 2);
    });
    fs::remove_dir_all(state.root()).unwrap();
}
#[test]
fn rejected_save_and_failed_application_never_record_success_or_manual_protection() {
    let (state, _, setter) = fixture();
    tauri::async_runtime::block_on(async {
        seed(&state, &[("old", "20261030")]);
        fs::create_dir(state.root.join(STATE_FILE)).unwrap();
        assert!(state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true
            })
            .await
            .is_err());
        assert!(!state.automation.settings().await.unwrap().auto_change_daily);
        assert!(state.apply("old", setter.clone()).await.is_err());
        assert_eq!(setter.calls.load(Ordering::SeqCst), 0);
        fs::remove_dir(state.root.join(STATE_FILE)).unwrap();
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        setter.fail.store(true, Ordering::SeqCst);
        assert!(state.apply("old", setter.clone()).await.is_err());
        assert!(load(state.root()).unwrap().last_applied.is_none());
        assert!(load(state.root()).unwrap().manual_override_until.is_none());
    });
    fs::remove_dir_all(state.root()).unwrap();
}
#[test]
fn os_success_with_unsaved_outcome_remains_truthful_and_blocks_until_explicit_recovery() {
    let (state, clock, setter) = fixture();
    tauri::async_runtime::block_on(async {
        let snapshot = seed(&state, &[("today", "20261031")]);
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        *setter.break_store.lock().unwrap() = Some(state.root.clone());
        let error = state.apply("today", setter.clone()).await.unwrap_err();
        assert_eq!(error.code, "paper.applied_state_unsaved");
        assert_eq!(
            state
                .automation
                .snapshot()
                .last_applied_wallpaper_id
                .as_deref(),
            Some("today")
        );
        fs::remove_dir(state.root.join(STATE_FILE)).unwrap();
        fs::rename(
            state.root.join("pending-backup.json"),
            state.root.join(STATE_FILE),
        )
        .unwrap();
        let reloaded =
            PaperAutomation::with_dependencies(state.root.clone(), clock, setter.clone());
        reloaded
            .maybe_apply(&state, &snapshot, 0, false)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
        reloaded
            .update(PaperSettingsUpdate {
                auto_change_daily: false,
            })
            .await
            .unwrap();
        reloaded
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        let g = reloaded.generation.load(Ordering::SeqCst);
        reloaded
            .maybe_apply(&state, &snapshot, g, true)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 2);
    });
    fs::remove_dir_all(state.root()).unwrap();
}
#[test]
fn gallery_rotation_keeps_the_applied_file_and_unknown_user_files() {
    let (state, _, setter) = fixture();
    tauri::async_runtime::block_on(async {
        let before = seed(&state, &[("old", "20261030")]);
        fs::write(state.root.join("mine.txt"), "keep").unwrap();
        let applied = state.apply("old", setter.clone()).await.unwrap();
        let after = seed(&state, &[("new", "20261031")]);
        super::super::cleanup_obsolete_files(state.root(), &before.items, &after.items);
        assert!(!state.root.join("20261030-old.jpg").exists());
        assert!(Path::new(&applied.path).exists());
        assert_eq!(
            fs::read_to_string(state.root.join("mine.txt")).unwrap(),
            "keep"
        );
    });
    fs::remove_dir_all(state.root()).unwrap();
}

#[test]
fn disabling_during_a_native_call_preserves_truth_and_cancels_queued_automation() {
    struct BlockingSetter {
        began: StdMutex<Option<std::sync::mpsc::Sender<()>>>,
        released: (StdMutex<bool>, std::sync::Condvar),
        calls: AtomicUsize,
    }
    impl WallpaperSetter for BlockingSetter {
        fn set_from_path(&self, _: &Path) -> Result<(), NativeResourceError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if let Some(tx) = self.began.lock().unwrap().take() {
                tx.send(()).unwrap();
            }
            let (lock, cv) = &self.released;
            let mut released = lock.lock().unwrap();
            while !*released {
                released = cv.wait(released).unwrap();
            }
            Ok(())
        }
    }
    let (state, _, _) = fixture();
    seed(&state, &[("today", "20261031"), ("old", "20261030")]);
    let state = Arc::new(state);
    let (tx, rx) = std::sync::mpsc::channel();
    let setter = Arc::new(BlockingSetter {
        began: StdMutex::new(Some(tx)),
        released: (StdMutex::new(false), std::sync::Condvar::new()),
        calls: AtomicUsize::new(0),
    });
    tauri::async_runtime::block_on(state.automation.update(PaperSettingsUpdate {
        auto_change_daily: true,
    }))
    .unwrap();
    let g = state.automation.generation.load(Ordering::SeqCst);
    let owner = state.clone();
    let native = setter.clone();
    let manual = tauri::async_runtime::spawn(async move { owner.apply("old", native).await });
    rx.recv_timeout(std::time::Duration::from_secs(3)).unwrap();
    let owner = state.clone();
    let native = setter.clone();
    let automatic = tauri::async_runtime::spawn(async move {
        owner
            .automation
            .apply(&owner, "today", native, Some(g))
            .await
    });
    tauri::async_runtime::block_on(async {
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            state.automation.update(PaperSettingsUpdate {
                auto_change_daily: false,
            }),
        )
        .await;
        *setter.released.0.lock().unwrap() = true;
        setter.released.1.notify_all();
        result.unwrap().unwrap();
        assert!(manual.await.unwrap().is_ok());
        assert_eq!(
            automatic.await.unwrap().unwrap_err().code,
            "paper.cancelled"
        );
    });
    assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
    let snapshot = state.automation.snapshot();
    assert_eq!(snapshot.last_applied_wallpaper_id.as_deref(), Some("old"));
    assert_eq!(snapshot.phase, PaperAutomationPhase::Off);
    fs::remove_dir_all(state.root()).unwrap();
}

#[test]
fn reconciliation_detects_a_same_day_sleep_when_monotonic_time_pauses() {
    let now = Utc.with_ymd_and_hms(2026, 10, 31, 1, 0, 0).unwrap();
    let tick = std::time::Instant::now();
    let mut schedule = Schedule::default();
    assert!(schedule.due(now, tick, false, false));
    schedule.completed(now, tick, &PaperRuntimeSnapshot::default());
    assert!(schedule.due(
        now + chrono::Duration::hours(2),
        tick + std::time::Duration::from_secs(61),
        false,
        false
    ));
}

#[test]
fn joining_an_older_check_still_honors_a_new_explicit_enable_intent() {
    let (state, _, setter) = fixture();
    seed(&state, &[("older", "20261030")]);
    tauri::async_runtime::block_on(async {
        let queue = state.automation.check_queue.lock().await;
        let mut check = Box::pin(state.automation.check(&state, true, true));
        std::future::poll_fn(|cx| {
            assert!(check.as_mut().poll(cx).is_pending());
            std::task::Poll::Ready(())
        })
        .await;
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        state
            .automation
            .check_sequence
            .fetch_add(1, Ordering::SeqCst);
        drop(queue);
        check.await;
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
    });
    fs::remove_dir_all(state.root()).unwrap();
}

#[test]
fn recovering_an_uncertain_application_does_not_overwrite_its_possible_current_file() {
    let (state, clock, setter) = fixture();
    tauri::async_runtime::block_on(async {
        seed(&state, &[("today", "20261031")]);
        *setter.break_store.lock().unwrap() = Some(state.root.clone());
        assert_eq!(
            state.apply("today", setter.clone()).await.unwrap_err().code,
            "paper.applied_state_unsaved"
        );
        let path = setter.paths.lock().unwrap()[0].clone();
        let original = fs::read(&path).unwrap();
        fs::remove_dir(state.root.join(STATE_FILE)).unwrap();
        fs::rename(
            state.root.join("pending-backup.json"),
            state.root.join(STATE_FILE),
        )
        .unwrap();
        let snapshot = seed(&state, &[("different", "20261031")]);
        image::RgbImage::from_pixel(2, 2, image::Rgb([255, 0, 0]))
            .save(state.root.join(&snapshot.items[0].cache_file_name))
            .unwrap();
        let recovered =
            PaperAutomation::with_dependencies(state.root.clone(), clock, setter.clone());
        recovered
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        setter.fail.store(true, Ordering::SeqCst);
        let g = recovered.generation.load(Ordering::SeqCst);
        assert!(recovered
            .maybe_apply(&state, &snapshot, g, true)
            .await
            .is_err());
        assert_eq!(fs::read(path).unwrap(), original);
    });
    fs::remove_dir_all(state.root()).unwrap();
}

#[test]
fn manual_application_cannot_erase_an_unresolved_crash_intent() {
    let (mut state, clock, setter) = fixture();
    seed(&state, &[("today", "20261031")]);
    let data = Stored {
        pending_intent: Some(ApplyIntent {
            wallpaper_id: "uncertain".into(),
            slot: 0,
        }),
        ..Default::default()
    };
    persist(state.root(), &data).unwrap();
    state.automation =
        PaperAutomation::with_dependencies(state.root.clone(), clock, setter.clone());
    setter.fail.store(true, Ordering::SeqCst);
    let result = tauri::async_runtime::block_on(state.apply("today", setter.clone()));
    assert_eq!(result.unwrap_err().code, "paper.pending_intent");
    assert_eq!(setter.calls.load(Ordering::SeqCst), 0);
    assert!(load(state.root()).unwrap().pending_intent.is_some());
    fs::remove_dir_all(state.root()).unwrap();
}

#[test]
fn reserved_applied_names_do_not_overwrite_unknown_user_files() {
    let (state, _, setter) = fixture();
    seed(&state, &[("today", "20261031")]);
    fs::write(state.root.join("applied-a.jpg"), "user file").unwrap();
    tauri::async_runtime::block_on(state.apply("today", setter)).unwrap();
    assert_eq!(
        fs::read(state.root.join("applied-a.jpg")).unwrap(),
        b"user file"
    );
    fs::remove_dir_all(state.root()).unwrap();
}

#[test]
fn plugin_reenable_preserves_manual_protection_but_explicit_off_on_clears_it() {
    let (state, _, setter) = fixture();
    let snapshot = seed(&state, &[("today", "20261031"), ("old", "20261030")]);
    tauri::async_runtime::block_on(async {
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        state.apply("old", setter.clone()).await.unwrap();
        state.automation.set_enabled(false);
        state.automation.set_enabled(true);
        let generation = state.automation.generation.load(Ordering::SeqCst);
        state
            .automation
            .maybe_apply(&state, &snapshot, generation, false)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 1);
        assert!(state.automation.snapshot().manual_override_until.is_some());
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: false,
            })
            .await
            .unwrap();
        state
            .automation
            .update(PaperSettingsUpdate {
                auto_change_daily: true,
            })
            .await
            .unwrap();
        assert!(state.automation.snapshot().manual_override_until.is_none());
        let generation = state.automation.generation.load(Ordering::SeqCst);
        state
            .automation
            .maybe_apply(&state, &snapshot, generation, true)
            .await
            .unwrap();
        assert_eq!(setter.calls.load(Ordering::SeqCst), 2);
    });
    fs::remove_dir_all(state.root()).unwrap();
}
