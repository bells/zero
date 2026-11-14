use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::protocol::{issue, CompatibilityIssue};
use super::versions::{is_protocol_version, protocol_range, protocol_version_matches};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequiredCapability {
    pub id: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostCapability {
    pub id: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilityReport {
    pub compatible: bool,
    pub capabilities: Vec<HostCapability>,
    pub issues: Vec<CompatibilityIssue>,
}

pub fn valid_capability_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.as_bytes()[0].is_ascii_lowercase()
        && id.split(['.', '_', '-']).all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

/// Only compare explicitly supplied providers; never infer availability from plugin identities.
pub fn compare_capabilities(
    required: &[RequiredCapability],
    providers: &[HostCapability],
) -> CapabilityReport {
    let mut issues = Vec::new();
    let mut catalog = HashMap::new();
    if providers.len() > 64 {
        issues.push(issue(
            "capability.invalid",
            "capabilities",
            "Too many host capabilities",
        ));
    }
    for provider in providers {
        if !valid_capability_id(&provider.id)
            || provider.version.len() > 256
            || !is_protocol_version(&provider.version)
            || catalog.insert(&provider.id, &provider.version).is_some()
        {
            issues.push(issue(
                "capability.invalid",
                "capabilities",
                "Invalid or duplicate host capability",
            ));
        }
    }
    if !issues.is_empty() {
        return CapabilityReport {
            compatible: false,
            capabilities: Vec::new(),
            issues,
        };
    }
    let mut ids = HashSet::new();
    if required.len() > 64 {
        issues.push(issue(
            "manifest.invalid",
            "requiredCapabilities",
            "Too many required capabilities",
        ));
    }
    for (index, requirement) in required.iter().enumerate() {
        let path = format!("requiredCapabilities.{index}");
        if !valid_capability_id(&requirement.id)
            || ids.contains(&requirement.id)
            || requirement.version.len() > 256
            || protocol_range(&requirement.version).is_none()
        {
            issues.push(issue(
                "manifest.invalid",
                &path,
                "Invalid, duplicate or unbounded capability requirement",
            ));
            continue;
        }
        ids.insert(&requirement.id);
        let actual = catalog.get(&requirement.id);
        let code = match actual {
            None => "capability.missing",
            Some(actual) if !protocol_version_matches(actual, &requirement.version) => {
                "capability.incompatible"
            }
            _ => continue,
        };
        issues.push(CompatibilityIssue {
            required: Some(requirement.version.clone()),
            actual: actual.map(|version| (*version).clone()),
            ..issue(
                code,
                &path,
                format!(
                    "Host upgrade required: capability {} is unavailable or incompatible",
                    requirement.id
                ),
            )
        });
    }
    CapabilityReport {
        compatible: issues.is_empty(),
        capabilities: providers.to_vec(),
        issues,
    }
}
