use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Barrier};
use zero_lib::plugins::scheduler::{Occurrence, Owner, Schedule, Scheduler};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let mut nonce = [0; 16];
        getrandom::fill(&mut nonce).unwrap();
        let root = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("zero-scheduler-{:x}", u128::from_le_bytes(nonce)));
        fs::create_dir(&root).unwrap();
        fs::create_dir(root.join("installed")).unwrap();
        Self(root)
    }
    fn path(&self) -> PathBuf {
        self.0.join("schedules.json")
    }
    fn owner(&self, id: &str) -> Owner {
        Owner {
            plugin_id: id.into(),
            version: "1.0.0".into(),
            digest: "ab".repeat(32),
            root: self.0.join("installed"),
        }
    }
    fn open(&self) -> Scheduler {
        Scheduler::open(&self.path()).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn schedule(id: &str, at: u64) -> Schedule {
    Schedule {
        task_id: id.into(),
        event_id: "refresh".into(),
        next_at_ms: at,
        payload: json!({"opaque": 42}),
    }
}
fn claim(s: &Scheduler, now: u64) -> Occurrence {
    s.claim_due(now).unwrap().unwrap()
}

#[test]
fn absolute_deadline_is_preserved_and_long_missed_work_coalesces_once() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.calendar");
    let generation = s
        .upsert(&owner, schedule("one", 1_741_503_600_000))
        .unwrap();
    assert!(s.claim_due(1_741_503_599_999).unwrap().is_none());
    let occurrence = claim(&s, 1_900_000_000_000);
    assert_eq!(occurrence.schedule.next_at_ms, 1_741_503_600_000);
    assert_eq!(occurrence.schedule.payload, json!({"opaque":42}));
    assert_eq!(occurrence.generation, generation);
    assert_eq!(occurrence.attempt, 1);
    assert!(s.claim_due(1_900_000_000_000).unwrap().is_none());
    s.complete(&occurrence).unwrap();
    drop(s);
    assert!(f.open().claim_due(1_900_000_000_000).unwrap().is_none());
}

#[test]
fn caller_computed_spring_gap_and_fall_repeat_instants_are_delivered_exactly() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.calendar");
    // Caller policy chose these UTC instants; the store performs no timezone evaluation.
    for (id, at) in [
        ("spring", 1_741_503_600_000),
        ("fall-first", 1_762_061_400_000),
        ("fall-second", 1_762_065_000_000),
    ] {
        s.upsert(&owner, schedule(id, at)).unwrap();
    }
    for at in [1_741_503_600_000, 1_762_061_400_000, 1_762_065_000_000] {
        let event = claim(&s, at);
        assert_eq!(event.schedule.next_at_ms, at);
        s.complete(&event).unwrap();
        assert!(s.claim_due(at).unwrap().is_none());
    }
}

#[test]
fn interrupted_restart_keeps_identity_and_retry_fences_old_attempt() {
    let f = Fixture::new();
    let owner = f.owner("test.notes");
    let s = f.open();
    s.upsert(&owner, schedule("one", 100)).unwrap();
    let old = claim(&s, 100);
    drop(s);
    let s = f.open();
    assert!(s.claim_due(200).unwrap().is_none());
    let retry = s.retry(&old).unwrap();
    assert_eq!(retry.occurrence_id, old.occurrence_id);
    assert_eq!(retry.attempt, 2);
    assert!(s.complete(&old).is_err());
    s.interrupt(&retry).unwrap();
    let third = s.retry(&retry).unwrap();
    assert_eq!(third.attempt, 3);
    s.fail(&third).unwrap();
    let fourth = s.retry(&third).unwrap();
    assert_eq!(fourth.attempt, 4);
    s.complete(&fourth).unwrap();
    assert!(s.retry(&fourth).is_err());
}

#[test]
fn retries_are_bounded_without_losing_the_active_identity() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.retry");
    s.upsert(&owner, schedule("one", 0)).unwrap();
    let mut event = claim(&s, 0);
    for attempt in 2..=32 {
        s.fail(&event).unwrap();
        event = s.retry(&event).unwrap();
        assert_eq!(event.attempt, attempt);
    }
    s.fail(&event).unwrap();
    let before = fs::read(f.path()).unwrap();
    assert!(s.retry(&event).is_err());
    assert_eq!(fs::read(f.path()).unwrap(), before);
    s.cancel(&owner, "one").unwrap();
}

#[test]
fn concurrent_claimers_and_second_store_cannot_acquire_the_same_work() {
    let f = Fixture::new();
    let s = Arc::new(f.open());
    let owner = f.owner("test.notes");
    s.upsert(&owner, schedule("one", 1)).unwrap();
    assert!(Scheduler::open(&f.path()).is_err());
    let barrier = Arc::new(Barrier::new(9));
    let mut threads = vec![];
    for _ in 0..8 {
        let s = s.clone();
        let b = barrier.clone();
        threads.push(std::thread::spawn(move || {
            b.wait();
            s.claim_due(1).unwrap()
        }));
    }
    barrier.wait();
    let events: Vec<_> = threads
        .into_iter()
        .filter_map(|t| t.join().unwrap())
        .collect();
    assert_eq!(events.len(), 1);
    s.complete(&events[0]).unwrap();
}

#[test]
fn replacement_cancel_and_revoke_fence_late_completion_and_isolate_peers() {
    let f = Fixture::new();
    let s = f.open();
    let a = f.owner("test.a");
    let b = f.owner("test.b");
    s.upsert(&a, schedule("same", 1)).unwrap();
    let old = claim(&s, 1);
    let newer = s.upsert(&a, schedule("same", 2)).unwrap();
    assert!(newer > old.generation);
    assert!(s.complete(&old).is_err());
    s.upsert(&b, schedule("same", 3)).unwrap();
    assert!(!s.cancel(&b, "absent").unwrap());
    let mut wrong_owner = a.clone();
    wrong_owner.digest = "cd".repeat(32);
    assert!(s.cancel(&wrong_owner, "same").is_err());
    assert!(s.revoke(&wrong_owner).is_err());
    assert_eq!(s.revoke(&a).unwrap(), 1);
    assert!(s.complete(&old).is_err());
    let peer = claim(&s, 3);
    assert_eq!(peer.owner, b);
    s.complete(&peer).unwrap();
    s.upsert(&a, schedule("same", 4)).unwrap();
    let cancelled = claim(&s, 4);
    assert!(s.cancel(&a, "same").unwrap());
    assert!(s.complete(&cancelled).is_err());
    s.upsert(&a, schedule("same", 5)).unwrap();
    let new = claim(&s, 5);
    assert_ne!(new.occurrence_id, old.occurrence_id);
    assert!(new.generation > newer);
}

#[test]
fn invalid_inputs_do_not_mutate_memory_or_disk() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.valid");
    s.upsert(&owner, schedule("valid", 10)).unwrap();
    let before = fs::read(f.path()).unwrap();
    for bad in ["", "../escape", "not ascii 文", &"a".repeat(129)] {
        let mut v = schedule(bad, 10);
        assert!(s.upsert(&owner, v.clone()).is_err());
        v.task_id = "valid".into();
        v.event_id = bad.into();
        assert!(s.upsert(&owner, v).is_err());
    }
    assert!(s
        .upsert(&owner, schedule("unsafe-time", 9_007_199_254_740_992))
        .is_err());
    let mut payload = schedule("big", 10);
    payload.payload = json!("x".repeat(16 * 1024));
    assert!(s.upsert(&owner, payload).is_err());
    let mut deep = json!(null);
    for _ in 0..33 {
        deep = json!([deep]);
    }
    let mut v = schedule("deep", 10);
    v.payload = deep;
    assert!(s.upsert(&owner, v).is_err());
    for field in ["id", "version", "digest", "root"] {
        let mut bad = owner.clone();
        match field {
            "id" => bad.plugin_id = "../peer".into(),
            "version" => bad.version = "latest".into(),
            "digest" => bad.digest = "x".repeat(64),
            _ => bad.root = f.0.join("missing"),
        };
        assert!(s.upsert(&bad, schedule("bad", 0)).is_err());
    }
    assert_eq!(fs::read(f.path()).unwrap(), before);
    assert_eq!(claim(&s, 10).schedule.task_id, "valid");
}

#[test]
fn quotas_and_terminal_cleanup_bound_the_store_without_resurrection() {
    let f = Fixture::new();
    let s = f.open();
    for owner in 0..16 {
        for task in 0..16 {
            s.upsert(
                &f.owner(&format!("test.o{owner}")),
                schedule(&format!("t{task}"), 1),
            )
            .unwrap();
        }
    }
    let before = fs::read(f.path()).unwrap();
    assert!(s.upsert(&f.owner("test.o0"), schedule("extra", 1)).is_err());
    assert!(s
        .upsert(&f.owner("test.extra"), schedule("one", 1))
        .is_err());
    assert_eq!(fs::read(f.path()).unwrap(), before);
    let event = claim(&s, 1);
    s.complete(&event).unwrap();
    s.upsert(&f.owner("test.extra"), schedule("one", 2))
        .unwrap();
    s.revoke(&f.owner("test.o1")).unwrap();
    drop(s);
    let s = f.open();
    let mut count = 0;
    while let Some(e) = s.claim_due(3).unwrap() {
        assert_ne!(e.occurrence_id, event.occurrence_id);
        s.complete(&e).unwrap();
        count += 1;
    }
    assert_eq!(count, 240);
    assert!(fs::metadata(f.path()).unwrap().len() < 1024);
}

#[test]
fn corrupt_unknown_and_oversized_state_are_preserved() {
    for bytes in [
        b"broken".to_vec(),
        br#"{"schemaVersion":2,"nextGeneration":1,"tasks":[]}"#.to_vec(),
        br#"{"schemaVersion":1,"nextGeneration":1,"tasks":[],"extra":1}"#.to_vec(),
        vec![b' '; 5 * 1024 * 1024 + 1],
    ] {
        let f = Fixture::new();
        fs::write(f.path(), &bytes).unwrap();
        assert!(Scheduler::open(&f.path()).is_err());
        assert_eq!(fs::read(f.path()).unwrap(), bytes);
    }
}

#[cfg(unix)]
#[test]
fn symlink_state_parent_lock_owner_and_nonregular_state_are_refused() {
    use std::os::unix::fs::symlink;
    let f = Fixture::new();
    let target = f.0.join("target");
    fs::write(&target, b"private").unwrap();
    symlink(&target, f.path()).unwrap();
    assert!(Scheduler::open(&f.path()).is_err());
    fs::remove_file(f.path()).unwrap();
    symlink(&f.0, f.0.join("link")).unwrap();
    assert!(Scheduler::open(&f.0.join("link/state.json")).is_err());
    symlink(&target, f.0.join("schedules.json.lock")).unwrap();
    assert!(Scheduler::open(&f.path()).is_err());
    fs::remove_file(f.0.join("schedules.json.lock")).unwrap();
    let s = f.open();
    let mut owner = f.owner("test.notes");
    owner.root = f.0.join("link/installed");
    assert!(s.upsert(&owner, schedule("one", 0)).is_err());
    drop(s);
    fs::create_dir(f.path()).unwrap();
    assert!(Scheduler::open(&f.path()).is_err());
    assert_eq!(fs::read(target).unwrap(), b"private");
}

#[test]
fn persistence_failure_preserves_prior_memory_disk_and_cleans_exclusive_temp() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.notes");
    s.upsert(&owner, schedule("original", 1)).unwrap();
    let before = fs::read(f.path()).unwrap();
    // A real path-validation fault at commit must leave the admitted in-memory schedule untouched.
    let saved = f.0.join("schedules.saved");
    fs::rename(f.path(), &saved).unwrap();
    fs::create_dir(f.path()).unwrap();
    assert!(s.cancel(&owner, "original").is_err());
    fs::remove_dir(f.path()).unwrap();
    fs::rename(&saved, f.path()).unwrap();
    assert_eq!(fs::read(f.path()).unwrap(), before);
    let event = claim(&s, 1);
    assert_eq!(event.schedule.task_id, "original");
    assert!(fs::read_dir(&f.0).unwrap().all(|entry| !entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .ends_with(".tmp")));
}

#[test]
fn recovered_claim_is_discoverable_without_automatically_replaying_it() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.discover");
    s.upsert(&owner, schedule("one", 1)).unwrap();
    let old = claim(&s, 1);
    drop(s);
    let s = f.open();
    let recovered = s.interrupted().unwrap();
    assert_eq!(recovered, vec![old.clone()]);
    assert!(s.claim_due(2).unwrap().is_none());
    let retry = s.retry(&recovered[0]).unwrap();
    assert_eq!(retry.occurrence_id, old.occurrence_id);
    assert_eq!(retry.attempt, 2);
    assert!(s.interrupted().unwrap().is_empty());
}

#[test]
fn forged_claims_and_inconsistent_persisted_records_are_refused() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.invariants");
    s.upsert(&owner, schedule("one", 1)).unwrap();
    let event = claim(&s, 1);
    let before = fs::read(f.path()).unwrap();
    let mut forged = event.clone();
    forged.owner.plugin_id = "test.peer".into();
    assert!(s.complete(&forged).is_err());
    forged = event.clone();
    forged.schedule.payload = json!("changed");
    assert!(s.fail(&forged).is_err());
    forged = event.clone();
    forged.generation += 1;
    assert!(s.interrupt(&forged).is_err());
    assert_eq!(fs::read(f.path()).unwrap(), before);
    drop(s);
    let baseline: serde_json::Value = serde_json::from_slice(&before).unwrap();
    for mutation in [
        "unknown-task",
        "unknown-owner",
        "duplicate-task",
        "bad-generation",
        "bad-attempt",
        "bad-status",
        "mismatched-payload",
        "non-integer-time",
    ] {
        let mut state = baseline.clone();
        match mutation {
            "unknown-task" => state["tasks"][0]["extra"] = json!(1),
            "unknown-owner" => state["tasks"][0]["owner"]["extra"] = json!(1),
            "duplicate-task" => {
                let task = state["tasks"][0].clone();
                state["tasks"].as_array_mut().unwrap().push(task);
            }
            "bad-generation" => state["nextGeneration"] = json!(1),
            "bad-attempt" => state["tasks"][0]["occurrence"]["attempt"] = json!(0),
            "bad-status" => state["tasks"][0]["status"] = json!("pending"),
            "mismatched-payload" => {
                state["tasks"][0]["occurrence"]["schedule"]["payload"] = json!("changed")
            }
            _ => state["tasks"][0]["schedule"]["nextAtMs"] = json!(1.5),
        }
        let bytes = serde_json::to_vec(&state).unwrap();
        fs::write(f.path(), &bytes).unwrap();
        assert!(Scheduler::open(&f.path()).is_err(), "{mutation}");
        assert_eq!(fs::read(f.path()).unwrap(), bytes);
    }
}

#[cfg(unix)]
#[test]
fn partial_stage_write_failure_preserves_memory_disk_and_removes_temp() {
    const CHILD_ROOT: &str = "ZERO_SCHEDULER_WRITE_FAULT_CHILD";
    if let Some(root) = std::env::var_os(CHILD_ROOT) {
        let root = PathBuf::from(root);
        let path = root.join("schedules.json");
        let s = Scheduler::open(&path).unwrap();
        let owner = Owner {
            plugin_id: "test.fault".into(),
            version: "1.0.0".into(),
            digest: "ab".repeat(32),
            root: root.join("installed"),
        };
        s.upsert(&owner, schedule("original", 1)).unwrap();
        let before = fs::read(&path).unwrap();
        // The process-local file-size limit fails a real partial staging write,
        // without adding fault switches to production code or affecting the host.
        unsafe {
            let mut previous = std::mem::zeroed();
            assert_eq!(libc::getrlimit(libc::RLIMIT_FSIZE, &mut previous), 0);
            let old_signal = libc::signal(libc::SIGXFSZ, libc::SIG_IGN);
            let limited = libc::rlimit {
                rlim_cur: 1,
                rlim_max: previous.rlim_max,
            };
            assert_eq!(libc::setrlimit(libc::RLIMIT_FSIZE, &limited), 0);
            let failure = s.cancel(&owner, "original");
            assert_eq!(libc::setrlimit(libc::RLIMIT_FSIZE, &previous), 0);
            libc::signal(libc::SIGXFSZ, old_signal);
            assert!(failure.is_err());
        }
        assert_eq!(fs::read(&path).unwrap(), before);
        assert_eq!(claim(&s, 1).schedule.task_id, "original");
        assert!(fs::read_dir(root).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".tmp")));
        return;
    }
    let f = Fixture::new();
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "partial_stage_write_failure_preserves_memory_disk_and_removes_temp",
            "--nocapture",
        ])
        .env(CHILD_ROOT, &f.0)
        .status()
        .unwrap();
    assert!(status.success());
}

#[test]
fn atomic_finish_reschedules_with_a_new_generation_and_fences_duplicate_completion() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.atomic");
    s.upsert(&owner, schedule("one", 1)).unwrap();
    let first = claim(&s, 1);
    let next = s.finish_and_schedule(&first, Some(20)).unwrap().unwrap();
    assert!(next > first.generation);
    assert!(s.finish_and_schedule(&first, Some(30)).is_err());
    assert!(s.claim_due(19).unwrap().is_none());
    let second = claim(&s, 20);
    assert_ne!(second.occurrence_id, first.occurrence_id);
    s.complete(&second).unwrap();
}

#[test]
fn deferred_retry_keeps_identity_and_is_not_claimable_until_deadline() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.defer");
    s.upsert(&owner, schedule("one", 1)).unwrap();
    let first = claim(&s, 1);
    s.defer_retry(&first, 50).unwrap();
    assert_eq!(s.next_deadline(&[]).unwrap(), Some(50));
    assert!(s.claim_due(49).unwrap().is_none());
    assert!(s.complete(&first).is_err());
    drop(s);
    let s = f.open();
    let second = claim(&s, 50);
    assert_eq!(second.occurrence_id, first.occurrence_id);
    assert_eq!(second.generation, first.generation);
    assert_eq!(second.attempt, 2);
    s.complete(&second).unwrap();
}

#[test]
fn empty_deadline_inspection_and_due_claim_do_not_create_a_journal() {
    let f = Fixture::new();
    let s = f.open();
    assert_eq!(s.next_deadline(&[]).unwrap(), None);
    assert!(s.claim_due(1).unwrap().is_none());
    assert!(!f.path().exists());
}

#[test]
fn staged_mutation_cannot_publish_over_changed_state_and_does_not_hold_store_lock() {
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.staged");
    s.upsert(&owner, schedule("existing", 1)).unwrap();
    let staged = s.prepare_upsert(&owner, schedule("later", 2)).unwrap();
    // A cancellation during fsync/staging wins; publication must compare the snapshot.
    s.cancel(&owner, "existing").unwrap();
    assert!(staged.commit().is_err());
    assert!(s.snapshot().unwrap().is_empty());
    assert!(fs::read_dir(&f.0).unwrap().all(|e| !e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .ends_with(".tmp")));
}

#[test]
fn cancel_or_destroy_after_staging_prevents_publication_and_keeps_peer_state() {
    use std::time::Instant;
    use zero_lib::plugins::session::{SessionOwner, Sessions};
    let f = Fixture::new();
    let s = f.open();
    let owner = f.owner("test.staged");
    let peer = f.owner("test.peer");
    s.upsert(&peer, schedule("peer", 50)).unwrap();
    for close in [false, true] {
        let now = Instant::now();
        let mut sessions = Sessions::default();
        let live = SessionOwner {
            plugin_id: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
            view_id: "main".into(),
            revision: 1,
            permissions: vec!["background.schedule".into()],
        };
        let info = sessions.issue(live.clone(), now).unwrap();
        let caller = format!("plugin-{}", info.session_id);
        sessions
            .ready(&info.session_id, &caller, info.generation, now)
            .unwrap();
        let request=serde_json::from_value(serde_json::json!({"protocolVersion":"1.0.0","requestId":"r1","sessionId":info.session_id,"generation":info.generation,"method":"schedule.upsert","payload":{"taskId":"new","eventId":"refresh","nextAtMs":1,"payload":null}})).unwrap();
        sessions.begin(&caller, &request, &live, true, now).unwrap();
        let staged = s.prepare_upsert(&owner, schedule("new", 1)).unwrap();
        if close {
            sessions.close_window(&caller);
        } else {
            sessions.finish(&caller, &request, now).unwrap();
        }
        assert!(sessions
            .commit_live(&caller, &request, &live, true, now, || staged
                .commit()
                .map_err(|_| zero_lib::plugins::session::error("schedule.stale")))
            .is_err());
        assert_eq!(
            s.snapshot().unwrap(),
            vec![(peer.clone(), schedule("peer", 50))]
        );
    }
}
