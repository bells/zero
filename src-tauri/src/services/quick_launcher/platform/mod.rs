use std::collections::HashMap;

use super::contracts::{
    QuickLauncherActivationAction, QuickLauncherDiagnostic, QuickLauncherError,
    QuickLauncherRunningState,
};
use super::model::IndexedItem;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use super::contracts::{launcher_error, QuickLauncherItemKind};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use super::model::{current_platform_key, stable_item_id, LaunchTarget};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use super::search::{build_search_fields, bundled_aliases};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use crate::services::application_catalog::{self, Candidate, DiscoveryError};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod unsupported;
#[cfg(target_os = "windows")]
mod windows;

pub struct ScanResult {
    pub items: Vec<IndexedItem>,
    pub diagnostics: Vec<QuickLauncherDiagnostic>,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub use application_catalog::application_roots;
#[cfg(target_os = "macos")]
pub use macos::{activate, load_icon, open_setting, probe_running};
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use unsupported::{activate, application_roots, load_icon, open_setting, probe_running};
#[cfg(target_os = "windows")]
pub use windows::{activate, load_icon, open_setting, probe_running};

pub type RunningStates = HashMap<String, QuickLauncherRunningState>;
pub type PlatformActivation = Result<QuickLauncherActivationAction, QuickLauncherError>;
pub type PlatformIcon = Result<Option<Vec<u8>>, QuickLauncherError>;

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn scan(is_cancelled: &impl Fn() -> bool) -> Result<ScanResult, QuickLauncherError> {
    let catalog = application_catalog::discover_applications(is_cancelled).map_err(|error| {
        let code = match error {
            DiscoveryError::Cancelled => "launcher.discovery_cancelled",
            DiscoveryError::EntryLimit => "launcher.discovery_entry_limit",
            DiscoveryError::DepthLimit => "launcher.discovery_depth_limit",
            DiscoveryError::PayloadLimit => "launcher.discovery_payload_limit",
            DiscoveryError::InputLimit => "launcher.discovery_input_limit",
        };
        launcher_error("launcher.scanApps", code, error.to_string(), true)
    })?;
    let code = if cfg!(target_os = "macos") {
        "launcher.macos.bundle_skipped"
    } else {
        "launcher.windows.entry_skipped"
    };
    Ok(ScanResult {
        items: catalog
            .candidates
            .into_iter()
            .map(index_candidate)
            .collect(),
        diagnostics: catalog
            .skipped
            .into_iter()
            .map(|message| QuickLauncherDiagnostic {
                code: code.into(),
                message,
            })
            .collect(),
    })
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn index_candidate(candidate: Candidate) -> IndexedItem {
    let kind = QuickLauncherItemKind::Application;
    let id = stable_item_id(current_platform_key(), kind, &candidate.identity);
    let icon_key = Some(format!(
        "{id}:{}",
        candidate.modified_at.unwrap_or_default()
    ));
    IndexedItem {
        id,
        kind,
        subtitle: candidate.path.to_string_lossy().into_owned(),
        search: build_search_fields(&candidate.title, bundled_aliases(&candidate.title)),
        title: candidate.title,
        target: LaunchTarget::Application {
            path: candidate.path,
            bundle_id: candidate.bundle_id,
            executable_path: candidate.executable_path,
        },
        icon_source: Some(candidate.icon_source),
        icon_key,
        source_modified_at: candidate.modified_at,
        running: QuickLauncherRunningState::Unknown,
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn scan(_is_cancelled: &impl Fn() -> bool) -> Result<ScanResult, QuickLauncherError> {
    Ok(unsupported::scan())
}

#[cfg(all(test, any(target_os = "macos", target_os = "windows")))]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn discovered_application_maps_to_legacy_id_icon_and_search_fields() {
        let kind = QuickLauncherItemKind::Application;
        let identity = "example.code";
        let id = stable_item_id(current_platform_key(), kind, identity);
        let path = PathBuf::from("Synthetic Visual Studio Code.app");
        let executable = path.join("Contents/MacOS/Code");
        let item = index_candidate(Candidate {
            identity: identity.into(),
            title: "Visual Studio Code".into(),
            path: path.clone(),
            bundle_id: Some(identity.into()),
            executable_path: Some(executable.clone()),
            icon_source: path.clone(),
            modified_at: Some(73),
        });

        assert_eq!(item.id, id);
        assert_eq!(item.icon_key, Some(format!("{id}:73")));
        assert_eq!(item.kind, kind);
        assert_eq!(item.subtitle, path.to_string_lossy());
        assert_eq!(item.icon_source.as_deref(), Some(path.as_path()));
        assert_eq!(item.source_modified_at, Some(73));
        assert_eq!(item.running, QuickLauncherRunningState::Unknown);
        assert!(item.search.aliases.iter().any(|alias| alias == "vscode"));
        assert!(matches!(
            item.target,
            LaunchTarget::Application { path: target_path, bundle_id: Some(bundle_id), executable_path: Some(target_executable) }
                if target_path == path && bundle_id == identity && target_executable == executable
        ));
    }
}
