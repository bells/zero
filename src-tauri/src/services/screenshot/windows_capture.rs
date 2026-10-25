#[cfg(any(target_os = "windows", test))]
use super::display::{CaptureDisplaySnapshot, DisplayFrame};
#[cfg(any(target_os = "windows", test))]
use super::{screenshot_error, ScreenshotError};

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone)]
pub(in crate::services::screenshot) struct DisplayIdentity {
    monitor: isize,
    device: [u16; 32],
    display: CaptureDisplaySnapshot,
    dpi_x: u32,
    dpi_y: u32,
}

#[cfg(any(target_os = "windows", test))]
impl DisplayIdentity {
    fn matches(&self, current: &Self) -> bool {
        // Enumeration order can change after hot-plugging; native_id is metadata only.
        self.monitor == current.monitor
            && self.device == current.device
            && self.dpi_x == current.dpi_x
            && self.dpi_y == current.dpi_y
            && self.display.logical_frame == current.display.logical_frame
            && self.display.physical_frame == current.display.physical_frame
            && self.display.pixel_width == current.display.pixel_width
            && self.display.pixel_height == current.display.pixel_height
            && self.display.source_scale_x == current.display.source_scale_x
            && self.display.source_scale_y == current.display.source_scale_y
    }
}

#[cfg(any(target_os = "windows", test))]
pub(super) fn display_snapshot(
    native_id: u32,
    physical: DisplayFrame,
    dpi_x: u32,
    dpi_y: u32,
) -> Result<CaptureDisplaySnapshot, ScreenshotError> {
    if ![physical.x, physical.y, physical.width, physical.height]
        .iter()
        .all(|n| n.is_finite())
        || physical.width < 1.0
        || physical.height < 1.0
        || physical.width > 32_768.0
        || physical.height > 32_768.0
        || physical.width * physical.height > 268_435_456.0
        || dpi_x == 0
        || dpi_y == 0
    {
        return Err(screenshot_error(
            "screenshot.monitor",
            "显示器坐标或缩放无效",
            true,
        ));
    }
    let scale_x = f64::from(dpi_x) / 96.0;
    let scale_y = f64::from(dpi_y) / 96.0;
    Ok(CaptureDisplaySnapshot {
        native_id,
        logical_frame: DisplayFrame {
            x: physical.x / scale_x,
            y: physical.y / scale_y,
            width: physical.width / scale_x,
            height: physical.height / scale_y,
        },
        pixel_width: physical.width as u32,
        pixel_height: physical.height as u32,
        physical_frame: physical,
        source_scale_x: scale_x,
        source_scale_y: scale_y,
    })
}

pub(super) fn permits_image_commit(windows: bool, initial_action: &str) -> bool {
    !(windows && initial_action == "ocr")
}

#[cfg(target_os = "windows")]
mod native;
#[cfg(target_os = "windows")]
pub(super) use native::{capture, display_at_point, open_capture_window};

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(monitor: isize, device: u16, native_id: u32) -> DisplayIdentity {
        let mut name = [0; 32];
        name[0] = device;
        DisplayIdentity {
            monitor,
            device: name,
            display: display_snapshot(
                native_id,
                DisplayFrame {
                    x: -1920.0,
                    y: 0.0,
                    width: 1920.0,
                    height: 1080.0,
                },
                120,
                120,
            )
            .unwrap(),
            dpi_x: 120,
            dpi_y: 120,
        }
    }

    #[test]
    fn removing_an_earlier_monitor_never_selects_its_successor_by_ordinal() {
        let requested = identity(20, 66, 2);
        let current = [identity(20, 66, 1), identity(30, 67, 2)];
        let selected = current
            .iter()
            .find(|candidate| requested.matches(candidate));
        assert_eq!(selected.map(|candidate| candidate.monitor), Some(20));
    }

    #[test]
    fn removed_target_cannot_be_replaced_by_the_same_ordinal_or_reused_handle() {
        let requested = identity(20, 66, 2);
        assert!(!requested.matches(&identity(30, 67, 2)));
        assert!(!requested.matches(&identity(20, 67, 2)));
    }

    #[test]
    fn existing_monitor_identity_requires_unchanged_geometry_and_dpi() {
        let requested = identity(20, 66, 2);
        let mut moved = requested.clone();
        moved.display.physical_frame.x = 0.0;
        assert!(!requested.matches(&moved));
        let mut scaled = requested.clone();
        scaled.dpi_x = 144;
        assert!(!requested.matches(&scaled));
        let mut resized = requested.clone();
        resized.display.pixel_width = 2560;
        assert!(!requested.matches(&resized));
        assert!(requested.matches(&requested));
    }

    #[test]
    fn negative_origin_and_mixed_dpi_keep_physical_pixels_authoritative() {
        let snapshot = display_snapshot(
            2,
            DisplayFrame {
                x: -2560.0,
                y: -320.0,
                width: 2560.0,
                height: 1440.0,
            },
            120,
            144,
        )
        .unwrap();
        assert_eq!(snapshot.physical_frame.x, -2560.0);
        assert_eq!(snapshot.physical_frame.y, -320.0);
        assert_eq!(snapshot.logical_frame.width, 2048.0);
        assert_eq!(snapshot.logical_frame.height, 960.0);
        assert_eq!((snapshot.pixel_width, snapshot.pixel_height), (2560, 1440));
        assert_eq!(
            (snapshot.source_scale_x, snapshot.source_scale_y),
            (1.25, 1.5)
        );
    }

    #[test]
    fn invalid_dimensions_or_dpi_never_authorize_a_frozen_capture() {
        for (frame, dpi_x, dpi_y) in [
            (
                DisplayFrame {
                    width: 1920.0,
                    height: 1080.0,
                    ..Default::default()
                },
                0,
                96,
            ),
            (
                DisplayFrame {
                    width: f64::NAN,
                    height: 1080.0,
                    ..Default::default()
                },
                96,
                96,
            ),
            (
                DisplayFrame {
                    width: 1920.0,
                    height: -1.0,
                    ..Default::default()
                },
                96,
                96,
            ),
        ] {
            assert!(display_snapshot(1, frame, dpi_x, dpi_y).is_err());
        }
    }

    #[test]
    fn windows_ocr_authority_rejects_image_commit_but_preserves_macos_actions() {
        assert!(!permits_image_commit(true, "ocr"));
        assert!(permits_image_commit(true, "copy"));
        assert!(permits_image_commit(false, "ocr"));
    }
}
