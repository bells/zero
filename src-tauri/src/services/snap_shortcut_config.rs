use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

use super::global_shortcuts::{GlobalShortcutActionId, ShortcutError, ShortcutErrorCode};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapShortcutConfig {
    pub schema_version: u16,
    pub snap_capture: Option<String>,
    pub snap_ocr: Option<String>,
}

impl Default for SnapShortcutConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            snap_capture: Some("Alt+A".into()),
            snap_ocr: None,
        }
    }
}

impl SnapShortcutConfig {
    pub fn accelerator(&self, id: GlobalShortcutActionId) -> Option<&str> {
        match id {
            GlobalShortcutActionId::SnapCapture => self.snap_capture.as_deref(),
            GlobalShortcutActionId::SnapOcr => self.snap_ocr.as_deref(),
            GlobalShortcutActionId::LaunchPanel => None,
        }
    }

    pub fn replace(
        &self,
        id: GlobalShortcutActionId,
        value: Option<String>,
    ) -> Result<Self, ShortcutError> {
        let mut next = self.clone();
        match id {
            GlobalShortcutActionId::SnapCapture => {
                next.snap_capture = value.map(|v| normalize(&v)).transpose()?
            }
            GlobalShortcutActionId::SnapOcr => {
                next.snap_ocr = value.map(|v| normalize(&v)).transpose()?
            }
            GlobalShortcutActionId::LaunchPanel => return Err(ShortcutErrorCode::ReadOnly.into()),
        }
        next.validate()?;
        Ok(next)
    }

    fn validate(&self) -> Result<(), ShortcutError> {
        if self.schema_version != 1 {
            return Err(ShortcutErrorCode::InvalidConfiguration.into());
        }
        let launch = normalize(crate::QUICK_LAUNCHER_SHORTCUT)?;
        let capture = self.snap_capture.as_deref().map(normalize).transpose()?;
        let ocr = self.snap_ocr.as_deref().map(normalize).transpose()?;
        if capture
            .as_ref()
            .is_some_and(|v| v == &launch || Some(v) == ocr.as_ref())
            || ocr.as_ref().is_some_and(|v| v == &launch)
        {
            return Err(ShortcutErrorCode::Duplicate.into());
        }
        Ok(())
    }
}

pub fn normalize(value: &str) -> Result<String, ShortcutError> {
    if value.len() > 100 {
        return Err(ShortcutErrorCode::Invalid.into());
    }
    let shortcut: Shortcut = value
        .trim()
        .parse()
        .map_err(|_| ShortcutError::from(ShortcutErrorCode::Invalid))?;
    if shortcut.mods.is_empty() {
        return Err(ShortcutErrorCode::Invalid.into());
    }
    let mut parts = Vec::new();
    for (modifier, name) in [
        (Modifiers::CONTROL, "Control"),
        (Modifiers::ALT, "Alt"),
        (Modifiers::SHIFT, "Shift"),
        (Modifiers::SUPER, "Super"),
    ] {
        if shortcut.mods.contains(modifier) {
            parts.push(name.to_string());
        }
    }
    let key = shortcut.key.to_string();
    parts.push(
        key.strip_prefix("Key")
            .or_else(|| key.strip_prefix("Digit"))
            .unwrap_or(&key)
            .to_string(),
    );
    Ok(parts.join("+"))
}

pub fn load(path: &Path) -> Result<SnapShortcutConfig, ShortcutError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(SnapShortcutConfig::default())
        }
        Err(_) => return Err(ShortcutErrorCode::InvalidConfiguration.into()),
    };
    if bytes.len() > 4096 {
        return Err(ShortcutErrorCode::InvalidConfiguration.into());
    }
    let config: SnapShortcutConfig = serde_json::from_slice(&bytes)
        .map_err(|_| ShortcutError::from(ShortcutErrorCode::InvalidConfiguration))?;
    config.validate()?;
    let mut config = config;
    config.snap_capture = config.snap_capture.as_deref().map(normalize).transpose()?;
    config.snap_ocr = config.snap_ocr.as_deref().map(normalize).transpose()?;
    Ok(config)
}

pub fn save(path: &Path, config: &SnapShortcutConfig) -> Result<(), ()> {
    let parent = path.parent().ok_or(())?;
    fs::create_dir_all(parent).map_err(|_| ())?;
    let temporary = path.with_extension(format!("{}.part", std::process::id()));
    let result = (|| {
        let bytes = serde_json::to_vec_pretty(config).map_err(|_| ())?;
        let mut file = fs::File::create(&temporary).map_err(|_| ())?;
        file.write_all(&bytes).map_err(|_| ())?;
        file.sync_all().map_err(|_| ())?;
        replace_file(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &Path, target: &Path) -> Result<(), ()> {
    fs::rename(source, target).map_err(|_| ())
}

#[cfg(target_os = "windows")]
fn replace_file(source: &Path, target: &Path) -> Result<(), ()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source: Vec<_> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<_> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_clear_reset_and_normalization_are_independent() {
        let config = SnapShortcutConfig::default();
        assert_eq!(
            config.accelerator(GlobalShortcutActionId::SnapCapture),
            Some("Alt+A")
        );
        assert_eq!(config.accelerator(GlobalShortcutActionId::SnapOcr), None);
        let config = config
            .replace(
                GlobalShortcutActionId::SnapOcr,
                Some(" shift + option + b ".into()),
            )
            .unwrap();
        assert_eq!(config.snap_ocr.as_deref(), Some("Alt+Shift+B"));
        let cleared = config
            .replace(GlobalShortcutActionId::SnapCapture, None)
            .unwrap();
        assert_eq!(cleared.snap_capture, None);
        assert_eq!(cleared.snap_ocr, config.snap_ocr);
        assert_eq!(
            cleared
                .replace(GlobalShortcutActionId::SnapCapture, Some("Alt+A".into()))
                .unwrap()
                .snap_capture
                .as_deref(),
            Some("Alt+A")
        );
    }
    #[test]
    fn rejects_duplicates_reserved_launch_and_unmodified_keys() {
        let config = SnapShortcutConfig::default();
        assert_eq!(
            config
                .replace(GlobalShortcutActionId::SnapOcr, Some("Option+KeyA".into()))
                .unwrap_err()
                .code,
            ShortcutErrorCode::Duplicate
        );
        assert_eq!(
            config
                .replace(
                    GlobalShortcutActionId::SnapOcr,
                    Some(crate::QUICK_LAUNCHER_SHORTCUT.into())
                )
                .unwrap_err()
                .code,
            ShortcutErrorCode::Duplicate
        );
        assert_eq!(normalize("A").unwrap_err().code, ShortcutErrorCode::Invalid);
        assert_eq!(
            config
                .replace(GlobalShortcutActionId::LaunchPanel, None)
                .unwrap_err()
                .code,
            ShortcutErrorCode::ReadOnly
        );
    }
    #[test]
    fn corrupt_preferences_remain_untouched_and_valid_values_survive_reload() {
        let root =
            std::env::temp_dir().join(format!("zero-shortcut-config-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("shortcuts.json");
        fs::write(&path, "broken").unwrap();
        assert!(load(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "broken");
        let config = SnapShortcutConfig::default()
            .replace(GlobalShortcutActionId::SnapOcr, Some("Alt+B".into()))
            .unwrap();
        save(&path, &config).unwrap();
        assert_eq!(load(&path).unwrap(), config);
        fs::remove_dir_all(root).unwrap();
    }
}
