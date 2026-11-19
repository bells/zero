use std::fs;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use zero_lib::plugins::protocol::PluginRequest;
use zero_lib::plugins::session::{SessionOwner, Sessions};
use zero_lib::plugins::storage::prepare;

#[test]
fn completed_provider_work_cannot_commit_after_cancel_revoke_or_replacement() {
    for interruption in ["cancel", "disable", "replace", "deadline"] {
        let root = std::env::temp_dir().join(format!(
            "zero-storage-commit-{}-{interruption}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let now = Instant::now();
        let mut sessions = Sessions::default();
        let owner = SessionOwner {
            plugin_id: "test.notes".into(),
            version: "1.0.0".into(),
            digest: "ab".repeat(32),
            root: root.clone(),
            view_id: "test.notes.main".into(),
            revision: 1,
            permissions: vec!["storage.plugin".into()],
        };
        let info = sessions.issue(owner.clone(), now).unwrap();
        let caller = format!("plugin-{}", info.session_id);
        sessions
            .ready(&info.session_id, &caller, info.generation, now)
            .unwrap();
        let request: PluginRequest = serde_json::from_value(serde_json::json!({
            "protocolVersion":"1.0.0", "requestId":"r1", "sessionId":info.session_id,
            "generation":info.generation, "method":"storage.set",
            "payload":{"key":"note","value":"late"}
        }))
        .unwrap();
        sessions
            .begin(&caller, &request, &owner, true, now)
            .unwrap();
        prepare(&root, "note", Some(serde_json::json!("before")))
            .unwrap()
            .commit()
            .unwrap();
        let prepared = prepare(&root, "note", Some(serde_json::json!("late"))).unwrap();
        let commit_at = if interruption == "deadline" {
            now + Duration::from_secs(10)
        } else {
            now
        };
        match interruption {
            "cancel" => sessions.finish(&caller, &request, now).unwrap(),
            "disable" | "replace" => {
                sessions.revoke("test.notes");
                if interruption == "replace" {
                    let replacement = sessions.issue(owner.clone(), now).unwrap();
                    assert!(replacement.generation > info.generation);
                }
            }
            _ => {}
        }
        let result = sessions.commit(&caller, &request, commit_at, || prepared.commit());
        assert_eq!(
            result.unwrap_err().code,
            match interruption {
                "cancel" => "request.cancelled",
                "deadline" => "request.timeout",
                _ => "session.revoked",
            }
        );
        assert_eq!(
            prepare(&root, "note", None).unwrap().commit().unwrap(),
            "before"
        );
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
}
#[test]
fn staged_storage_cancellation_preserves_old_data_and_removes_only_its_stage() {
    let root = std::env::temp_dir().join(format!("zero-storage-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    prepare(&root, "note", Some(serde_json::json!("before")))
        .unwrap()
        .commit()
        .unwrap();
    let staged = prepare(&root, "note", Some(serde_json::json!("cancelled"))).unwrap();
    assert_eq!(
        prepare(&root, "note", None).unwrap().commit().unwrap(),
        "before"
    );
    drop(staged);
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    assert_eq!(
        prepare(&root, "note", None).unwrap().commit().unwrap(),
        "before"
    );
    assert!(prepare(
        &root,
        "note",
        Some(serde_json::json!("x".repeat(1024 * 1024)))
    )
    .is_err());
    prepare(&root, "note", Some(serde_json::json!("after")))
        .unwrap()
        .commit()
        .unwrap();
    assert_eq!(
        prepare(&root, "note", None).unwrap().commit().unwrap(),
        "after"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn compare_and_set_rejects_stale_view_values_without_losing_unrelated_keys() {
    use zero_lib::plugins::storage::prepare_compare_and_set;
    let root = std::env::temp_dir().join(format!("zero-storage-cas-{}", std::process::id()));
    prepare(&root, "other", Some(serde_json::json!("keep")))
        .unwrap()
        .commit()
        .unwrap();
    let first = prepare_compare_and_set(
        &root,
        "prefs",
        serde_json::Value::Null,
        serde_json::json!({"battery":true}),
    )
    .unwrap()
    .commit()
    .unwrap();
    assert_eq!(
        first,
        serde_json::json!({"swapped":true,"currentValue":{"battery":true}})
    );
    let stale = prepare_compare_and_set(
        &root,
        "prefs",
        serde_json::Value::Null,
        serde_json::json!({"battery":false}),
    )
    .unwrap()
    .commit()
    .unwrap();
    assert_eq!(
        stale,
        serde_json::json!({"swapped":false,"currentValue":{"battery":true}})
    );
    assert_eq!(
        prepare(&root, "other", None).unwrap().commit().unwrap(),
        "keep"
    );
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn two_storage_callers_compare_and_commit_under_the_shared_plugin_gate() {
    use std::sync::{Arc, Barrier};
    use zero_lib::plugins::{lifecycle::LifecycleCoordinator, storage::prepare_compare_and_set};
    let root = std::env::temp_dir().join(format!("zero-storage-two-views-{}", std::process::id()));
    let gate = Arc::new(LifecycleCoordinator::default());
    let barrier = Arc::new(Barrier::new(2));
    let threads = (0..2)
        .map(|view| {
            let gate = gate.clone();
            let barrier = barrier.clone();
            let root = root.clone();
            std::thread::spawn(move || {
                barrier.wait();
                gate.run("storage:test.tool", || {
                    Ok(prepare_compare_and_set(
                        &root,
                        "prefs",
                        serde_json::Value::Null,
                        serde_json::json!({"view":view}),
                    )
                    .unwrap()
                    .commit()
                    .unwrap())
                })
                .unwrap()
            })
        })
        .collect::<Vec<_>>();
    let outcomes = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        outcomes
            .iter()
            .filter(|outcome| outcome["swapped"] == true)
            .count(),
        1
    );
    let persisted = prepare(&root, "prefs", None).unwrap().commit().unwrap();
    assert!(outcomes
        .iter()
        .all(|outcome| outcome["currentValue"] == persisted));
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    fs::remove_dir_all(root).unwrap();
}
