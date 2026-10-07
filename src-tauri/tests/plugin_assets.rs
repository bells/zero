use std::fs;
use std::time::Instant;
use tauri::http::Request;
use zero_lib::plugins::{
    session::SessionOwner,
    web_assets::{serve, WebSessions},
};

#[test]
fn asset_route_binds_native_caller_and_session_and_denies_traversal() {
    let root = std::env::temp_dir().join(format!("zero-assets-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("index.html"), "<!doctype html>").unwrap();
    let state = WebSessions::default();
    let info = state
        .0
        .lock()
        .unwrap()
        .issue(
            SessionOwner {
                plugin_id: "test.notes".into(),
                version: "1.0.0".into(),
                digest: "ab".repeat(32),
                root: root.clone(),
                view_id: "test.notes.main".into(),
                revision: 1,
                permissions: vec![],
            },
            Instant::now(),
        )
        .unwrap();
    let caller = format!("plugin-{}", info.session_id);
    let make = |path: &str| {
        Request::builder()
            .uri(format!("zero-plugin://{}/{path}", info.session_id))
            .body(vec![])
            .unwrap()
    };
    let response = serve(&state, &caller, &make("index.html"));
    assert_eq!(response.status(), 200);
    assert_eq!(response.body(), b"<!doctype html>");
    assert!(response.headers()["Content-Security-Policy"]
        .to_str()
        .unwrap()
        .contains("frame-src 'none'"));
    assert_eq!(serve(&state, "main", &make("index.html")).status(), 403);
    assert_eq!(
        serve(&state, "plugin-other", &make("index.html")).status(),
        403
    );
    for path in [
        "../index.html",
        "%2e%2e/index.html",
        "%252e%252e/index.html",
        "index.html?redirect=x",
        "./index.html",
    ] {
        assert_ne!(serve(&state, &caller, &make(path)).status(), 200, "{path}");
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(root.join("index.html"), root.join("alias.html")).unwrap();
        assert_eq!(serve(&state, &caller, &make("alias.html")).status(), 404);
    }
    state.0.lock().unwrap().revoke("test.notes");
    assert_eq!(serve(&state, &caller, &make("index.html")).status(), 403);
    fs::remove_dir_all(root).unwrap();
}
