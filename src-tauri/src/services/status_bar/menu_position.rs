#[derive(Clone, Copy)]
pub(super) struct MenuRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub(super) fn popup_origin(cell: MenuRect, screen: MenuRect, menu_width: f64) -> (f64, f64) {
    let rightmost = (screen.x + screen.width - menu_width).max(screen.x);
    let x = cell.x.clamp(screen.x, rightmost);
    let y = cell.y.min(screen.y + screen.height) - 4.0;
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anchors_below_menu_bar_and_keeps_right_edge_visible() {
        let cell = MenuRect {
            x: 1400.0,
            y: 878.0,
            width: 22.0,
            height: 22.0,
        };
        let screen = MenuRect {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 878.0,
        };
        let (x, y) = popup_origin(cell, screen, 240.0);
        assert!(x + 240.0 <= 1440.0);
        assert!(y < 878.0);
    }

    #[test]
    fn preserves_secondary_display_origin_and_clamps_oversized_menu() {
        let cell = MenuRect {
            x: -1900.0,
            y: 1058.0,
            width: 22.0,
            height: 22.0,
        };
        let screen = MenuRect {
            x: -1920.0,
            y: 0.0,
            width: 1920.0,
            height: 1058.0,
        };
        let (x, y) = popup_origin(cell, screen, 2200.0);
        assert_eq!(x, -1920.0);
        assert!(y < 1058.0);
    }
}
