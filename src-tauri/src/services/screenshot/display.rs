use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDisplaySnapshot {
    pub native_id: u32,
    pub logical_frame: DisplayFrame,
    pub physical_frame: DisplayFrame,
    pub pixel_width: u32,
    pub pixel_height: u32,
    pub source_scale_x: f64,
    pub source_scale_y: f64,
}

pub fn appkit_frame(frame: &DisplayFrame, primary_height: f64) -> Option<DisplayFrame> {
    if ![frame.x, frame.y, frame.width, frame.height, primary_height]
        .iter()
        .all(|n| n.is_finite())
        || frame.width <= 0.0
        || frame.height <= 0.0
        || primary_height <= 0.0
    {
        return None;
    }
    Some(DisplayFrame {
        x: frame.x,
        y: primary_height - frame.y - frame.height,
        width: frame.width,
        height: frame.height,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_origins_are_logical_and_preserve_negative_coordinates() {
        for (x, y, height, expected_y) in [
            (1440.0, 0.0, 900.0, 0.0),
            (-1920.0, 0.0, 1080.0, -180.0),
            (0.0, -1080.0, 1080.0, 900.0),
            (0.0, 900.0, 1080.0, -1080.0),
        ] {
            let result = appkit_frame(
                &DisplayFrame {
                    x,
                    y,
                    width: 1920.0,
                    height,
                },
                900.0,
            )
            .unwrap();
            assert_eq!(result.x, x);
            assert_eq!(result.y, expected_y);
        }
        assert!(appkit_frame(&DisplayFrame::default(), 900.0).is_none());
    }
    #[test]
    fn snapshot_contract_names_and_axis_scale_are_explicit() {
        let snapshot = CaptureDisplaySnapshot {
            native_id: 42,
            pixel_width: 2880,
            pixel_height: 1800,
            source_scale_x: 2.0,
            source_scale_y: 2.0,
            ..Default::default()
        };
        let json = serde_json::to_value(snapshot).unwrap();
        assert_eq!(json["nativeId"], 42);
        assert_eq!(json["pixelWidth"], 2880);
        assert_eq!(json["sourceScaleY"], 2.0);
        assert!(json.get("logicalFrame").is_some());
    }
}
