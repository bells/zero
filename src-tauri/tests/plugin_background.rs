use serde_json::json;
use zero_lib::plugins::protocol::PluginRequest;

#[test]
fn schedule_wire_is_strict_safe_and_available() {
    let request = |method: &str, payload: serde_json::Value| {
        serde_json::from_value::<PluginRequest>(json!({"protocolVersion":"1.0.0","requestId":"r1","sessionId":"s1","generation":1,"method":method,"payload":payload})).unwrap().decode_method()
    };
    assert!(request(
        "schedule.upsert",
        json!({"taskId":"daily","eventId":"scheduled.daily","nextAtMs":100,"payload":null})
    )
    .is_ok());
    assert!(request("schedule.cancel", json!({"taskId":"daily"})).is_ok());
    assert!(request(
        "background.complete",
        json!({"outcome":"completed","nextAtMs":null})
    )
    .is_ok());
    for payload in [
        json!({"taskId":"daily","eventId":"scheduled.daily","nextAtMs":9007199254740992u64,"payload":null}),
        json!({"taskId":"daily","eventId":"scheduled.daily","nextAtMs":1,"payload":null,"pluginId":"peer"}),
    ] {
        assert!(request("schedule.upsert", payload).is_err());
    }
    for payload in [
        json!({"outcome":"completed"}),
        json!({"outcome":"unknown","nextAtMs":null}),
        json!({"outcome":"completed","nextAtMs":-1}),
    ] {
        assert!(request("background.complete", payload).is_err());
    }
}

#[test]
fn native_background_context_and_kind_cannot_be_forged_by_a_surface_string() {
    use std::time::Instant;
    use zero_lib::plugins::{
        scheduler::{Occurrence, Owner, Schedule},
        session::{SessionOwner, Sessions},
    };
    let now = Instant::now();
    let owner = SessionOwner {
        plugin_id: "test.bg".into(),
        version: "1.0.0".into(),
        digest: "ab".repeat(32),
        root: std::env::temp_dir(),
        view_id: "background".into(),
        revision: 1,
        permissions: vec!["background.schedule".into(), "ui.message".into()],
    };
    let occurrence = Occurrence {
        owner: Owner {
            plugin_id: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
        },
        schedule: Schedule {
            task_id: "daily".into(),
            event_id: "scheduled.daily".into(),
            next_at_ms: 0,
            payload: json!({"opaque":42}),
        },
        generation: 2,
        occurrence_id: "ab".repeat(16),
        attempt: 1,
    };
    let mut sessions = Sessions::default();
    let view = sessions.issue(owner.clone(), now).unwrap();
    assert!(serde_json::to_value(&view)
        .unwrap()
        .get("background")
        .is_none());
    let bg = sessions
        .issue_background(
            owner.clone(),
            occurrence.clone(),
            "bg.js".into(),
            zero_lib::services::continuous_clock::now_ms().unwrap(),
            now,
        )
        .unwrap();
    assert_eq!(
        serde_json::to_value(&bg).unwrap()["background"],
        json!({"taskId":"daily","eventId":"scheduled.daily","occurrenceId":"ab".repeat(16),"attempt":1,"payload":{"opaque":42},"scheduleGeneration":2})
    );
    for (info, method, payload, allowed) in [
        (
            &view,
            "background.complete",
            json!({"outcome":"completed","nextAtMs":null}),
            false,
        ),
        (
            &bg,
            "ui.showMessage",
            json!({"message":"hidden dialog"}),
            false,
        ),
        (
            &bg,
            "background.complete",
            json!({"outcome":"completed","nextAtMs":null}),
            true,
        ),
    ] {
        let caller = format!("plugin-{}", info.session_id);
        let _ = sessions.ready(&info.session_id, &caller, info.generation, now);
        let req=serde_json::from_value::<PluginRequest>(json!({"protocolVersion":"1.0.0","requestId":format!("r{method}").replace('.',"_"),"sessionId":info.session_id,"generation":info.generation,"method":method,"payload":payload})).unwrap();
        assert_eq!(
            sessions.begin(&caller, &req, &owner, true, now).is_ok(),
            allowed,
            "{method}"
        );
    }
}

#[test]
fn native_event_context_rejects_unknown_fields_and_out_of_bounds_wire_values() {
    use zero_lib::plugins::protocol::BackgroundEventContext;
    let valid = json!({"taskId":"daily","eventId":"scheduled.daily","occurrenceId":"ab".repeat(16),"attempt":1,"payload":{"opaque":42},"scheduleGeneration":2});
    assert!(serde_json::from_value::<BackgroundEventContext>(valid.clone()).is_ok());
    for (field, value) in [
        ("extra", json!(true)),
        ("taskId", json!("../peer")),
        ("eventId", json!("unregistered event!")),
        ("occurrenceId", json!("not-an-occurrence")),
        ("attempt", json!(0)),
        ("attempt", json!(33)),
        ("scheduleGeneration", json!(0)),
        ("scheduleGeneration", json!(9007199254740992u64)),
        ("payload", json!("x".repeat(16384))),
    ] {
        let mut candidate = valid.clone();
        candidate[field] = value;
        assert!(
            serde_json::from_value::<BackgroundEventContext>(candidate).is_err(),
            "{field}"
        );
    }
}

#[test]
fn schedule_requires_both_original_and_live_grants_and_cannot_accept_owner_claims() {
    use std::time::Instant;
    use zero_lib::plugins::session::{SessionOwner, Sessions};
    let now = Instant::now();
    let granted = SessionOwner {
        plugin_id: "test.bg".into(),
        version: "1.0.0".into(),
        digest: "ab".repeat(32),
        root: std::env::temp_dir(),
        view_id: "test.bg.main".into(),
        revision: 1,
        permissions: vec!["background.schedule".into()],
    };
    for original_grant in [false, true] {
        let mut original = granted.clone();
        if !original_grant {
            original.permissions.clear();
        }
        let mut sessions = Sessions::default();
        let info = sessions.issue(original, now).unwrap();
        let caller = format!("plugin-{}", info.session_id);
        sessions
            .ready(&info.session_id, &caller, info.generation, now)
            .unwrap();
        let request=serde_json::from_value::<PluginRequest>(json!({"protocolVersion":"1.0.0","requestId":"r1","sessionId":info.session_id,"generation":info.generation,"method":"schedule.upsert","payload":{"taskId":"daily","eventId":"scheduled.daily","nextAtMs":1,"payload":null}})).unwrap();
        assert_eq!(
            sessions
                .begin(&caller, &request, &granted, true, now)
                .is_ok(),
            original_grant
        );
        let mut revoked = granted.clone();
        revoked.permissions.clear();
        assert!(sessions
            .commit_live(&caller, &request, &revoked, true, now, || Ok(()))
            .is_err());
        let mut forged = request.clone();
        forged.payload["owner"] = json!({"pluginId":"peer"});
        assert!(forged.decode_method().is_err());
    }
}
