use std::path::PathBuf;

use super::{PlatformActivation, PlatformIcon, RunningStates, ScanResult};
use crate::services::quick_launcher::contracts::{
    launcher_error, QuickLauncherDiagnostic, QuickLauncherRunningState,
};
use crate::services::quick_launcher::model::IndexedItem;

pub fn application_roots() -> Vec<PathBuf> {
    Vec::new()
}

pub fn scan() -> ScanResult {
    ScanResult {
        items: Vec::new(),
        diagnostics: vec![QuickLauncherDiagnostic {
            code: "launcher.platform_unsupported".into(),
            message:
                "Quick Launcher application discovery supports macOS and Windows in this release."
                    .into(),
        }],
    }
}

pub fn probe_running(items: &[IndexedItem]) -> RunningStates {
    items
        .iter()
        .map(|item| (item.id.clone(), QuickLauncherRunningState::Unknown))
        .collect()
}

pub fn activate(_item: &IndexedItem) -> PlatformActivation {
    Err(unsupported("launcher.launchOrFocus"))
}

pub fn open_setting(_uri: &str) -> PlatformActivation {
    Err(unsupported("launcher.openSystemSetting"))
}

pub fn load_icon(_item: &IndexedItem) -> PlatformIcon {
    Ok(None)
}

fn unsupported(operation: &str) -> crate::services::quick_launcher::contracts::QuickLauncherError {
    launcher_error(
        operation,
        "launcher.platform_unsupported",
        "Quick Launcher supports macOS and Windows in this release.",
        false,
    )
}
