use super::tool_windows::{ToolWindowAnchor, ToolWindowLogicalSize};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{LogicalSize, Manager};

const WIDTH: f64 = 400.0;
const HEIGHT_CAP: f64 = 500.0;

#[derive(Debug, Serialize)]
pub struct TrayLayoutError {
    code: &'static str,
    message: String,
}

fn error(message: impl ToString) -> TrayLayoutError {
    TrayLayoutError {
        code: "tray.layout",
        message: message.to_string(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLayoutSession {
    session: u64,
    max_height: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLayoutRequest {
    session: u64,
    generation: u64,
    desired_height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLayoutSnapshot {
    generation: u64,
    applied_height: f64,
    max_height: f64,
}

struct Layout {
    session: u64,
    generation: u64,
    anchor: Option<ToolWindowAnchor>,
    desired_height: f64,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            session: 0,
            generation: 0,
            anchor: None,
            desired_height: HEIGHT_CAP,
        }
    }
}

impl Layout {
    fn validate(&self, input: &TrayLayoutRequest) -> Result<(), TrayLayoutError> {
        if input.session != self.session
            || input.generation <= self.generation
            || input.generation > 9_007_199_254_740_991
        {
            Err(error("stale tray layout session or generation"))
        } else {
            Ok(())
        }
    }
}

#[derive(Default)]
pub struct TrayLayoutState(Mutex<Layout>);

fn bounded_height(desired: f64, available: f64) -> Result<f64, &'static str> {
    if !desired.is_finite() || desired <= 0.0 || !available.is_finite() || available < 1.0 {
        return Err("invalid tray dimensions");
    }
    Ok(desired.ceil().min(HEIGHT_CAP).min(available.floor()))
}

fn authorize(label: &str) -> Result<(), TrayLayoutError> {
    if label == "tray" {
        Ok(())
    } else {
        Err(error("only tray can request layout"))
    }
}

fn available_height(window: &tauri::WebviewWindow, anchor: Option<ToolWindowAnchor>) -> f64 {
    let anchored_monitor = anchor
        .and_then(|anchor| super::tool_windows::monitor_for_tool_window_anchor(window, anchor));
    let anchor = anchor.filter(|_| anchored_monitor.is_some());
    let monitor = anchored_monitor.or_else(|| window.current_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return HEIGHT_CAP;
    };
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let top = anchor
        .filter(|_| cfg!(target_os = "macos"))
        .map(|anchor| f64::from(anchor.y) + f64::from(anchor.height))
        .unwrap_or(f64::from(work.position.y));
    let inset = if cfg!(target_os = "macos") && anchor.is_some() {
        8.0 * scale
    } else {
        0.0
    };
    let start = (top - inset).max(f64::from(work.position.y) - inset);
    ((f64::from(work.position.y) + f64::from(work.size.height) - start) / scale)
        .clamp(1.0, HEIGHT_CAP)
}

fn apply(
    window: &tauri::WebviewWindow,
    layout: &Layout,
    height: f64,
) -> Result<(), TrayLayoutError> {
    let old_size = window.inner_size().map_err(error)?;
    let old_position = window.outer_position().map_err(error)?;
    let result = (|| {
        window
            .set_size(LogicalSize::new(WIDTH, height))
            .map_err(error)?;
        if layout.anchor.is_some() {
            let offset = super::tool_windows::position_popover_window(
                window,
                layout.anchor,
                ToolWindowLogicalSize {
                    width: WIDTH,
                    height,
                },
                "Zero",
            )
            .map_err(error)?;
            super::popover::publish(window, offset).map_err(error)?;
        } else if cfg!(target_os = "macos") {
            window.center().map_err(error)?;
            super::popover::publish(window, None).map_err(error)?;
        } else {
            use tauri_plugin_positioner::WindowExt;
            window
                .as_ref()
                .window()
                .move_window(tauri_plugin_positioner::Position::TrayCenter)
                .map_err(error)?;
            super::tool_windows::clamp_window_to_work_area(window).map_err(error)?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = window.set_size(old_size);
        let _ = window.set_position(old_position);
    }
    result
}

pub fn prepare_open(
    window: &tauri::WebviewWindow,
    anchor: Option<ToolWindowAnchor>,
) -> Result<f64, TrayLayoutError> {
    let state = window.state::<TrayLayoutState>();
    let mut layout = state.0.lock().map_err(error)?;
    layout.anchor = anchor.filter(|anchor| {
        super::tool_windows::monitor_for_tool_window_anchor(window, *anchor).is_some()
    });
    // Invalidate requests retained by a previous opening before touching geometry.
    layout.session += 1;
    layout.generation = 0;
    let height = bounded_height(
        layout.desired_height,
        available_height(window, layout.anchor),
    )
    .map_err(error)?;
    apply(window, &layout, height)?;
    Ok(height)
}

pub fn begin(window: &tauri::WebviewWindow) -> Result<TrayLayoutSession, TrayLayoutError> {
    authorize(window.label())?;
    if !window.is_visible().map_err(error)? {
        return Err(error("tray is hidden"));
    }
    let state = window.state::<TrayLayoutState>();
    let mut layout = state.0.lock().map_err(error)?;
    layout.anchor = layout.anchor.filter(|anchor| {
        super::tool_windows::monitor_for_tool_window_anchor(window, *anchor).is_some()
    });
    layout.session += 1;
    layout.generation = 0;
    Ok(TrayLayoutSession {
        session: layout.session,
        max_height: available_height(window, layout.anchor),
    })
}

pub fn update(
    window: &tauri::WebviewWindow,
    input: TrayLayoutRequest,
) -> Result<TrayLayoutSnapshot, TrayLayoutError> {
    authorize(window.label())?;
    if !window.is_visible().map_err(error)? {
        return Err(error("tray is hidden"));
    }
    let state = window.state::<TrayLayoutState>();
    let mut layout = state.0.lock().map_err(error)?;
    layout.anchor = layout.anchor.filter(|anchor| {
        super::tool_windows::monitor_for_tool_window_anchor(window, *anchor).is_some()
    });
    layout.validate(&input)?;
    let max_height = available_height(window, layout.anchor);
    let height = bounded_height(input.desired_height, max_height).map_err(error)?;
    apply(window, &layout, height)?;
    layout.generation = input.generation;
    layout.desired_height = input.desired_height;
    Ok(TrayLayoutSnapshot {
        generation: input.generation,
        applied_height: height,
        max_height,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn natural_height_is_compact_and_display_bounded() {
        assert_eq!(bounded_height(350.2, 900.0), Ok(351.0));
        assert_eq!(bounded_height(1200.0, 900.0), Ok(500.0));
        assert_eq!(bounded_height(400.0, 240.0), Ok(240.0));
        for invalid in [f64::NAN, f64::INFINITY, 0.0, -1.0] {
            assert!(bounded_height(invalid, 900.0).is_err());
        }
    }

    #[test]
    fn caller_and_wire_contracts_are_explicit() {
        assert!(authorize("tray").is_ok());
        for label in ["paper", "main", "zero-file-engine", "plugin-notes"] {
            assert!(authorize(label).is_err());
        }
        let input: TrayLayoutRequest = serde_json::from_value(
            serde_json::json!({"session": 2, "generation": 3, "desiredHeight": 240.0}),
        )
        .unwrap();
        assert_eq!(input.desired_height, 240.0);
        assert_eq!(
            serde_json::to_value(TrayLayoutSnapshot {
                generation: 3,
                applied_height: 240.0,
                max_height: 500.0
            })
            .unwrap(),
            serde_json::json!({"generation": 3, "appliedHeight": 240.0, "maxHeight": 500.0})
        );
    }

    #[test]
    fn reload_and_plugin_switch_reject_previous_sessions_and_old_generations() {
        let mut layout = Layout {
            session: 3,
            generation: 4,
            ..Default::default()
        };
        for (session, generation) in [(2, 5), (3, 4), (3, 2), (3, 9_007_199_254_740_992)] {
            assert!(layout
                .validate(&TrayLayoutRequest {
                    session,
                    generation,
                    desired_height: 320.0
                })
                .is_err());
        }
        assert!(layout
            .validate(&TrayLayoutRequest {
                session: 3,
                generation: 5,
                desired_height: 320.0
            })
            .is_ok());
        layout.session += 1;
        layout.generation = 0;
        assert!(layout
            .validate(&TrayLayoutRequest {
                session: 3,
                generation: 6,
                desired_height: 320.0
            })
            .is_err());
        assert!(layout
            .validate(&TrayLayoutRequest {
                session: 4,
                generation: 1,
                desired_height: 320.0
            })
            .is_ok());
    }
}
