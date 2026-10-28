use super::awake_battery::AwakeBatteryPolicy;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CustomMode {
    Duration,
    Until,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct AwakeCustomInput {
    pub mode: CustomMode,
    pub duration_minutes: u64,
    pub hour: u8,
    pub minute: u8,
}
impl AwakeCustomInput {
    pub fn validate(self) -> Result<(), String> {
        if !(1..=1440).contains(&self.duration_minutes) || self.hour > 23 || self.minute > 59 {
            return Err("invalid_custom_input".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AwakePreferences {
    pub version: u8,
    pub custom_input: Option<AwakeCustomInput>,
    pub battery_policy: AwakeBatteryPolicy,
}
impl Default for AwakePreferences {
    fn default() -> Self {
        Self {
            version: 1,
            custom_input: None,
            battery_policy: AwakeBatteryPolicy::default(),
        }
    }
}
impl AwakePreferences {
    fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("preferences_unavailable".into());
        }
        self.battery_policy.validate()?;
        if let Some(input) = self.custom_input {
            input.validate()?;
        }
        Ok(())
    }
}
pub struct AwakePreferencesStore {
    root: PathBuf,
    pub last_good: Option<AwakePreferences>,
    pub unavailable: bool,
}
impl Default for AwakePreferencesStore {
    fn default() -> Self {
        Self::new(
            &crate::brand::canonical_data_root(&crate::brand::default_home())
                .join("data/plugins/zero.awake"),
        )
    }
}
impl AwakePreferencesStore {
    pub fn new(root: &Path) -> Self {
        Self {
            root: root.into(),
            last_good: None,
            unavailable: false,
        }
    }
    pub fn read(&mut self) -> Result<AwakePreferences, String> {
        let result = (|| {
            let value = crate::plugins::storage::prepare(&self.root, "awake.preferences.v1", None)
                .map_err(|_| "preferences_unavailable")?
                .commit()
                .map_err(|_| "preferences_unavailable")?;
            let prefs = if value.is_null() {
                AwakePreferences::default()
            } else {
                serde_json::from_value(value).map_err(|_| "preferences_unavailable")?
            };
            prefs.validate()?;
            Ok(prefs)
        })();
        self.unavailable = result.is_err();
        if let Ok(prefs) = &result {
            self.last_good = Some(prefs.clone());
        }
        result
    }
    pub fn update(
        &mut self,
        change: impl FnOnce(&mut AwakePreferences),
    ) -> Result<AwakePreferences, String> {
        self.update_with(change, |root, next| {
            crate::plugins::storage::prepare(
                root,
                "awake.preferences.v1",
                Some(serde_json::to_value(next).map_err(|_| "preferences_save_failed")?),
            )
            .map_err(|_| "preferences_save_failed")?
            .commit()
            .map_err(|_| "preferences_save_failed")?;
            Ok(())
        })
    }
    fn update_with(
        &mut self,
        change: impl FnOnce(&mut AwakePreferences),
        save: impl FnOnce(&Path, &AwakePreferences) -> Result<(), String>,
    ) -> Result<AwakePreferences, String> {
        let mut next = self.read()?;
        change(&mut next);
        next.validate()?;
        save(&self.root, &next)?;
        self.last_good = Some(next.clone());
        Ok(next)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merged_updates_preserve_inputs_policy_and_unrelated_storage_and_never_sessions() {
        let root = std::env::temp_dir().join(format!("zero-awake-prefs-{}", std::process::id()));
        let mut store = AwakePreferencesStore::new(&root);
        assert_eq!(store.read().unwrap(), AwakePreferences::default());
        crate::plugins::storage::prepare(
            &root,
            "unrelated",
            Some(serde_json::json!({"preserved":true})),
        )
        .unwrap()
        .commit()
        .unwrap();
        let before = store.read().unwrap();
        let failed = store.update_with(
            |prefs| prefs.battery_policy.stop_on_low_battery = true,
            |_, _| Err("preferences_save_failed".into()),
        );
        assert!(failed.is_err());
        assert_eq!(store.last_good.as_ref(), Some(&before));
        assert_eq!(store.read().unwrap(), before);
        let input = AwakeCustomInput {
            mode: CustomMode::Duration,
            duration_minutes: 45,
            hour: 12,
            minute: 30,
        };
        store.update(|p| p.custom_input = Some(input)).unwrap();
        store
            .update(|p| p.battery_policy.stop_on_low_battery = true)
            .unwrap();
        let reopened = AwakePreferencesStore::new(&root).read().unwrap();
        assert_eq!(reopened.custom_input, Some(input));
        assert!(reopened.battery_policy.stop_on_low_battery);
        assert_eq!(
            crate::plugins::storage::prepare(&root, "unrelated", None)
                .unwrap()
                .commit()
                .unwrap(),
            serde_json::json!({"preserved":true})
        );
        let wire = serde_json::to_string(&reopened).unwrap();
        assert!(!wire.contains("expires_at") && !wire.contains("enabled"));
        std::fs::write(root.join("storage.json"), b"broken").unwrap();
        assert!(store.read().is_err());
        assert!(
            store
                .last_good
                .as_ref()
                .unwrap()
                .battery_policy
                .stop_on_low_battery
        );
        assert!(store
            .update(|p| p.battery_policy.stop_on_low_battery = false)
            .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
