use std::time::{Duration, Instant};
use zero_lib::plugins::protocol::PluginRequest;
use zero_lib::plugins::session::{SessionOwner, Sessions};

fn owner(id: &str) -> SessionOwner {
    SessionOwner {
        plugin_id: id.into(),
        version: "1.0.0".into(),
        digest: "ab".repeat(32),
        root: std::env::temp_dir().join(id),
        view_id: format!("{id}.main"),
        revision: 1,
        permissions: vec!["storage.plugin".into()],
    }
}
fn request(id: &str, generation: u64) -> PluginRequest {
    serde_json::from_value(serde_json::json!({"protocolVersion":"1.0.0","requestId":"r1","sessionId":id,"generation":generation,"method":"storage.set","payload":{"key":"notes","value":"hello"}})).unwrap()
}
#[test]
fn caller_generation_readiness_and_live_grants_are_authoritative() {
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let live = owner("test.notes");
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    let req = request(&info.session_id, info.generation);
    assert!(sessions.begin(&caller, &req, &live, true, now).is_err());
    assert!(sessions
        .ready(&info.session_id, "main", info.generation, now)
        .is_err());
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    assert!(sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .is_err());
    assert!(sessions
        .begin("plugin-other", &req, &live, true, now)
        .is_err());
    let mut bad = req.clone();
    bad.generation += 1;
    assert!(sessions.begin(&caller, &bad, &live, true, now).is_err());
    assert!(sessions.begin(&caller, &req, &live, false, now).is_err());
    let mut denied = live.clone();
    denied.permissions.clear();
    assert!(sessions.begin(&caller, &req, &denied, true, now).is_err());
    assert!(sessions
        .begin(&caller, &req, &owner("test.other"), true, now)
        .is_err());
    sessions.begin(&caller, &req, &live, true, now).unwrap();
    assert!(sessions.begin(&caller, &req, &live, true, now).is_err());
    assert!(sessions
        .can_commit(&caller, &req, now + Duration::from_secs(10))
        .is_err());
    sessions.finish(&caller, &req, now).unwrap();
    assert!(sessions.can_commit(&caller, &req, now).is_err());
    assert!(sessions.begin(&caller, &req, &live, true, now).is_err());
    assert_eq!(sessions.revoke("test.notes"), vec![caller.clone()]);
    assert!(sessions.begin(&caller, &req, &live, true, now).is_err());
    assert!(sessions.revoke("test.notes").is_empty());
}
#[test]
fn sessions_enforce_inflight_payload_and_ready_limits() {
    let now = Instant::now();
    let live = owner("test.notes");
    let mut sessions = Sessions::default();
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    assert!(sessions
        .ready(
            &info.session_id,
            &caller,
            info.generation,
            now + Duration::from_secs(5)
        )
        .is_err());
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let mut req = request(&info.session_id, info.generation);
    req.payload["value"] = serde_json::json!("a".repeat(65536));
    assert!(sessions.begin(&caller, &req, &live, true, now).is_err());
    req.payload["value"] = serde_json::Value::Null;
    for i in 0..32 {
        req.request_id = format!("r{i}");
        sessions.begin(&caller, &req, &live, true, now).unwrap();
    }
    req.request_id = "overflow".into();
    assert!(sessions.begin(&caller, &req, &live, true, now).is_err());
    sessions.close_window(&caller);
    assert!(sessions
        .get(&info.session_id, &caller, info.generation)
        .is_err());
}

#[test]
fn cancellation_before_dispatch_prevents_late_side_effects() {
    let now = Instant::now();
    let owner = owner("test.notes");
    let mut sessions = Sessions::default();
    let info = sessions.issue(owner.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let request = request(&info.session_id, info.generation);
    sessions.finish(&caller, &request, now).unwrap();
    assert_eq!(
        sessions
            .begin(&caller, &request, &owner, true, now)
            .unwrap_err()
            .code,
        "request.duplicate"
    );
}
