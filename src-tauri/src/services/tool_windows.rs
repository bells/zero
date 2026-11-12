use tauri::{Manager, PhysicalPosition, PhysicalRect, PhysicalSize};

use crate::services::surface_activity::hide_surface;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolWindowKind {
    Paper,
    QuickLauncher,
}

impl ToolWindowKind {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Paper => "paper",
            Self::QuickLauncher => "launcher",
        }
    }

    const fn display_name(self) -> &'static str {
        match self {
            Self::Paper => "Zero Paper",
            Self::QuickLauncher => "Zero Launch",
        }
    }
}

const TOOL_WINDOWS: [ToolWindowKind; 2] = [ToolWindowKind::Paper, ToolWindowKind::QuickLauncher];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ToolWindowAnchor {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ToolWindowLogicalSize {
    pub width: f64,
    pub height: f64,
}

fn monitor_bounds_contain_anchor(
    monitor_bounds: PhysicalRect<i32, u32>,
    monitor_scale: f64,
    anchor: ToolWindowAnchor,
) -> bool {
    let (center_x, center_y) = anchor_monitor_point(anchor);
    let bounds_scale = if cfg!(target_os = "macos") {
        monitor_scale
    } else {
        1.0
    };
    let left = f64::from(monitor_bounds.position.x) / bounds_scale;
    let top = f64::from(monitor_bounds.position.y) / bounds_scale;
    let right = left + f64::from(monitor_bounds.size.width) / bounds_scale;
    let bottom = top + f64::from(monitor_bounds.size.height) / bounds_scale;
    center_x >= left && center_x < right && center_y >= top && center_y < bottom
}

fn anchor_monitor_point(anchor: ToolWindowAnchor) -> (f64, f64) {
    let scale = if cfg!(target_os = "macos") {
        anchor.scale_factor
    } else {
        1.0
    };
    (
        (f64::from(anchor.x) + f64::from(anchor.width) / 2.0) / scale,
        (f64::from(anchor.y) + f64::from(anchor.height) / 2.0) / scale,
    )
}

pub(crate) fn monitor_for_tool_window_anchor(
    window: &tauri::WebviewWindow,
    anchor: ToolWindowAnchor,
) -> Option<tauri::Monitor> {
    let (center_x, center_y) = anchor_monitor_point(anchor);
    if let Ok(Some(monitor)) = window.monitor_from_point(center_x, center_y) {
        if monitor_bounds_contain_anchor(
            PhysicalRect {
                position: *monitor.position(),
                size: *monitor.size(),
            },
            monitor.scale_factor(),
            anchor,
        ) {
            return Some(monitor);
        }
    }

    window
        .available_monitors()
        .ok()?
        .into_iter()
        .find(|monitor| {
            monitor_bounds_contain_anchor(
                PhysicalRect {
                    position: *monitor.position(),
                    size: *monitor.size(),
                },
                monitor.scale_factor(),
                anchor,
            )
        })
}

pub fn anchored_tool_window_position(
    anchor: ToolWindowAnchor,
    window_size: PhysicalSize<u32>,
    work_area: PhysicalRect<i32, u32>,
    gap: i32,
) -> Option<PhysicalPosition<i32>> {
    if anchor.width == 0
        || anchor.height == 0
        || !anchor.scale_factor.is_finite()
        || anchor.scale_factor <= 0.0
        || window_size.width == 0
        || window_size.height == 0
        || work_area.size.width < window_size.width
        || work_area.size.height < window_size.height
    {
        return None;
    }

    let anchor_center_x = i64::from(anchor.x) + i64::from(anchor.width) / 2;
    let preferred_x = anchor_center_x - i64::from(window_size.width) / 2;
    let preferred_y = i64::from(anchor.y) + i64::from(anchor.height) + i64::from(gap);
    let min_x = i64::from(work_area.position.x);
    let min_y = i64::from(work_area.position.y);
    let max_x = min_x + i64::from(work_area.size.width - window_size.width);
    let max_y = min_y + i64::from(work_area.size.height - window_size.height);

    Some(PhysicalPosition::new(
        preferred_x.clamp(min_x, max_x) as i32,
        preferred_y.clamp(min_y, max_y) as i32,
    ))
}

pub fn position_anchored_tool_window(
    window: &tauri::WebviewWindow,
    anchor: Option<ToolWindowAnchor>,
    logical_size: ToolWindowLogicalSize,
    gap: i32,
    display_name: &str,
) -> Result<Option<f64>, String> {
    if let Some(anchor) = anchor {
        if let Some(monitor) = monitor_for_tool_window_anchor(window, anchor) {
            let scale_factor = monitor.scale_factor();
            let window_size = PhysicalSize::new(
                (logical_size.width * scale_factor).round() as u32,
                (logical_size.height * scale_factor).round() as u32,
            );
            if let Some(position) =
                anchored_tool_window_position(anchor, window_size, *monitor.work_area(), gap)
            {
                let window_position = window_position_for_monitor(position, scale_factor);
                window.set_position(window_position).map_err(|error| {
                    format!("failed to position {display_name} window: {error}")
                })?;
                return Ok(Some(logical_anchor_offset(anchor, position, scale_factor)));
            }
        }
    }

    window
        .center()
        .map_err(|error| format!("failed to center {display_name} safely: {error}"))?;
    Ok(None)
}

pub fn position_popover_window(
    window: &tauri::WebviewWindow,
    anchor: Option<ToolWindowAnchor>,
    logical_size: ToolWindowLogicalSize,
    display_name: &str,
) -> Result<Option<f64>, String> {
    if cfg!(target_os = "macos") {
        if let Some(anchor) = anchor {
            if let Some(monitor) = monitor_for_tool_window_anchor(window, anchor) {
                let scale = monitor.scale_factor();
                let (area, gap) = popover_area(*monitor.work_area(), monitor.position().y, scale);
                if let Some(position) = anchored_tool_window_position(
                    anchor,
                    PhysicalSize::new(
                        (logical_size.width * scale).round() as u32,
                        (logical_size.height * scale).round() as u32,
                    ),
                    area,
                    gap,
                ) {
                    window
                        .set_position(window_position_for_monitor(position, scale))
                        .map_err(|e| e.to_string())?;
                    return Ok(Some(logical_anchor_offset(anchor, position, scale)));
                }
            }
        }
    }
    position_anchored_tool_window(window, anchor, logical_size, 0, display_name)
}

fn popover_area(
    mut area: PhysicalRect<i32, u32>,
    monitor_top: i32,
    scale: f64,
) -> (PhysicalRect<i32, u32>, i32) {
    let overlap = (8.0 * scale).round() as i32;
    let top = (area.position.y - overlap).max(monitor_top);
    area.size.height += (area.position.y - top) as u32;
    area.position.y = top;
    (area, -overlap)
}

fn clamped_position(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    area: PhysicalRect<i32, u32>,
) -> PhysicalPosition<i32> {
    let max_x = i64::from(area.position.x) + i64::from(area.size.width.saturating_sub(size.width));
    let max_y =
        i64::from(area.position.y) + i64::from(area.size.height.saturating_sub(size.height));
    PhysicalPosition::new(
        i64::from(position.x).clamp(i64::from(area.position.x), max_x) as i32,
        i64::from(position.y).clamp(i64::from(area.position.y), max_y) as i32,
    )
}

pub fn clamp_window_to_work_area(window: &tauri::WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("monitor unavailable")?;
    let area = monitor.work_area();
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    window
        .set_position(window_position_for_monitor(
            clamped_position(position, size, *area),
            monitor.scale_factor(),
        ))
        .map_err(|e| e.to_string())
}

fn window_position_for_monitor(
    position: PhysicalPosition<i32>,
    scale_factor: f64,
) -> tauri::Position {
    // AppKit converts physical positions with the window's previous display scale.
    if cfg!(target_os = "macos") {
        tauri::Position::Logical(position.to_logical(scale_factor))
    } else {
        tauri::Position::Physical(position)
    }
}

fn logical_anchor_offset(
    anchor: ToolWindowAnchor,
    position: PhysicalPosition<i32>,
    scale_factor: f64,
) -> f64 {
    (f64::from(anchor.x) + f64::from(anchor.width) / 2.0 - f64::from(position.x)) / scale_factor
}

pub fn prepare_tray_window(app: &tauri::AppHandle) -> Result<(), String> {
    for tool in TOOL_WINDOWS {
        hide_tool_window(app, tool)?;
    }
    Ok(())
}

pub fn prepare_tool_window(app: &tauri::AppHandle, opening: ToolWindowKind) -> Result<(), String> {
    crate::services::tray_panel::hide(app)?;
    for tool in peer_tool_windows(opening) {
        hide_tool_window(app, tool)?;
    }
    Ok(())
}

pub fn hide_tool_window(app: &tauri::AppHandle, tool: ToolWindowKind) -> Result<(), String> {
    hide_window(app, tool.label(), tool.display_name())
}

fn hide_window(app: &tauri::AppHandle, label: &str, display_name: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        hide_surface(&window)
            .map_err(|error| format!("failed to hide {display_name} window: {error}"))?;
    }
    Ok(())
}

fn peer_tool_windows(opening: ToolWindowKind) -> impl Iterator<Item = ToolWindowKind> {
    TOOL_WINDOWS
        .into_iter()
        .filter(move |tool| *tool != opening)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caret_overlap_and_taskbar_clamp_preserve_work_area_edges() {
        for (scale, monitor_top) in [(1.0, 0), (2.0, -1800)] {
            let work = PhysicalRect {
                position: PhysicalPosition::new(-1920, monitor_top + (24.0 * scale) as i32),
                size: PhysicalSize::new(1920, 1000),
            };
            let (area, gap) = popover_area(work, monitor_top, scale);
            assert_eq!(work.position.y - area.position.y, (8.0 * scale) as i32);
            assert_eq!(gap, -(8.0 * scale) as i32);
            assert_eq!(
                area.position.y + area.size.height as i32,
                work.position.y + work.size.height as i32
            );
            assert_eq!(
                clamped_position(
                    PhysicalPosition::new(-50, 3000),
                    PhysicalSize::new(400, 500),
                    work
                ),
                PhysicalPosition::new(-400, work.position.y + 500)
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn mixed_dpi_lookup_and_movement_use_destination_logical_coordinates() {
        let anchor = ToolWindowAnchor {
            x: 3000,
            y: 0,
            width: 44,
            height: 44,
            scale_factor: 2.0,
        };
        assert_eq!(anchor_monitor_point(anchor), (1511.0, 11.0));
        assert!(monitor_bounds_contain_anchor(
            PhysicalRect {
                position: PhysicalPosition::new(2880, 0),
                size: PhysicalSize::new(2880, 1800)
            },
            2.0,
            anchor,
        ));
        assert!(!monitor_bounds_contain_anchor(
            PhysicalRect {
                position: PhysicalPosition::new(0, 0),
                size: PhysicalSize::new(1440, 900)
            },
            1.0,
            anchor,
        ));
        for (physical, destination_scale, expected) in [
            (
                PhysicalPosition::new(1400, 24),
                1.0,
                tauri::LogicalPosition::new(1400.0, 24.0),
            ),
            (
                PhysicalPosition::new(-3840, 48),
                2.0,
                tauri::LogicalPosition::new(-1920.0, 24.0),
            ),
        ] {
            for previous_scale in [1.0, 2.0] {
                assert_eq!(
                    window_position_for_monitor(physical, destination_scale)
                        .to_logical::<f64>(previous_scale),
                    expected,
                );
            }
        }
    }

    #[test]
    fn caret_tracks_the_actual_cell_after_edge_clamping_and_dpi_conversion() {
        for (x, window_x, scale, expected) in [
            (700, 511, 1.0, 200.0),
            (4, 0, 1.0, 15.0),
            (1420, 1040, 1.0, 391.0),
            (-1900, -1920, 2.0, 15.5),
        ] {
            assert_eq!(
                logical_anchor_offset(
                    ToolWindowAnchor {
                        x,
                        y: 0,
                        width: 22,
                        height: 22,
                        scale_factor: scale,
                    },
                    PhysicalPosition::new(window_x, 24),
                    scale,
                ),
                expected,
            );
        }
    }

    #[test]
    fn tool_window_labels_are_host_owned_and_stable() {
        assert_eq!(ToolWindowKind::Paper.label(), "paper");
        assert_eq!(ToolWindowKind::QuickLauncher.label(), "launcher");
    }

    #[test]
    fn opening_a_tool_hides_only_peer_tool_windows() {
        assert_eq!(
            peer_tool_windows(ToolWindowKind::Paper).collect::<Vec<_>>(),
            vec![ToolWindowKind::QuickLauncher]
        );
        assert_eq!(
            peer_tool_windows(ToolWindowKind::QuickLauncher).collect::<Vec<_>>(),
            vec![ToolWindowKind::Paper]
        );
    }

    #[test]
    fn anchored_windows_center_below_the_exact_cell_and_clamp_to_work_areas() {
        let anchor = ToolWindowAnchor {
            x: -22,
            y: -900,
            width: 22,
            height: 22,
            scale_factor: 1.0,
        };
        let work_area = tauri::PhysicalRect {
            position: tauri::PhysicalPosition::new(-1920, -876),
            size: tauri::PhysicalSize::new(1920, 876),
        };
        assert_eq!(
            anchored_tool_window_position(anchor, tauri::PhysicalSize::new(464, 152), work_area, 6,),
            Some(tauri::PhysicalPosition::new(-464, -872))
        );
        assert_eq!(
            anchored_tool_window_position(
                ToolWindowAnchor { width: 0, ..anchor },
                tauri::PhysicalSize::new(464, 152),
                work_area,
                6,
            ),
            None
        );

        let right_display = tauri::PhysicalRect {
            position: tauri::PhysicalPosition::new(1440, 24),
            size: tauri::PhysicalSize::new(2560, 1416),
        };
        assert_eq!(
            anchored_tool_window_position(
                ToolWindowAnchor {
                    x: 3978,
                    y: 0,
                    width: 22,
                    height: 22,
                    scale_factor: 1.0,
                },
                tauri::PhysicalSize::new(504, 184),
                right_display,
                6,
            ),
            Some(tauri::PhysicalPosition::new(3496, 28))
        );

        let lower_display = tauri::PhysicalRect {
            position: tauri::PhysicalPosition::new(0, 900),
            size: tauri::PhysicalSize::new(1440, 900),
        };
        assert_eq!(
            anchored_tool_window_position(
                ToolWindowAnchor {
                    x: 700,
                    y: 876,
                    width: 22,
                    height: 22,
                    scale_factor: 1.0,
                },
                tauri::PhysicalSize::new(252, 92),
                lower_display,
                6,
            ),
            Some(tauri::PhysicalPosition::new(585, 904))
        );

        assert_eq!(
            anchored_tool_window_position(
                ToolWindowAnchor {
                    x: 0,
                    y: 0,
                    width: 22,
                    height: 22,
                    scale_factor: 1.0,
                },
                tauri::PhysicalSize::new(252, 92),
                tauri::PhysicalRect {
                    position: tauri::PhysicalPosition::new(0, 0),
                    size: tauri::PhysicalSize::new(200, 80),
                },
                6,
            ),
            None
        );
    }

    #[test]
    fn monitor_selection_uses_full_bounds_for_menu_bar_anchors() {
        let upper_monitor = tauri::PhysicalRect {
            position: tauri::PhysicalPosition::new(-1920, -900),
            size: tauri::PhysicalSize::new(1920, 900),
        };
        assert!(monitor_bounds_contain_anchor(
            upper_monitor,
            1.0,
            ToolWindowAnchor {
                x: -44,
                y: -900,
                width: 22,
                height: 22,
                scale_factor: 1.0,
            }
        ));
        assert!(!monitor_bounds_contain_anchor(
            upper_monitor,
            1.0,
            ToolWindowAnchor {
                x: 10,
                y: 0,
                width: 22,
                height: 22,
                scale_factor: 1.0,
            }
        ));
    }
}
