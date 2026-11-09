use crate::plugins::contracts::{PluginHealth, PluginRecord};
use serde::Serialize;

#[cfg(target_os = "macos")]
mod editing;
#[cfg(target_os = "macos")]
mod native;
#[cfg(target_os = "macos")]
pub use native::{initialize, refresh, AppMenuState};

const TOOL_MENU_PREFIX: &str = "zero.app-menu.tool:";
pub const EDIT_EVENT: &str = "zero://native-menu-edit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MenuLanguage {
    Chinese,
    English,
}

impl From<&str> for MenuLanguage {
    fn from(language: &str) -> Self {
        if language.starts_with("zh") {
            Self::Chinese
        } else {
            Self::English
        }
    }
}

impl MenuLanguage {
    fn text(self, chinese: &'static str, english: &'static str) -> &'static str {
        match self {
            Self::Chinese => chinese,
            Self::English => english,
        }
    }

    fn groups(self) -> [&'static str; 5] {
        [
            "Zero",
            self.text("工具", "Tools"),
            self.text("编辑", "Edit"),
            self.text("窗口", "Window"),
            self.text("帮助", "Help"),
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MenuTool {
    plugin_id: String,
    title: String,
}

fn tool_available(record: &PluginRecord) -> bool {
    record.enabled && matches!(record.health, PluginHealth::Ready | PluginHealth::Active)
}

fn menu_tools(records: &[PluginRecord]) -> Vec<MenuTool> {
    records
        .iter()
        .filter(|record| tool_available(record))
        .map(|record| MenuTool {
            plugin_id: record.name.clone(),
            title: record
                .manifest
                .display_name
                .clone()
                .unwrap_or_else(|| record.name.clone()),
        })
        .collect()
}

fn available_tool<'a>(records: &'a [PluginRecord], menu_id: &str) -> Option<&'a str> {
    let id = menu_id.strip_prefix(TOOL_MENU_PREFIX)?;
    records
        .iter()
        .find(|record| record.name == id && tool_available(record))
        .map(|record| record.name.as_str())
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NativeMenuEditAction {
    Undo,
    Redo,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeMenuEditPayload {
    pub action: NativeMenuEditAction,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugins::contracts::{PluginHealth, PluginManifest, PluginRecord, PluginSource};

    fn record(name: &str, enabled: bool, health: PluginHealth) -> PluginRecord {
        let manifest: PluginManifest = serde_json::from_value(serde_json::json!({
            "name": name, "version": "1.0.0", "author": "test", "main": "index.js",
            "permissions": [], "displayName": format!("Tool {name}")
        }))
        .unwrap();
        PluginRecord {
            name: name.into(),
            version: "1.0.0".into(),
            author: "test".into(),
            source: PluginSource::Bundled,
            enabled,
            health,
            manifest,
            protocol_manifest: None,
            installed_path: None,
            approved_permissions: vec![],
            package_sha256: None,
        }
    }

    #[test]
    fn localized_groups_are_compact_and_brand_is_stable() {
        assert_eq!(
            MenuLanguage::from("zh-CN").groups(),
            ["Zero", "工具", "编辑", "窗口", "帮助"]
        );
        assert_eq!(
            MenuLanguage::from("en-US").groups(),
            ["Zero", "Tools", "Edit", "Window", "Help"]
        );
        assert_eq!(MenuLanguage::from("zh_TW.UTF-8"), MenuLanguage::Chinese);
    }

    #[test]
    fn tools_follow_enabled_healthy_records_and_preserve_order() {
        let records = vec![
            record("a", true, PluginHealth::Ready),
            record("b", false, PluginHealth::Ready),
            record("c", true, PluginHealth::Active),
            record("d", true, PluginHealth::Disabled),
            record("e", true, PluginHealth::Incompatible),
            record("f", true, PluginHealth::Error),
        ];
        let tools = menu_tools(&records);
        assert_eq!(
            tools
                .iter()
                .map(|tool| tool.plugin_id.as_str())
                .collect::<Vec<_>>(),
            ["a", "c"]
        );
        assert_eq!(tools[0].title, "Tool a");
        assert!(menu_tools(&[]).is_empty());
        assert_eq!(available_tool(&records, "zero.app-menu.tool:a"), Some("a"));
        assert_eq!(available_tool(&records, "zero.app-menu.tool:b"), None);
        assert_eq!(available_tool(&records, "zero.app-menu.tool:missing"), None);
        assert_eq!(available_tool(&records, "zero.status-bar.quit"), None);
    }

    #[test]
    fn edit_event_wire_format_matches_frontend() {
        assert_eq!(
            serde_json::to_value(NativeMenuEditPayload {
                action: NativeMenuEditAction::Undo
            })
            .unwrap(),
            serde_json::json!({"action":"undo"})
        );
        assert_eq!(
            serde_json::to_value(NativeMenuEditPayload {
                action: NativeMenuEditAction::Redo
            })
            .unwrap(),
            serde_json::json!({"action":"redo"})
        );
    }
}
