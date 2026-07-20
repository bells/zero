use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::contracts::{QuickLauncherItemKind, QuickLauncherRunningState};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchTarget {
    Application {
        path: PathBuf,
        bundle_id: Option<String>,
        executable_path: Option<PathBuf>,
    },
    SystemSetting {
        uri: String,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFields {
    pub normalized_title: String,
    pub pinyin_full: String,
    pub pinyin_initials: String,
    pub word_initials: String,
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedItem {
    pub id: String,
    pub kind: QuickLauncherItemKind,
    pub title: String,
    pub subtitle: String,
    pub search: SearchFields,
    pub target: LaunchTarget,
    pub icon_source: Option<PathBuf>,
    pub icon_key: Option<String>,
    pub source_modified_at: Option<u64>,
    #[serde(skip, default = "unknown_running_state")]
    pub running: QuickLauncherRunningState,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageEntry {
    pub count: u64,
    pub last_used_at: u64,
}

pub type UsageMap = HashMap<String, UsageEntry>;

pub fn stable_item_id(platform: &str, kind: QuickLauncherItemKind, identity: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(platform.as_bytes());
    hasher.update(b"\0");
    hasher.update(match kind {
        QuickLauncherItemKind::Application => b"application".as_slice(),
        QuickLauncherItemKind::SystemSetting => b"setting".as_slice(),
    });
    hasher.update(b"\0");
    hasher.update(identity.as_bytes());
    let digest = hasher.finalize();
    let short_hash = digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let prefix = match kind {
        QuickLauncherItemKind::Application => "app",
        QuickLauncherItemKind::SystemSetting => "setting",
    };
    format!("{prefix}:{platform}:{short_hash}")
}

pub fn current_platform_key() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "unsupported"
    }
}

fn unknown_running_state() -> QuickLauncherRunningState {
    QuickLauncherRunningState::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_ids_are_deterministic_and_platform_scoped() {
        let first = stable_item_id(
            "macos",
            QuickLauncherItemKind::Application,
            "com.apple.Safari",
        );
        let second = stable_item_id(
            "macos",
            QuickLauncherItemKind::Application,
            "com.apple.Safari",
        );
        let windows = stable_item_id(
            "windows",
            QuickLauncherItemKind::Application,
            "com.apple.Safari",
        );
        let setting = stable_item_id("macos", QuickLauncherItemKind::SystemSetting, "display");

        assert_eq!(first, second);
        assert_ne!(first, windows);
        assert_ne!(first, setting);
        assert!(first.starts_with("app:macos:"));
    }
}
