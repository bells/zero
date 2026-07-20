use super::contracts::{QuickLauncherItemKind, QuickLauncherRunningState};
use super::model::{current_platform_key, stable_item_id, IndexedItem, LaunchTarget};
use super::search::build_search_fields;

struct SettingDefinition {
    id: &'static str,
    zh_title: &'static str,
    en_title: &'static str,
    aliases: &'static [&'static str],
    macos_uri: Option<&'static str>,
    windows_uri: Option<&'static str>,
}

const SETTINGS: &[SettingDefinition] = &[
    SettingDefinition {
        id: "general",
        zh_title: "通用",
        en_title: "General",
        aliases: &["general", "system", "系统", "ty"],
        macos_uri: Some("x-apple.systempreferences:com.apple.systempreferences.GeneralSettings"),
        windows_uri: Some("ms-settings:about"),
    },
    SettingDefinition {
        id: "display",
        zh_title: "显示器",
        en_title: "Display",
        aliases: &["display", "screen", "monitor", "显示", "xsq"],
        macos_uri: Some("x-apple.systempreferences:com.apple.preference.displays"),
        windows_uri: Some("ms-settings:display"),
    },
    SettingDefinition {
        id: "network",
        zh_title: "网络",
        en_title: "Network",
        aliases: &["network", "wifi", "internet", "网络", "wl"],
        macos_uri: Some("x-apple.systempreferences:com.apple.preference.network"),
        windows_uri: Some("ms-settings:network"),
    },
    SettingDefinition {
        id: "bluetooth",
        zh_title: "蓝牙",
        en_title: "Bluetooth",
        aliases: &["bluetooth", "bt", "蓝牙", "ly"],
        macos_uri: Some("x-apple.systempreferences:com.apple.preferences.bluetooth"),
        windows_uri: Some("ms-settings:bluetooth"),
    },
    SettingDefinition {
        id: "sound",
        zh_title: "声音",
        en_title: "Sound",
        aliases: &["sound", "audio", "volume", "声音", "sy"],
        macos_uri: Some("x-apple.systempreferences:com.apple.preference.sound"),
        windows_uri: Some("ms-settings:sound"),
    },
    SettingDefinition {
        id: "keyboard",
        zh_title: "键盘",
        en_title: "Keyboard",
        aliases: &["keyboard", "input", "键盘", "jp"],
        macos_uri: Some("x-apple.systempreferences:com.apple.Keyboard-Settings.extension"),
        windows_uri: Some("ms-settings:typing"),
    },
    SettingDefinition {
        id: "pointer",
        zh_title: "鼠标与触控板",
        en_title: "Mouse & Trackpad",
        aliases: &[
            "mouse",
            "trackpad",
            "pointer",
            "鼠标",
            "触控板",
            "sb",
            "ckb",
        ],
        macos_uri: Some("x-apple.systempreferences:com.apple.Trackpad-Settings.extension"),
        windows_uri: Some("ms-settings:mousetouchpad"),
    },
    SettingDefinition {
        id: "notifications",
        zh_title: "通知",
        en_title: "Notifications",
        aliases: &["notification", "notifications", "通知", "tz"],
        macos_uri: Some("x-apple.systempreferences:com.apple.Notifications-Settings.extension"),
        windows_uri: Some("ms-settings:notifications"),
    },
    SettingDefinition {
        id: "privacy-security",
        zh_title: "隐私与安全性",
        en_title: "Privacy & Security",
        aliases: &[
            "privacy",
            "security",
            "permissions",
            "隐私",
            "安全",
            "ys",
            "aq",
        ],
        macos_uri: Some("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension"),
        windows_uri: Some("ms-settings:privacy"),
    },
];

pub fn system_setting_items(language: &str) -> Vec<IndexedItem> {
    let platform = current_platform_key();
    SETTINGS
        .iter()
        .filter_map(|definition| {
            let uri = match platform {
                "macos" => definition.macos_uri,
                "windows" => definition.windows_uri,
                _ => None,
            }?;
            let title = if language.starts_with("zh") {
                definition.zh_title
            } else {
                definition.en_title
            };
            let aliases = definition
                .aliases
                .iter()
                .map(|value| (*value).to_string())
                .collect();
            Some(IndexedItem {
                id: stable_item_id(
                    platform,
                    QuickLauncherItemKind::SystemSetting,
                    definition.id,
                ),
                kind: QuickLauncherItemKind::SystemSetting,
                title: title.to_string(),
                subtitle: if language.starts_with("zh") {
                    "系统设置".into()
                } else {
                    "System Settings".into()
                },
                search: build_search_fields(title, aliases),
                target: LaunchTarget::SystemSetting { uri: uri.into() },
                icon_source: None,
                icon_key: None,
                source_modified_at: None,
                running: QuickLauncherRunningState::NotApplicable,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_defines_expected_setting_groups() {
        let ids = SETTINGS.iter().map(|item| item.id).collect::<Vec<_>>();
        for expected in [
            "general",
            "display",
            "network",
            "bluetooth",
            "sound",
            "keyboard",
            "pointer",
            "notifications",
            "privacy-security",
        ] {
            assert!(ids.contains(&expected));
        }
    }

    #[test]
    fn public_catalog_shape_does_not_serialize_private_uri() {
        let definition = &SETTINGS[0];
        let public = serde_json::json!({
            "id": definition.id,
            "title": definition.en_title,
            "aliases": definition.aliases,
        });
        assert!(!public.to_string().contains("systempreferences"));
        assert!(!public.to_string().contains("ms-settings"));
    }
}
