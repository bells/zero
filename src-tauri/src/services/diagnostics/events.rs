use super::contracts::*;

pub const TOOLS: [&str; 5] = [
    "zero.snap",
    "zero.awake",
    "zero.paper",
    "zero.launch",
    "zero.file",
];
pub fn identifier(value: &str, limit: usize) -> bool {
    !value.is_empty()
        && value.len() <= limit
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_.-".contains(&b))
}
pub fn validate(input: &EmitInput) -> Result<(), DiagnosticsError> {
    if !identifier(&input.code, 64)
        || !identifier(&input.phase, 32)
        || credential_pattern(&input.code)
        || credential_pattern(&input.phase)
    {
        return Err(DiagnosticsError::new("invalidInput"));
    }
    Ok(())
}
fn credential_pattern(value: &str) -> bool {
    [
        "sk-",
        "sk_live_",
        "sk_test_",
        "ghp_",
        "gho_",
        "github_pat_",
        "xoxb-",
        "xoxp-",
    ]
    .iter()
    .any(|prefix| {
        value
            .match_indices(prefix)
            .any(|(at, _)| at == 0 || value.as_bytes()[at - 1] == b'.')
    })
}
// Codes and phases for trusted producers are compile-time values, never exception text.
pub fn native_catalog(plugin: Option<&str>, phase: &str) -> bool {
    let allowed = match plugin {
        None => &[
            "bootstrap",
            "migration",
            "window",
            "shortcut",
            "status-bar",
            "autostart",
            "registry",
            "market",
            "package",
            "lifecycle",
            "shutdown",
        ][..],
        Some("zero.snap") => &[
            "capture",
            "permission",
            "targets",
            "session",
            "commit",
            "copy",
            "save",
            "pin",
            "cleanup",
        ][..],
        Some("zero.awake") => &["enable", "disable", "expiry", "backend", "cleanup"][..],
        Some("zero.paper") => &[
            "fetch", "download", "cache", "preview", "apply", "export", "cleanup",
        ][..],
        Some("zero.launch") => &[
            "initialize",
            "index",
            "cache",
            "watcher",
            "shortcut",
            "activate",
            "focus",
            "settings",
            "cleanup",
        ][..],
        Some("zero.file") => &[
            "provider",
            "policy",
            "identity",
            "signature",
            "assets",
            "engine-create",
            "readiness",
            "validate",
            "execute",
            "cancel",
            "output",
            "cleanup",
        ][..],
        _ => &[][..],
    };
    allowed.contains(&phase)
}
pub fn frontend_allowed(label: &str, input: &FrontendInput) -> bool {
    let plugin = input.plugin_id.as_deref();
    let caller = match label {
        "main" | "tray" => plugin.is_some_and(|id| TOOLS.contains(&id)),
        "capture" | "snap-menu" => plugin == Some("zero.snap"),
        "launcher" => plugin == Some("zero.launch"),
        "paper" => plugin == Some("zero.paper"),
        pin if pin.starts_with("pin-") => plugin == Some("zero.snap"),
        _ => false,
    };
    caller
        && ["ui.render_failed", "ui.load_failed", "ui.transport_failed"]
            .contains(&input.event.code.as_str())
        && input.event.phase == "ui"
        && input.event.level == Level::Error
        && input.event.outcome == Outcome::Failed
}
