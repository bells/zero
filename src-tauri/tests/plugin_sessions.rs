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
fn export_deadline_allows_view_commit_until_two_minutes() {
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let mut live = owner("test.paper");
    live.permissions.push("files.export".into());
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let ordinary = request(&info.session_id, info.generation);
    let export = PluginRequest {
        request_id: "export".into(),
        method: "media.exportImage".into(),
        payload: serde_json::json!({"assetId": "a".repeat(64), "suggestedName": "wallpaper.png"}),
        ..ordinary.clone()
    };
    sessions
        .begin(&caller, &ordinary, &live, true, now)
        .unwrap();
    sessions.begin(&caller, &export, &live, true, now).unwrap();

    assert_eq!(
        sessions
            .can_commit(&caller, &ordinary, now + Duration::from_secs(10))
            .unwrap_err()
            .code,
        "request.timeout"
    );
    for elapsed in [Duration::from_secs(11), Duration::from_millis(119_999)] {
        sessions
            .commit_live(&caller, &export, &live, true, now + elapsed, || Ok(()))
            .unwrap();
    }
    assert_eq!(
        sessions
            .commit_live::<()>(
                &caller,
                &export,
                &live,
                true,
                now + Duration::from_secs(120),
                || { panic!("expired export cannot publish") }
            )
            .unwrap_err()
            .code,
        "request.timeout"
    );
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

#[test]
fn diagnostic_admission_rechecks_live_permission_identity_and_cancellation() {
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let mut live = owner("test.notes");
    live.permissions.push("diagnostics.write".into());
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let mut req = request(&info.session_id, info.generation);
    req.method = "diagnostics.emit".into();
    req.payload = serde_json::json!({"level":"warn", "code":"operation.failed", "phase":"execute", "outcome":"failed"});
    let mut denied = live.clone();
    denied.permissions.retain(|p| p != "diagnostics.write");
    assert!(sessions.begin(&caller, &req, &denied, true, now).is_err());
    sessions.begin(&caller, &req, &live, true, now).unwrap();
    let effects = std::cell::Cell::new(0);
    let emit = || {
        effects.set(effects.get() + 1);
        Ok(serde_json::Value::Null)
    };
    assert!(sessions
        .commit_live(&caller, &req, &denied, true, now, emit)
        .is_err());
    assert!(sessions
        .commit_live(&caller, &req, &live, false, now, emit)
        .is_err());
    let mut changed = live.clone();
    changed.digest = "ef".repeat(32);
    assert!(sessions
        .commit_live(&caller, &req, &changed, true, now, emit)
        .is_err());
    changed = live.clone();
    changed.version = "2.0.0".into();
    assert!(sessions
        .commit_live(&caller, &req, &changed, true, now, emit)
        .is_err());
    assert!(sessions
        .commit_live("main", &req, &live, true, now, emit)
        .is_err());
    let mut stale = req.clone();
    stale.generation += 1;
    assert!(sessions
        .commit_live(&caller, &stale, &live, true, now, emit)
        .is_err());
    assert_eq!(effects.get(), 0);
    assert_eq!(
        sessions
            .commit_live(&caller, &req, &live, true, now, emit)
            .unwrap(),
        serde_json::Value::Null
    );
    sessions.finish(&caller, &req, now).unwrap();
    assert!(sessions
        .commit_live(&caller, &req, &live, true, now, emit)
        .is_err());
    req.request_id = "after-cancel".into();
    sessions.finish(&caller, &req, now).unwrap();
    assert!(sessions.begin(&caller, &req, &live, true, now).is_err());
    sessions.revoke(&live.plugin_id);
    assert!(sessions
        .commit_live(&caller, &req, &live, true, now, emit)
        .is_err());
    assert_eq!(effects.get(), 1);
}

#[test]
fn power_methods_require_live_permission_and_support_fresh_session_commit() {
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let mut live = owner("test.awake");
    live.permissions.push("power.preventSleep".into());
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let mut req = request(&info.session_id, info.generation);
    req.method = "power.acquire".into();
    req.payload = serde_json::json!({"durationMinutes": 30});
    assert!(
        req.decode_method().is_ok(),
        "power.acquire must be a bounded public method"
    );
    let mut denied = live.clone();
    denied.permissions.retain(|p| p != "power.preventSleep");
    assert_eq!(
        sessions
            .begin(&caller, &req, &denied, true, now)
            .unwrap_err()
            .code,
        "permission.denied"
    );
    sessions.begin(&caller, &req, &live, true, now).unwrap();
    let effects = std::cell::Cell::new(0);
    let effect = || {
        effects.set(effects.get() + 1);
        Ok(())
    };
    assert!(sessions
        .commit_live(&caller, &req, &denied, true, now, effect)
        .is_err());
    sessions
        .commit_live(&caller, &req, &live, true, now, effect)
        .unwrap();
    sessions.finish(&caller, &req, now).unwrap();
    assert!(sessions
        .commit_live(&caller, &req, &live, true, now, effect)
        .is_err());
    assert_eq!(effects.get(), 1);
}

#[test]
fn power_provider_catalog_is_independent_of_bundled_tools_and_honest_about_platform() {
    let ids = zero_lib::plugins::providers::implemented_capabilities()
        .into_iter()
        .map(|p| p.id)
        .collect::<Vec<_>>();
    assert_eq!(
        ids.contains(&"power.lease".into()),
        cfg!(any(target_os = "macos", target_os = "windows"))
    );
    for id in [
        "network",
        "capture",
        "wallpaper",
        "apps.index",
        "document.convert",
    ] {
        assert!(
            !ids.contains(&id.into()),
            "unimplemented provider {id} must not be advertised"
        );
    }
}

#[test]
fn power_request_contract_requires_explicit_duration_and_safe_lease_generation() {
    let mut req = request("session", 1);
    req.method = "power.acquire".into();
    for payload in [
        serde_json::json!({}),
        serde_json::json!({"durationMinutes":1.5}),
        serde_json::json!({"durationMinutes":30,"command":"anything"}),
    ] {
        req.payload = payload;
        assert!(
            req.decode_method().is_err(),
            "missing or malformed duration must not create an unlimited lease"
        );
    }
    for payload in [
        serde_json::json!({"durationMinutes":null}),
        serde_json::json!({"durationMinutes":30}),
    ] {
        req.payload = payload;
        assert!(req.decode_method().is_ok());
    }
    req.method = "power.release".into();
    req.payload = serde_json::json!({"leaseId":"opaque","generation":9007199254740992u64});
    assert!(
        req.decode_method().is_err(),
        "lease generations must fit SDK safe integers"
    );
}

#[test]
fn guarded_task_requests_are_explicit_permission_bound_and_closed() {
    let mut req = request("session", 1);
    req.method = "power.startTask".into();
    req.payload = serde_json::json!({"expectedGeneration":null,"expectedConditionsRevision":null,"schedule":{"kind":"until","expiresAtMs":2000000},"conditions":{"batteryThresholdPercent":10,"stopOnLowPowerMode":true,"allowLowBatteryStart":true}});
    assert!(
        req.decode_method().is_ok(),
        "guarded task method must be implemented"
    );
    assert_eq!(
        req.decode_method().unwrap().permission(),
        "power.preventSleep"
    );
    req.payload["arbitraryCommand"] = serde_json::json!("denied");
    assert!(req.decode_method().is_err());
    for method in ["power.taskStatus", "power.readSnapshot"] {
        req.method = method.into();
        req.payload = serde_json::json!({});
        assert_eq!(
            req.decode_method().unwrap().permission(),
            "power.preventSleep"
        );
    }
}

#[test]
fn storage_compare_and_set_is_closed_and_permission_bound() {
    let mut req = request("session", 1);
    req.method = "storage.compareAndSet".into();
    req.payload = serde_json::json!({"key":"prefs","expectedValue":null,"value":{"enabled":true}});
    assert_eq!(req.decode_method().unwrap().permission(), "storage.plugin");
    req.payload["unexpected"] = serde_json::json!(true);
    assert!(req.decode_method().is_err());
}

#[test]
fn network_cancel_before_admission_and_stale_final_owner_prevent_io_and_output() {
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let mut live = owner("test.network");
    live.permissions = vec!["network".into()];
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let mut req = request(&info.session_id, info.generation);
    req.method = "network.fetch".into();
    req.payload = serde_json::json!({"url":"https://example.com/data","method":"GET"});
    sessions.finish(&caller, &req, now).unwrap();
    assert_eq!(
        sessions
            .begin(&caller, &req, &live, true, now)
            .unwrap_err()
            .code,
        "request.duplicate"
    );
    req.request_id = "active-network".into();
    sessions.begin(&caller, &req, &live, true, now).unwrap();
    let network = zero_lib::services::network_fetch::NetworkFetchState::default();
    let _permit = sessions
        .commit_live(&caller, &req, &live, true, now, || {
            network.admit(&live, &req, vec!["https://example.com".into()], now)
        })
        .unwrap();
    for field in ["digest", "version", "root", "permissions", "disabled"] {
        let mut stale = live.clone();
        match field {
            "digest" => stale.digest = "cd".repeat(32),
            "version" => stale.version = "2.0.0".into(),
            "root" => stale.root = std::env::temp_dir().join("different-root"),
            "permissions" => stale.permissions.clear(),
            _ => {}
        }
        let mut delivered = false;
        assert!(sessions
            .commit_live(&caller, &req, &stale, field != "disabled", now, || {
                delivered = true;
                Ok(())
            })
            .is_err());
        assert!(!delivered, "{field} must refuse final output");
    }
    sessions.finish(&caller, &req, now).unwrap();
    assert!(sessions
        .commit_live(&caller, &req, &live, true, now, || Ok(()))
        .is_err());
    sessions.close_window(&caller);
    assert!(sessions
        .commit_live(&caller, &req, &live, true, now, || Ok(()))
        .is_err());
}

#[test]
fn application_activation_requires_all_original_and_live_grants() {
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let mut live = owner("test.apps");
    live.permissions = [
        "system.apps.read",
        "system.apps.execute",
        "system.window.focus",
    ]
    .map(str::to_owned)
    .to_vec();
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let activate = PluginRequest {
        method: "apps.activate".into(),
        payload: serde_json::json!({"catalogId":"a".repeat(64),"itemId":"b".repeat(64)}),
        ..request(&info.session_id, info.generation)
    };
    for grant in &live.permissions {
        let mut changed = live.clone();
        changed.permissions.retain(|p| p != grant);
        assert_eq!(
            sessions
                .begin(&caller, &activate, &changed, true, now)
                .unwrap_err()
                .code,
            "permission.denied"
        );
    }
    sessions
        .begin(&caller, &activate, &live, true, now)
        .unwrap();
    live.permissions
        .retain(|permission| permission != "system.window.focus");
    let denied = sessions.commit_live::<()>(&caller, &activate, &live, true, now, || {
        panic!("revoked focus grant must block activation")
    });
    assert_eq!(denied.unwrap_err().code, "permission.denied");
}

#[test]
fn document_dialogs_and_capture_uploads_keep_live_grants_and_bounded_deadlines() {
    let now = Instant::now();
    let mut sessions = Sessions::default();
    let mut live = owner("test.media");
    live.permissions = vec!["screen.capture".into(), "documents.convert".into()];
    let info = sessions.issue(live.clone(), now).unwrap();
    let caller = format!("plugin-{}", info.session_id);
    sessions
        .ready(&info.session_id, &caller, info.generation, now)
        .unwrap();
    let methods = [
        (
            "screen.commitCaptureExport",
            serde_json::json!({"leaseId": "a".repeat(64)}),
            "screen.capture",
        ),
        (
            "documents.chooseInput",
            serde_json::json!({}),
            "documents.convert",
        ),
        (
            "documents.start",
            serde_json::json!({"id": "b".repeat(64)}),
            "documents.convert",
        ),
    ];
    for (method, payload, permission) in methods {
        let req = PluginRequest {
            request_id: method.replace('.', "-"),
            method: method.into(),
            payload,
            ..request(&info.session_id, info.generation)
        };
        sessions.begin(&caller, &req, &live, true, now).unwrap();
        let admitted = now + Duration::from_secs(119);
        assert!(sessions
            .commit_live(&caller, &req, &live, true, admitted, || Ok(()))
            .is_ok());
        let mut revoked = live.clone();
        revoked.permissions.retain(|grant| grant != permission);
        assert_eq!(
            sessions
                .commit_live::<()>(&caller, &req, &revoked, true, admitted, || panic!(
                    "revoked grant must prevent native commit"
                ))
                .unwrap_err()
                .code,
            "permission.denied"
        );
        assert_eq!(
            sessions
                .can_commit(&caller, &req, now + Duration::from_secs(120))
                .unwrap_err()
                .code,
            "request.timeout"
        );
    }
}
