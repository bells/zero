use super::*;
use std::{fs, sync::atomic::AtomicUsize};
static NEXT: AtomicUsize = AtomicUsize::new(0);
fn root() -> PathBuf {
    std::env::temp_dir()
        .join(format!(
            "zero-diag-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ))
        .join("logs")
}
fn service() -> Arc<Diagnostics> {
    Diagnostics::new(root())
}
fn input(code: &str) -> EmitInput {
    EmitInput {
        level: Level::Warn,
        code: code.into(),
        phase: "execute".into(),
        outcome: Outcome::Failed,
    }
}
#[test]
fn input_does_not_accept_private_payloads_or_unknown_metadata() {
    for field in [
        "message", "path", "token", "query", "stack", "document", "pluginId",
    ] {
        let mut payload = serde_json::json!({"level":"warn", "code":"conversion.failed", "phase":"execute", "outcome":"failed"});
        payload[field] = serde_json::json!("/Users/private/secret.pdf?token=PRIVATE");
        assert!(serde_json::from_value::<EmitInput>(payload).is_err());
    }
    assert!(serde_json::from_str::<SafeMetadata>(r#"{"stderr":"private contents"}"#).is_err());
    let d = service();
    for code in [
        "https://example.com?token=private",
        "C:\\private\\file.docx",
        "secret\ncontent",
        "sk-proj-syntheticcredential",
        "ghp_syntheticcredential",
        "operation.github_pat_syntheticcredential",
        "xoxb-syntheticcredential",
        "",
        "CamelCase",
    ] {
        assert!(d
            .emit(
                Source::Extension,
                Some("example.tool"),
                input(code),
                SafeMetadata::default(),
                None
            )
            .is_err());
    }
    assert!(d.memory().unwrap().events.is_empty());
    d.shutdown();
}
#[test]
fn ring_coalesces_and_retains_only_bounded_events() {
    let d = service();
    for n in 0..220 {
        d.emit(
            Source::Native,
            Some("zero.file"),
            input(&format!("failure_{n}")),
            SafeMetadata::default(),
            None,
        )
        .unwrap();
    }
    assert_eq!(d.memory().unwrap().events.len(), 200);
    d.emit(
        Source::Native,
        Some("zero.file"),
        input("failure_219"),
        SafeMetadata::default(),
        None,
    )
    .unwrap();
    assert_eq!(d.memory().unwrap().events.back().unwrap().1.repeat_count, 2);
    d.shutdown();
}
#[test]
fn third_party_burst_and_verbose_are_enforced() {
    let d = service();
    for _ in 0..10 {
        d.emit(
            Source::Extension,
            Some("example.tool"),
            input("operation.failed"),
            SafeMetadata::default(),
            None,
        )
        .unwrap();
    }
    assert_eq!(
        d.emit(
            Source::Extension,
            Some("example.tool"),
            input("operation.failed"),
            SafeMetadata::default(),
            None
        )
        .unwrap_err()
        .code,
        "rateLimited"
    );
    let mut debug = input("operation.failed");
    debug.level = Level::Debug;
    assert!(d
        .emit(
            Source::Extension,
            Some("another.tool"),
            debug.clone(),
            SafeMetadata::default(),
            None
        )
        .is_err());
    d.set_mode(Mode::Verbose).unwrap();
    d.emit(
        Source::Extension,
        Some("another.tool"),
        debug,
        SafeMetadata::default(),
        None,
    )
    .unwrap();
    d.memory().unwrap().verbose_until = Some(Instant::now() - Duration::from_secs(1));
    assert_eq!(d.status().mode, Mode::Normal);
    d.shutdown();
}
#[test]
fn second_writer_degrades_and_business_data_survives_clear() {
    let path = root();
    let d = Diagnostics::new(path.clone());
    assert_eq!(d.status().persistence, PersistenceStatus::Healthy);
    let other = Diagnostics::new(path.clone());
    assert_eq!(other.status().persistence, PersistenceStatus::MemoryOnly);
    fs::write(path.join("business.txt"), "private").unwrap();
    d.native(
        Some("zero.file"),
        "execute",
        Outcome::Failed,
        SafeMetadata::default(),
        None,
    );
    d.clear().unwrap();
    assert_eq!(
        fs::read_to_string(path.join("business.txt")).unwrap(),
        "private"
    );
    assert!(d.memory().unwrap().events.is_empty());
    d.shutdown();
    other.shutdown();
}
#[test]
fn full_disk_budget_and_restart_cannot_bypass_limit() {
    let d = service();
    let storage = d.storage.as_ref().unwrap();
    let mut storage = storage.lock().unwrap();
    let date = OffsetDateTime::now_utc()
        .format(time::macros::format_description!(
            "[year]-[month]-[day]-[hour]"
        ))
        .unwrap();
    let path = storage.root.join(format!("zero-diagnostics.{date}.jsonl"));
    let file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&path)
        .unwrap();
    file.set_len(storage::FILE_BYTES).unwrap();
    let event = br#"{"storageEpoch":0}"#;
    assert_eq!(
        storage.write_at(event, OffsetDateTime::now_utc()).unwrap(),
        event.len()
    );
    assert_eq!(fs::metadata(&path).unwrap().len(), storage::FILE_BYTES);
    assert_eq!(storage.health.persistence(), PersistenceStatus::Degraded);
    drop(storage);
    d.shutdown();
}
#[cfg(unix)]
#[test]
fn symlink_storage_is_refused() {
    use std::os::unix::fs::symlink;
    let path = root();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let outside = path.parent().unwrap().join("outside");
    fs::create_dir(&outside).unwrap();
    symlink(&outside, &path).unwrap();
    let d = Diagnostics::new(path);
    assert_eq!(d.status().persistence, PersistenceStatus::MemoryOnly);
    assert!(fs::read_dir(outside).unwrap().next().is_none());
}
#[test]
fn frontend_window_and_tool_identity_are_bound() {
    let input = FrontendInput {
        plugin_id: Some("zero.snap".into()),
        event: EmitInput {
            level: Level::Error,
            code: "ui.render_failed".into(),
            phase: "ui".into(),
            outcome: Outcome::Failed,
        },
    };
    assert!(events::frontend_allowed("capture", &input));
    for label in [
        "plugin-123",
        "zero-file-engine",
        "launcher",
        "about",
        "unknown",
    ] {
        assert!(!events::frontend_allowed(label, &input));
    }
}
#[test]
fn preview_copy_is_exact_bounded_owned_and_revoked() {
    tauri::async_runtime::block_on(async {
        let d = service();
        d.register("zero.file", || {
            std::thread::sleep(Duration::from_millis(300));
            Ok(HealthSnapshot::state(HealthState::Ready))
        });
        let started = Instant::now();
        let p = d
            .preview(
                "about",
                "0.1.0",
                vec![CatalogEntry {
                    id: "zero.file".into(),
                    version: "1.0.0".into(),
                    enabled: true,
                    state: "installed".into(),
                }],
            )
            .await
            .unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(!p.omissions.is_empty());
        assert_eq!(d.copy_text("about", &p.preview_id).unwrap(), p.text);
        assert!(d.copy_text("plugin-123", &p.preview_id).is_err());
        assert!(p.text.len() <= 65536);
        d.clear().unwrap();
        assert!(d.copy_text("about", &p.preview_id).is_err());
        d.shutdown();
    });
}

#[test]
fn shared_wire_corpus_matches_rust_validation() {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/diagnostics/inputs.json"
    ))
    .unwrap();
    for case in corpus.as_array().unwrap() {
        let parsed = serde_json::from_value::<EmitInput>(case["input"].clone()).ok();
        assert_eq!(
            parsed.is_some_and(|i| events::validate(&i).is_ok()),
            case["valid"].as_bool().unwrap(),
            "{}",
            case["name"]
        );
    }
}
#[test]
fn queue_saturation_is_observable_and_records_remain_json_lines() {
    let d = service();
    let locked = d.storage.as_ref().unwrap().lock().unwrap();
    for i in 0..900 {
        d.emit(
            Source::Native,
            Some("zero.file"),
            input(&format!("failure_{i}")),
            SafeMetadata::default(),
            None,
        )
        .unwrap();
    }
    assert!(d.status().dropped_events > 0);
    assert_eq!(d.status().persistence, PersistenceStatus::Degraded);
    assert_eq!(d.memory().unwrap().events.len(), 200);
    let root = locked.root.clone();
    drop(locked);
    d.shutdown();
    for p in fs::read_dir(root)
        .unwrap()
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "jsonl"))
    {
        let text = fs::read_to_string(p).unwrap();
        assert!(!text.is_empty());
        for line in text.lines() {
            let json: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(json["schemaVersion"], 1);
            assert!(!json.to_string().contains("private"));
        }
    }
}
#[test]
fn stale_queued_records_are_not_persisted_after_clear() {
    let d = service();
    d.clear().unwrap();
    let mut storage = d.storage.as_ref().unwrap().lock().unwrap();
    let stale = b"{\"storageEpoch\":0}\n";
    storage.write_at(stale, OffsetDateTime::now_utc()).unwrap();
    for p in fs::read_dir(&storage.root)
        .unwrap()
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "jsonl"))
    {
        assert_eq!(fs::metadata(p).unwrap().len(), 0);
    }
    drop(storage);
    d.shutdown();
}

#[test]
fn preview_in_flight_is_revoked_when_about_closes() {
    tauri::async_runtime::block_on(async {
        let d = service();
        let owner = Arc::downgrade(&d);
        d.register("zero.file", move || {
            owner.upgrade().unwrap().revoke_previews("about");
            Ok(HealthSnapshot::state(HealthState::Ready))
        });
        let result = d
            .preview(
                "about",
                "0.1.0",
                vec![CatalogEntry {
                    id: "zero.file".into(),
                    version: "0.1.0".into(),
                    enabled: true,
                    state: "ready".into(),
                }],
            )
            .await;
        assert_eq!(result.unwrap_err().code, "previewExpired");
        assert!(d.memory().unwrap().previews.is_empty());
        d.shutdown();
    });
}

#[test]
fn preview_leases_expire_and_restart_resets_verbose() {
    tauri::async_runtime::block_on(async {
        let path = root();
        let d = Diagnostics::new(path.clone());
        d.set_mode(Mode::Verbose).unwrap();
        let p = d.preview("about", "0.1.0", vec![]).await.unwrap();
        d.memory().unwrap().previews.front_mut().unwrap().created -= Duration::from_secs(301);
        assert!(d.copy_text("about", &p.preview_id).is_err());
        let run_id = d.run_id.clone();
        d.shutdown();
        drop(d);
        let other = Diagnostics::new(path);
        assert_eq!(other.status().mode, Mode::Normal);
        assert_ne!(other.run_id, run_id);
        other.shutdown();
    });
}

#[test]
fn retention_and_restart_preserve_six_hour_files_and_private_permissions() {
    let path = root();
    let d = Diagnostics::new(path.clone());
    d.shutdown();
    drop(d);
    for hour in 0..9 {
        let file = path.join(format!("zero-diagnostics.2026-01-01-{hour:02}.jsonl"));
        fs::write(file, b"{}\n").unwrap();
    }
    let d = Diagnostics::new(path.clone());
    let storage = d.storage.as_ref().unwrap().lock().unwrap();
    assert!(
        fs::read_dir(&path)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|v| v == "jsonl"))
            .count()
            <= 6
    );
    let old = path.join("zero-diagnostics.2025-01-01-00.jsonl");
    fs::write(&old, b"{}\n").unwrap();
    let time = std::time::SystemTime::now() - Duration::from_secs(8 * 86400);
    fs::OpenOptions::new()
        .write(true)
        .open(&old)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(time))
        .unwrap();
    storage.cleanup(std::time::SystemTime::now()).unwrap();
    assert!(!old.exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o700
        );
        for entry in fs::read_dir(&path).unwrap().filter_map(Result::ok) {
            assert_eq!(
                entry.metadata().unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
    drop(storage);
    d.shutdown();
}

#[cfg(unix)]
#[test]
fn storage_replacement_and_clear_failure_remain_visible_without_touching_business_data() {
    use std::{io::Write, os::unix::fs::symlink};
    let path = root();
    let d = Diagnostics::new(path.clone());
    let business = path.parent().unwrap().join("business");
    fs::create_dir(&business).unwrap();
    fs::write(business.join("document.txt"), b"PRIVATE_DOC").unwrap();
    let moved = path.with_extension("old");
    fs::rename(&path, moved).unwrap();
    symlink(&business, &path).unwrap();
    let mut writer = storage::SafeWriter(d.storage.as_ref().unwrap().clone());
    writer.write_all(b"{\"storageEpoch\":0}\n").unwrap();
    assert_eq!(d.status().persistence, PersistenceStatus::Degraded);
    assert!(d.status().dropped_events > 0);
    assert!(d.clear().is_err());
    assert_eq!(
        fs::read(business.join("document.txt")).unwrap(),
        b"PRIVATE_DOC"
    );
    assert_eq!(fs::read_dir(business).unwrap().count(), 1);
    d.shutdown();
}

#[test]
fn shutdown_deadline_does_not_block_on_a_stalled_writer() {
    let d = service();
    let storage = d.storage.as_ref().unwrap().lock().unwrap();
    d.emit(
        Source::Native,
        Some("zero.file"),
        input("worker.failed"),
        SafeMetadata::default(),
        None,
    )
    .unwrap();
    let began = Instant::now();
    d.shutdown();
    assert!(began.elapsed() < Duration::from_millis(1300));
    drop(storage);
}

#[test]
fn operation_correlation_is_not_destroyed_by_event_coalescing() {
    let d = service();
    for id in ["a".repeat(32), "b".repeat(32)] {
        d.emit(
            Source::Native,
            Some("zero.file"),
            input("execute.failed"),
            SafeMetadata::default(),
            Some(id),
        )
        .unwrap();
    }
    assert_eq!(d.memory().unwrap().events.len(), 2);
    d.shutdown();
}

#[test]
fn bounded_metadata_rejects_unknown_values_and_versions_are_scrubbed() {
    for payload in [
        r#"{"count":4294967296}"#,
        r#"{"count":-1}"#,
        r#"{"durationMs":1.5}"#,
        r#"{"backend":"PRIVATE"}"#,
        r#"{"count":1,"path":"/Users/private"}"#,
    ] {
        assert!(serde_json::from_str::<SafeMetadata>(payload).is_err());
    }
    assert_eq!(safe_version(&Some("1.2.3".into())), Some("1.2.3".into()));
    for v in [
        "/Users/private/tool",
        "https://host?token=SECRET",
        "PRIVATE DOC",
        "1.2\nsecret",
    ] {
        assert!(safe_version(&Some(v.into())).is_none());
    }
}

#[test]
fn support_payloads_never_accept_text_paths_urls_or_unknown_modes() {
    for payload in [
        r#"{"previewId":"p","text":"PRIVATE"}"#,
        r#"{"previewId":"p","path":"/Users/private"}"#,
        r#"{"previewId":null}"#,
    ] {
        assert!(serde_json::from_str::<PreviewCopyInput>(payload).is_err());
    }
    assert!(serde_json::from_str::<SupportLinkInput>(
        r#"{"target":"issues","url":"https://evil"}"#
    )
    .is_err());
    assert!(serde_json::from_str::<SupportLinkInput>(r#"{"target":"https://evil"}"#).is_err());
    assert!(serde_json::from_str::<ModeInput>(r#"{"mode":"forever"}"#).is_err());
    assert!(serde_json::from_str::<ModeInput>(r#"{"mode":"verbose","seconds":99999}"#).is_err());
}

#[test]
fn io_failures_are_accounted_without_retrying_business_operations_or_error_text() {
    let health = WriterHealth::default();
    for kind in [
        std::io::ErrorKind::PermissionDenied,
        std::io::ErrorKind::StorageFull,
        std::io::ErrorKind::BrokenPipe,
    ] {
        let result = Err(std::io::Error::new(kind, "/Users/private/DOC?token=SECRET"));
        assert_eq!(storage::account_write(&health, result, 123), 123);
        assert_eq!(health.persistence(), PersistenceStatus::Degraded);
    }
    assert_eq!(health.dropped.load(Ordering::Relaxed), 3);
}

#[test]
fn file_failure_stages_remain_distinct_in_the_support_preview() {
    tauri::async_runtime::block_on(async {
        let cases: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../tests/fixtures/diagnostics/file-stages.json"
        ))
        .unwrap();
        let d = service();
        for case in cases.as_array().unwrap() {
            let input: EmitInput = serde_json::from_value(serde_json::json!({"level": if case["outcome"] == "cancelled" { "info" } else { "warn" }, "code":case["code"], "phase":case["phase"], "outcome":case["outcome"]})).unwrap();
            assert!(events::native_catalog(Some("zero.file"), &input.phase));
            d.emit(
                Source::Native,
                Some("zero.file"),
                input,
                Default::default(),
                None,
            )
            .unwrap();
        }
        let preview = d.preview("about", "0.1.0", vec![]).await.unwrap();
        for code in [
            "policy.result",
            "signature.result",
            "assets.result",
            "readiness.timeout",
            "provider.failed",
        ] {
            assert!(preview.text.contains(code));
        }
        assert!(!preview.text.contains("execute.cancelled"));
        assert_eq!(d.memory().unwrap().events.len(), 9);
        d.shutdown();
    });
}

#[test]
#[ignore = "explicit diagnostic admission and snapshot measurement"]
fn diagnostics_admission_measurement() {
    tauri::async_runtime::block_on(async {
        for mode in [Mode::Normal, Mode::Verbose] {
            let d = service();
            d.set_mode(mode).unwrap();
            let level = if mode == Mode::Normal {
                Level::Info
            } else {
                Level::Debug
            };
            let began = Instant::now();
            for id in events::TOOLS {
                d.register(id, || Ok(HealthSnapshot::state(HealthState::Ready)));
            }
            for i in 0..10000 {
                let mut event = input(&format!("sample_{i}"));
                event.level = level;
                d.emit(
                    Source::Native,
                    Some("zero.file"),
                    event,
                    SafeMetadata::default(),
                    None,
                )
                .unwrap();
            }
            let admission = began.elapsed();
            let snapshot_start = Instant::now();
            let catalog = events::TOOLS
                .iter()
                .map(|id| CatalogEntry {
                    id: (*id).into(),
                    version: "1.0.0".into(),
                    enabled: true,
                    state: "ready".into(),
                })
                .collect();
            let preview = d.preview("about", "0.1.0", catalog).await.unwrap();
            let snapshot = snapshot_start.elapsed();
            let status = d.status();
            assert!(preview.text.len() <= 65536);
            assert_eq!(d.memory().unwrap().events.len(), 200);
            d.shutdown();
            let storage = d.storage.as_ref().unwrap().lock().unwrap();
            let bytes: u64 = fs::read_dir(&storage.root)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|e| e.path().extension().is_some_and(|v| v == "jsonl"))
                .map(|e| e.metadata().unwrap().len())
                .sum();
            assert!(bytes <= 24 * 1024 * 1024);
            println!("mode={mode:?} events=10000 admission_ms={:.3} avg_us={:.3} snapshot_ms={:.3} preview_bytes={} file_bytes={bytes} dropped={} persistence={:?} headless=true", admission.as_secs_f64()*1000.0, admission.as_secs_f64()*100.0, snapshot.as_secs_f64()*1000.0, preview.text.len(), status.dropped_events, status.persistence);
        }
    });
}
