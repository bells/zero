use std::collections::HashMap;
use std::path::PathBuf;

use super::contracts::{
    QuickLauncherActivationAction, QuickLauncherDiagnostic, QuickLauncherError,
    QuickLauncherRunningState,
};
use super::model::IndexedItem;

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

#[cfg(target_os = "macos")]
pub use macos::{activate, application_roots, load_icon, open_setting, probe_running, scan};
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use unsupported::{activate, application_roots, load_icon, open_setting, probe_running, scan};
#[cfg(target_os = "windows")]
pub use windows::{activate, application_roots, load_icon, open_setting, probe_running, scan};

pub type RunningStates = HashMap<String, QuickLauncherRunningState>;
pub type PlatformActivation = Result<QuickLauncherActivationAction, QuickLauncherError>;
pub type PlatformIcon = Result<Option<Vec<u8>>, QuickLauncherError>;

pub fn recursive_candidates(
    roots: &[PathBuf],
    suffixes: &[&str],
    bundle_boundary: bool,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut stack = roots.to_vec();
    while let Some(path) = stack.pop() {
        let Ok(metadata) = std::fs::metadata(&path) else {
            continue;
        };
        if metadata.is_file() {
            if path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    suffixes
                        .iter()
                        .any(|suffix| extension.eq_ignore_ascii_case(suffix))
                })
            {
                candidates.push(path);
            }
            continue;
        }
        if bundle_boundary
            && path.extension().and_then(|extension| extension.to_str()) == Some("app")
        {
            candidates.push(path);
            continue;
        }
        let Ok(entries) = std::fs::read_dir(path) else {
            continue;
        };
        for entry in entries.flatten() {
            stack.push(entry.path());
        }
    }
    candidates
}
