use tauri::{ipc::Invoke, Runtime};

pub fn plugin_command_allowed(command: &str) -> bool {
    matches!(
        command,
        "plugin_session_ready" | "plugin_invoke" | "plugin_cancel"
    )
}

/// Application commands are not protected by a capability allowlist by default.
/// Reserve plugin-* labels for the native session owner, including before ready.
pub fn gate<R: Runtime>(
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        if invoke.message.webview_ref().label().starts_with("plugin-")
            && !plugin_command_allowed(invoke.message.command())
        {
            invoke.resolver.reject(super::protocol::PluginError {
                code: "caller.denied".into(),
                message: "Plugin windows cannot invoke host commands".into(),
                retryable: false,
            });
            return true;
        }
        handler(invoke)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn application_command_gate_is_deny_by_default() {
        for command in [
            "quit_app",
            "install_plugin_package",
            "set_plugin_enabled",
            "get_file_capabilities",
            "plugin:opener|open_url",
            "unknown",
        ] {
            assert!(!plugin_command_allowed(command));
        }
        assert!(plugin_command_allowed("plugin_invoke"));
    }
}
