use super::contracts::{PluginManifest, PluginSource};
use super::protocol::{
    check_web_manifest, issue, web_runtime_enabled, CompatibilityReport, API_VERSION,
};
use super::versions::{is_protocol_version, legacy_host_matches};
use serde_json::Value;

pub fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

pub fn check_manifest(value: &Value) -> CompatibilityReport {
    check_manifest_for_host(
        value,
        env!("CARGO_PKG_VERSION"),
        current_platform(),
        web_runtime_enabled(),
    )
}

pub fn check_manifest_for_host(
    value: &Value,
    host: &str,
    platform: &str,
    web_enabled: bool,
) -> CompatibilityReport {
    if let Some(schema) = value.get("schemaVersion") {
        if schema.as_f64() != Some(2.0) {
            return CompatibilityReport {
                compatible: false,
                profile: "web-v1".into(),
                host_version: host.into(),
                api_version: None,
                issues: vec![issue(
                    "schema.unsupported",
                    "schemaVersion",
                    "Unsupported manifest schema",
                )],
            };
        }
        let mut report = check_web_manifest(value, host, API_VERSION, platform);
        if !web_enabled {
            report.issues.push(issue(
                "runtime.unsupported",
                "runtime",
                "Public Web runtime has not passed native conformance gates",
            ));
            report.compatible = false;
        }
        return report;
    }
    match serde_json::from_value::<PluginManifest>(value.clone()) {
        Ok(manifest) => check_legacy(&manifest, host, platform, false),
        Err(error) => CompatibilityReport {
            compatible: false,
            profile: "legacy".into(),
            host_version: host.into(),
            api_version: None,
            issues: vec![issue("manifest.invalid", "", error.to_string())],
        },
    }
}

pub fn check_legacy(
    manifest: &PluginManifest,
    host: &str,
    platform: &str,
    bundled: bool,
) -> CompatibilityReport {
    let mut report = CompatibilityReport {
        compatible: true,
        profile: if bundled { "bundled" } else { "legacy" }.into(),
        host_version: host.into(),
        api_version: None,
        issues: Vec::new(),
    };
    if !is_protocol_version(&manifest.version) {
        report.issues.push(issue(
            "manifest.invalid",
            "version",
            "Invalid semantic version",
        ));
    }
    if let Some(engines) = &manifest.engines {
        if let Some(range) = engines.zero.as_ref().or(engines.ztool.as_ref()) {
            if !legacy_host_matches(host, range) {
                let mut error = issue(
                    "host.incompatible",
                    "engines.zero",
                    "Host version is incompatible",
                );
                error.required = Some(range.clone());
                error.actual = Some(host.into());
                report.issues.push(error);
            }
        }
        if engines.api.as_deref().is_some_and(|api| api != "1") {
            report.issues.push(issue(
                "api.incompatible",
                "engines.api",
                "Legacy API must be the literal 1",
            ));
        }
    }
    if !bundled
        && manifest.platforms.as_ref().is_some_and(|platforms| {
            !platforms.iter().any(|p| {
                serde_json::to_value(p)
                    .ok()
                    .and_then(|v| v.as_str().map(str::to_owned))
                    .as_deref()
                    == Some(platform)
            })
        })
    {
        report.issues.push(issue(
            "platform.unsupported",
            "platforms",
            "Unsupported platform",
        ));
    }
    if !super::protocol::safe_path(&manifest.main) {
        report
            .issues
            .push(issue("manifest.invalid", "main", "Unsafe entrypoint"));
    }
    report.compatible = report.issues.is_empty();
    report
}

pub fn check_record(record: &super::contracts::PluginRecord) -> CompatibilityReport {
    if let Some(manifest) = &record.protocol_manifest {
        return check_manifest(&serde_json::to_value(manifest).expect("manifest serialization"));
    }
    check_legacy(
        &record.manifest,
        env!("CARGO_PKG_VERSION"),
        current_platform(),
        record.source == PluginSource::Bundled,
    )
}

/// A legacy-shaped catalog view for existing host UI; the v2 source is stored
/// separately, so this projection never decides runtime authorization.
pub fn catalog_manifest(m: &super::protocol::PluginManifestV2) -> PluginManifest {
    let views: Vec<_> = m
        .contributes
        .views
        .iter()
        .map(|v| serde_json::json!({"id":v.id,"title":v.title,"surface":v.surface}))
        .collect();
    let commands: Vec<_> = m
        .contributes
        .commands
        .iter()
        .flatten()
        .map(|c| serde_json::json!({"id":c.id,"title":c.title}))
        .collect();
    serde_json::from_value(serde_json::json!({
        "name":m.name,"id":m.id,"version":m.version,"author":m.author,"main":m.main,
        "displayName":m.display_name,"description":m.description,"permissions":m.permissions,
        "platforms":m.platforms,"runtime":"webview","contributes":{"views":views,"commands":commands}
    })).expect("validated protocol catalog projection")
}
