use serde::Serialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{Emitter, Manager};

pub const POPOVER_PLACEMENT_EVENT: &str = "zero://popover-placement";

#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopoverPlacement {
    pub revision: u64,
    pub anchor_x: Option<f64>,
}

#[derive(Default)]
pub struct PopoverState(Mutex<HashMap<String, PopoverPlacement>>);

pub fn ensure_popover_caller(label: &str) -> Result<(), String> {
    if matches!(label, "tray" | "paper") {
        Ok(())
    } else {
        Err("popover placement requires a tray or paper caller".into())
    }
}

impl PopoverState {
    pub fn snapshot(&self, label: &str) -> Result<PopoverPlacement, String> {
        ensure_popover_caller(label)?;
        let placements = self
            .0
            .lock()
            .map_err(|_| "popover placement lock poisoned")?;
        Ok(placements.get(label).copied().unwrap_or_default())
    }

    fn update(&self, label: &str, anchor_x: Option<f64>) -> Result<PopoverPlacement, String> {
        ensure_popover_caller(label)?;
        let mut placements = self
            .0
            .lock()
            .map_err(|_| "popover placement lock poisoned")?;
        let current = placements.entry(label.into()).or_default();
        current.revision = current
            .revision
            .checked_add(1)
            .ok_or("popover placement revision exhausted")?;
        current.anchor_x = anchor_x.filter(|x| x.is_finite() && *x >= 0.0);
        Ok(*current)
    }
}

pub fn publish(window: &tauri::WebviewWindow, anchor_x: Option<f64>) -> Result<(), String> {
    let anchor_x = if cfg!(target_os = "macos") {
        anchor_x
    } else {
        None
    };
    let placement = window
        .state::<PopoverState>()
        .update(window.label(), anchor_x)?;
    window
        .emit_to(window.label(), POPOVER_PLACEMENT_EVENT, placement)
        .map_err(|error| format!("failed to publish popover placement: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lazy_listeners_read_latest_independent_placements() {
        let state = PopoverState::default();
        assert_eq!(
            state.snapshot("paper").unwrap(),
            PopoverPlacement::default()
        );
        state.update("tray", Some(200.0)).unwrap();
        state.update("paper", Some(380.0)).unwrap();
        state.update("tray", Some(32.5)).unwrap();
        assert_eq!(
            serde_json::to_value(state.snapshot("tray").unwrap()).unwrap(),
            serde_json::json!({"revision": 2, "anchorX": 32.5})
        );
        assert_eq!(state.snapshot("paper").unwrap().anchor_x, Some(380.0));
        state.update("tray", None).unwrap();
        assert_eq!(
            serde_json::to_value(state.snapshot("tray").unwrap()).unwrap(),
            serde_json::json!({"revision": 3, "anchorX": null})
        );
    }

    #[test]
    fn unrelated_callers_and_invalid_offsets_are_rejected() {
        let state = PopoverState::default();
        for label in ["main", "zero-file-engine", "plugin-example", "launcher"] {
            assert!(state.snapshot(label).is_err());
            assert!(state.update(label, Some(20.0)).is_err());
        }
        for offset in [f64::NAN, f64::INFINITY, -1.0] {
            assert_eq!(state.update("tray", Some(offset)).unwrap().anchor_x, None);
        }
    }
}
