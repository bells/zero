use serde::{Deserialize, Serialize};

use super::capabilities::HostCapability;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginHostCapabilities {
    pub host_version: String,
    pub api_version: String,
    pub runtime_enabled: bool,
    pub capabilities: Vec<HostCapability>,
}

pub fn implemented_capabilities() -> Vec<HostCapability> {
    // Compiled private commands are not public plugin providers.
    let mut ids = vec![
        "storage.plugin",
        "ui.message",
        "diagnostics.emit",
        "network.fetch",
    ];
    if cfg!(any(target_os = "macos", target_os = "windows")) {
        ids.extend([
            "power.lease",
            "background.events",
            "media.image",
            "system.wallpaper",
            "files.export",
        ]);
    }
    ids.into_iter()
        .map(|id| HostCapability {
            id: id.into(),
            version: if id == "power.lease" || id == "storage.plugin" {
                "1.1.0"
            } else {
                "1.0.0"
            }
            .into(),
        })
        .collect()
}

pub fn plugin_host_capabilities() -> PluginHostCapabilities {
    PluginHostCapabilities {
        host_version: env!("CARGO_PKG_VERSION").into(),
        api_version: super::protocol::API_VERSION.into(),
        runtime_enabled: super::protocol::web_runtime_enabled(),
        capabilities: implemented_capabilities(),
    }
}
