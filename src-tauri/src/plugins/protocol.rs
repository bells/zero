use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

use super::versions::{is_protocol_version, protocol_range, protocol_version_matches};

pub const API_VERSION: &str = "1.0.0";
// This is a conformance target, not a release approval.
pub const PUBLIC_WEB_RUNTIME_ENABLED: bool = false;

pub fn web_runtime_enabled() -> bool {
    PUBLIC_WEB_RUNTIME_ENABLED
        || (cfg!(all(debug_assertions, target_os = "macos"))
            && std::env::var("ZERO_PLUGIN_WEB_DEV").as_deref() == Ok("1"))
}

macro_rules! dto {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? }) => {
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        pub struct $name { $(pub $field: $ty),* }
    };
}

dto!(PluginEnginesV2 {
    zero: String,
    api: String
});
dto!(NetworkScope { allowed_origins: Vec<String> });
dto!(ViewContribution {
    id: String,
    title: String,
    surface: ViewSurface
});
dto!(CommandContribution {
    id: String,
    title: String,
    view_id: String
});
dto!(KeybindingContribution {
    command: String,
    default: String,
    description: String
});
dto!(StatusBarContribution {
    id: String,
    title: String,
    command: String,
    icon: String,
    visible_by_default: bool
});

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewSurface {
    Main,
    Tray,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum SettingContribution {
    Boolean {
        key: String,
        default: bool,
        label: String,
    },
    String {
        key: String,
        default: String,
        label: String,
    },
    Number {
        key: String,
        default: f64,
        label: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContributionsV2 {
    pub views: Vec<ViewContribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<CommandContribution>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keybindings: Option<Vec<KeybindingContribution>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_bar_items: Option<Vec<StatusBarContribution>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<Vec<SettingContribution>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifestV2 {
    #[serde(deserialize_with = "schema_integer")]
    pub schema_version: u16,
    pub name: String,
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub engines: PluginEnginesV2,
    pub platforms: Vec<String>,
    pub runtime: String,
    pub main: String,
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<NetworkScope>,
    pub contributes: ContributionsV2,
    pub activation_events: Vec<String>,
}

dto!(CompatibilityIssue {
    code: String, path: String, message: String, required: Option<String>, actual: Option<String>
});
dto!(CompatibilityReport {
    compatible: bool, profile: String, host_version: String,
    api_version: Option<String>, issues: Vec<CompatibilityIssue>
});
dto!(CheckPluginCompatibilityInput { manifest: Value });
dto!(PluginError {
    code: String,
    message: String,
    retryable: bool
});
dto!(SessionBinding {
    session_id: String,
    generation: u64
});
dto!(PluginSessionInfo {
    session_id: String,
    generation: u64,
    plugin_id: String,
    plugin_version: String,
    api_version: String,
    surface_id: String,
    registry_revision: u64
});
dto!(MessageInput { message: String });
dto!(StorageGetInput { key: String });
dto!(StorageSetInput {
    key: String,
    value: Value
});
dto!(NetworkFetchInput {
    url: String,
    method: GetMethod
});

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GetMethod {
    GET,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "method", content = "payload", deny_unknown_fields)]
pub enum PluginMethod {
    #[serde(rename = "ui.showMessage")]
    ShowMessage(MessageInput),
    #[serde(rename = "storage.get")]
    StorageGet(StorageGetInput),
    #[serde(rename = "storage.set")]
    StorageSet(StorageSetInput),
    #[serde(rename = "network.fetch")]
    NetworkFetch(NetworkFetchInput),
}

// Keep the transport envelope and tagged method separate: flatten +
// deny_unknown_fields cannot reliably validate both layers in serde.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginRequest {
    pub protocol_version: String,
    pub request_id: String,
    pub session_id: String,
    #[serde(deserialize_with = "safe_integer")]
    pub generation: u64,
    pub method: String,
    pub payload: Value,
}
fn safe_integer<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let value = Value::deserialize(d)?;
    let number = value
        .as_f64()
        .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 9_007_199_254_740_991.0 && n.fract() == 0.0)
        .ok_or_else(|| serde::de::Error::custom("Expected a nonnegative safe integer"))?;
    Ok(number as u64)
}
fn schema_integer<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u16, D::Error> {
    let value = safe_integer(d)?;
    u16::try_from(value).map_err(|_| serde::de::Error::custom("Invalid schema integer"))
}
dto!(PluginInvokeInput {
    request: PluginRequest
});

impl PluginRequest {
    pub fn decode_method(&self) -> Result<PluginMethod, String> {
        if self.protocol_version != API_VERSION
            || !wire_identifier(&self.request_id)
            || !wire_identifier(&self.session_id)
            || self.generation > 9_007_199_254_740_991
        {
            return Err("Invalid protocol envelope".into());
        }
        if !json_depth_valid(&self.payload, 0) {
            return Err("JSON nesting exceeds limit".into());
        }
        serde_json::from_value(serde_json::json!({"method":self.method,"payload":self.payload}))
            .map_err(|error| error.to_string())
    }
}

fn wire_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}

fn json_depth_valid(value: &Value, depth: usize) -> bool {
    if depth > 33 {
        return false;
    }
    match value {
        Value::Array(values) => values.iter().all(|v| json_depth_valid(v, depth + 1)),
        Value::Object(values) => values.values().all(|v| json_depth_valid(v, depth + 1)),
        _ => true,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum PluginResponse {
    Success {
        request_id: String,
        value: Value,
    },
    Failure {
        request_id: String,
        error: PluginError,
    },
}

impl Serialize for PluginResponse {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Success { request_id, value } => {
                serde_json::json!({"requestId":request_id,"ok":true,"value":value})
            }
            Self::Failure { request_id, error } => {
                serde_json::json!({"requestId":request_id,"ok":false,"error":error})
            }
        }
        .serialize(serializer)
    }
}

pub fn issue(code: &str, path: &str, message: impl Into<String>) -> CompatibilityIssue {
    CompatibilityIssue {
        code: code.into(),
        path: path.into(),
        message: message.into(),
        required: None,
        actual: None,
    }
}

pub fn check_web_manifest(
    value: &Value,
    host: &str,
    api: &str,
    platform: &str,
) -> CompatibilityReport {
    let mut report = CompatibilityReport {
        compatible: false,
        profile: "web-v1".into(),
        host_version: host.into(),
        api_version: Some(api.into()),
        issues: Vec::new(),
    };
    // Optional means absent, not null. Keep serde's Option permissiveness from
    // diverging from the author-facing JSON Schema.
    let null_optional = value.get("network").is_some_and(Value::is_null)
        || ["commands", "keybindings", "statusBarItems", "settings"]
            .iter()
            .any(|key| {
                value
                    .get("contributes")
                    .and_then(|c| c.get(key))
                    .is_some_and(Value::is_null)
            });
    if null_optional {
        report.issues.push(issue(
            "manifest.invalid",
            "",
            "Optional fields must be omitted rather than null",
        ));
        return report;
    }
    let manifest: PluginManifestV2 = match serde_json::from_value(value.clone()) {
        Ok(manifest) => manifest,
        Err(error) => {
            report
                .issues
                .push(issue("manifest.invalid", "", error.to_string()));
            return report;
        }
    };
    report.issues.extend(validate_web_manifest(&manifest));
    for (path, required, actual, code) in [
        (
            "engines.zero",
            manifest.engines.zero.as_str(),
            host,
            "host.incompatible",
        ),
        (
            "engines.api",
            manifest.engines.api.as_str(),
            api,
            "api.incompatible",
        ),
    ] {
        if !protocol_version_matches(actual, required) {
            report.issues.push(CompatibilityIssue {
                required: Some(required.into()),
                actual: Some(actual.into()),
                ..issue(code, path, "Version does not satisfy the required range")
            });
        }
    }
    if !manifest.platforms.iter().any(|p| p == platform) {
        report.issues.push(issue(
            "platform.unsupported",
            "platforms",
            "Plugin does not support this platform",
        ));
    }
    report.compatible = report.issues.is_empty();
    report
}

pub fn validate_web_manifest(m: &PluginManifestV2) -> Vec<CompatibilityIssue> {
    let mut issues = Vec::new();
    let mut check = |condition: bool, path: &str, message: &str| {
        if !condition {
            issues.push(issue("manifest.invalid", path, message));
        }
    };
    check(
        m.schema_version == 2,
        "schemaVersion",
        "Expected schemaVersion 2",
    );
    check(
        valid_id(&m.name) && m.id == m.name && !m.name.starts_with("zero."),
        "id",
        "Expected a non-reserved canonical plugin identity",
    );
    check(
        bounded_text(&m.display_name, 256)
            && bounded_text(&m.author, 256)
            && bounded_text(&m.description, 1024),
        "displayName",
        "Metadata must be non-empty and bounded",
    );
    check(
        m.version.len() <= 256 && is_protocol_version(&m.version),
        "version",
        "Expected strict SemVer",
    );
    check(
        m.engines.zero.len() <= 256 && protocol_range(&m.engines.zero).is_some(),
        "engines.zero",
        "Expected a bounded protocol range",
    );
    check(
        m.engines.api.len() <= 256 && protocol_range(&m.engines.api).is_some(),
        "engines.api",
        "Expected a bounded protocol range",
    );
    check(
        m.runtime == "webview",
        "runtime",
        "Only webview is supported",
    );
    check(
        safe_path(&m.main) && m.main.ends_with(".html"),
        "main",
        "Expected a safe packaged HTML path",
    );
    check(
        !m.platforms.is_empty()
            && unique(&m.platforms)
            && m.platforms
                .iter()
                .all(|p| matches!(p.as_str(), "macos" | "windows" | "linux")),
        "platforms",
        "Invalid platform list",
    );
    check(
        unique(&m.permissions)
            && m.permissions
                .iter()
                .all(|p| matches!(p.as_str(), "storage.plugin" | "ui.message" | "network")),
        "permissions",
        "Unsupported or duplicate public permission",
    );
    let network_requested = m.permissions.iter().any(|p| p == "network");
    check(
        network_requested == m.network.is_some(),
        "network",
        "Network scope must match the network permission",
    );
    if let Some(scope) = &m.network {
        check(
            !scope.allowed_origins.is_empty()
                && scope.allowed_origins.len() <= 32
                && unique(&scope.allowed_origins)
                && scope.allowed_origins.iter().all(|s| valid_origin(s)),
            "network.allowedOrigins",
            "Expected exact HTTPS origins",
        );
    }
    let c = &m.contributes;
    let mut ids = HashSet::new();
    let prefix = format!("{}.", m.id);
    let mut contribution_id = |id: &str| {
        id.starts_with(&prefix)
            && id.len() <= 128
            && id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c))
            && ids.insert(id.to_string())
    };
    check(
        !c.views.is_empty() && c.views.len() <= 8,
        "contributes.views",
        "Expected 1 to 8 views",
    );
    for view in &c.views {
        check(
            contribution_id(&view.id) && bounded_text(&view.title, 256),
            "contributes.views",
            "Invalid or duplicate view",
        );
    }
    let views: HashSet<_> = c.views.iter().map(|v| v.id.as_str()).collect();
    let commands = c.commands.as_deref().unwrap_or_default();
    check(
        commands.len() <= 64,
        "contributes.commands",
        "Too many commands",
    );
    for command in commands {
        check(
            contribution_id(&command.id)
                && bounded_text(&command.title, 256)
                && views.contains(command.view_id.as_str()),
            "contributes.commands",
            "Invalid command or view reference",
        );
    }
    let command_ids: HashSet<_> = commands.iter().map(|v| v.id.as_str()).collect();
    let keys = c.keybindings.as_deref().unwrap_or_default();
    check(
        keys.len() <= 64,
        "contributes.keybindings",
        "Too many keybindings",
    );
    let mut key_ids = HashSet::new();
    for key in keys {
        check(
            command_ids.contains(key.command.as_str())
                && key_ids.insert(&key.command)
                && bounded_text(&key.default, 128)
                && bounded_text(&key.description, 256),
            "contributes.keybindings",
            "Invalid keybinding or command reference",
        );
    }
    let status = c.status_bar_items.as_deref().unwrap_or_default();
    check(
        status.len() <= 8,
        "contributes.statusBarItems",
        "Too many status items",
    );
    for item in status {
        check(
            contribution_id(&item.id)
                && bounded_text(&item.title, 256)
                && item.icon == "extension"
                && !item.visible_by_default
                && command_ids.contains(item.command.as_str()),
            "contributes.statusBarItems",
            "Invalid status contribution",
        );
    }
    let settings = c.settings.as_deref().unwrap_or_default();
    check(
        settings.len() <= 64,
        "contributes.settings",
        "Too many settings",
    );
    let mut setting_ids = HashSet::new();
    for setting in settings {
        let (key, label) = match setting {
            SettingContribution::Boolean { key, label, .. }
            | SettingContribution::String { key, label, .. }
            | SettingContribution::Number { key, label, .. } => (key, label),
        };
        check(
            bounded_text(key, 128) && setting_ids.insert(key) && bounded_text(label, 256),
            "contributes.settings",
            "Invalid or duplicate setting",
        );
    }
    check(
        !m.activation_events.is_empty()
            && m.activation_events.len() <= 64
            && unique(&m.activation_events),
        "activationEvents",
        "Expected bounded unique activation events",
    );
    for event in &m.activation_events {
        let valid = event
            .strip_prefix("onView:")
            .is_some_and(|id| views.contains(id))
            || event
                .strip_prefix("onCommand:")
                .is_some_and(|id| command_ids.contains(id));
        check(
            valid,
            "activationEvents",
            "Activation event references an undeclared contribution",
        );
    }
    issues
}

fn bounded_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}
fn unique(values: &[String]) -> bool {
    values.iter().collect::<HashSet<_>>().len() == values.len()
}
fn valid_id(value: &str) -> bool {
    (2..=64).contains(&value.len())
        && value
            .bytes()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c))
}
pub fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && value.chars().count() <= 512
        && value.trim() == value
        && !value.contains(['\\', '\0', ':', '%', '?', '#'])
        && value
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}
pub fn valid_origin(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    value.len() <= 2048
        && url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.origin().ascii_serialization() == value
        && !value.contains('*')
}

dto!(PluginRegistrySnapshot { revision: u64, records: Vec<super::contracts::PluginRecord> });
dto!(PluginRegistryChanged { revision: u64, plugin_ids: Vec<String>, reason: String });
