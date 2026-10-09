use super::status_bar_highlight_model::{HighlightModel, HighlightPhase};
use crate::brand::PRIMARY_STATUS_ITEM_ID;
use objc2::{define_class, msg_send, rc::Retained, DefinedClass, MainThreadOnly};
use objc2_app_kit::{
    NSBezierPath, NSButtonCell, NSCellStyleMask, NSColor, NSStatusBarButton, NSView,
};
use objc2_foundation::{MainThreadMarker, NSObjectProtocol, NSPoint, NSRect, NSSize};
use std::cell::RefCell;
use tauri::{tray::TrayIcon, Manager, Runtime};

#[derive(Default)]
struct OverlayIvars {
    rect: RefCell<Option<NSRect>>,
}

define_class!(
    // A drawing-only child view leaves status-button hit testing and tracking intact.
    #[unsafe(super = NSView)]
    #[thread_kind = MainThreadOnly]
    #[ivars = OverlayIvars]
    #[name = "ZeroStatusCellHighlight"]
    struct HighlightOverlay;

    unsafe impl NSObjectProtocol for HighlightOverlay {}

    impl HighlightOverlay {
        #[unsafe(method(hitTest:))]
        fn hit_test(&self, _point: NSPoint) -> *mut NSView { std::ptr::null_mut() }

        #[unsafe(method(drawRect:))]
        fn draw(&self, _dirty: NSRect) {
            if let Some(rect) = *self.ivars().rect.borrow() {
                // A translucent system accent keeps the existing template glyph readable.
                NSColor::selectedContentBackgroundColor().colorWithAlphaComponent(0.28).set();
                NSBezierPath::bezierPathWithRoundedRect_xRadius_yRadius(rect, 4.0, 4.0).fill();
            }
        }
    }
);

struct Registration {
    button: Retained<NSStatusBarButton>,
    cell: Retained<NSButtonCell>,
    original_highlight: NSCellStyleMask,
    original_state: NSCellStyleMask,
    overlay: Retained<HighlightOverlay>,
    ids: Vec<String>,
    model: HighlightModel,
}

impl Registration {
    fn redraw(&self) {
        let bounds = self.button.bounds();
        self.overlay.setFrame(bounds);
        let width = bounds.size.width / self.ids.len().max(1) as f64;
        let rect = self
            .model
            .cell_range(&self.ids, PRIMARY_STATUS_ITEM_ID)
            .map(|(index, count)| {
                NSRect::new(
                    NSPoint::new(width * index as f64 + 1.0, 1.0),
                    NSSize::new(
                        (width * count as f64 - 2.0).max(0.0),
                        (bounds.size.height - 2.0).max(0.0),
                    ),
                )
            });
        *self.overlay.ivars().rect.borrow_mut() = rect;
        NSView::setNeedsDisplay(&self.button, true);
        self.overlay.setNeedsDisplay(true);
    }
}

impl Drop for Registration {
    fn drop(&mut self) {
        self.overlay.removeFromSuperview();
        self.cell.setHighlightsBy(self.original_highlight);
        self.cell.setShowsStateBy(self.original_state);
    }
}

thread_local! { static REGISTRATION: RefCell<Option<Registration>> = const { RefCell::new(None) }; }

pub fn apply<R: Runtime>(tray: &TrayIcon<R>, ids: Vec<String>) -> Result<(), String> {
    tray.with_inner_tray_icon(move |inner| {
        let mtm = MainThreadMarker::new().ok_or("highlight update requires main thread")?;
        let button = inner
            .ns_status_item()
            .ok_or("status item unavailable")?
            .button(mtm)
            .ok_or("status button unavailable")?;
        REGISTRATION.with(|slot| {
            let mut stored = slot.borrow_mut();
            if let Some(existing) = stored.as_mut() {
                if Retained::as_ptr(&existing.button) == Retained::as_ptr(&button) {
                    existing.ids = ids;
                    existing.model.retain_visible(&existing.ids);
                    existing.redraw();
                    return Ok(());
                }
            }
            stored.take();
            let cell = button
                .cell()
                .ok_or("status button has no cell")?
                .downcast::<NSButtonCell>()
                .map_err(|_| "status button cell is not NSButtonCell")?;
            let original_highlight = cell.highlightsBy();
            let original_state = cell.showsStateBy();
            // tray-icon still calls highlight(true); this mask prevents whole-button drawing.
            cell.setHighlightsBy(NSCellStyleMask::NoCellMask);
            cell.setShowsStateBy(NSCellStyleMask::NoCellMask);
            let this = HighlightOverlay::alloc(mtm).set_ivars(OverlayIvars::default());
            let overlay: Retained<HighlightOverlay> =
                unsafe { msg_send![super(this), initWithFrame: button.bounds()] };
            button.addSubview(&overlay);
            let registration = Registration {
                button,
                cell,
                original_highlight,
                original_state,
                overlay,
                ids,
                model: HighlightModel::default(),
            };
            registration.redraw();
            *stored = Some(registration);
            Ok(())
        })
    })
    .map_err(|error| error.to_string())?
}

pub fn begin(tray: &TrayIcon, id: String, phase: HighlightPhase) -> Result<u64, String> {
    tray.with_inner_tray_icon(move |_| {
        REGISTRATION.with(|slot| {
            let mut stored = slot.borrow_mut();
            let registration = stored.as_mut().ok_or("highlight adapter unavailable")?;
            let generation = registration.model.begin(id, phase);
            registration.redraw();
            Ok(generation)
        })
    })
    .map_err(|error| error.to_string())?
}

pub fn clear(tray: &TrayIcon, generation: u64) {
    let _ = tray.with_inner_tray_icon(move |_| {
        REGISTRATION.with(|slot| {
            if let Some(registration) = slot.borrow_mut().as_mut() {
                registration.model.clear(generation);
                registration.redraw();
            }
        })
    });
}

pub fn clear_press(tray: &TrayIcon) {
    let _ = tray.with_inner_tray_icon(|_| {
        REGISTRATION.with(|slot| {
            if let Some(registration) = slot.borrow_mut().as_mut() {
                if matches!(registration.model.active, Some((_, HighlightPhase::Press))) {
                    registration.model.active = None;
                    registration.redraw();
                }
            }
        })
    });
}

pub fn finish_press(tray: &TrayIcon, id: String) -> Result<bool, String> {
    tray.with_inner_tray_icon(move |_| {
        REGISTRATION.with(|slot| {
            let mut stored = slot.borrow_mut();
            let registration = stored.as_mut().ok_or("highlight adapter unavailable")?;
            let accepted = registration.model.release_press(&id);
            registration.redraw();
            Ok(accepted)
        })
    })
    .map_err(|error| error.to_string())?
}

pub fn sync_surface(app: &tauri::AppHandle, label: &str) {
    let Some(tray) = app.tray_by_id(PRIMARY_STATUS_ITEM_ID) else {
        return;
    };
    let label = label.to_string();
    let app = app.clone();
    let _ = tray.with_inner_tray_icon(move |_| {
        // Recheck on the native thread so a delayed blur cannot clear a reopened surface.
        let active = app.get_webview_window(&label).is_some_and(|window| {
            window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
        });
        if active { return; }
        REGISTRATION.with(|slot| {
            if let Some(registration) = slot.borrow_mut().as_mut() {
                if matches!(registration.model.active.as_ref(), Some((_, HighlightPhase::Surface(current))) if current == &label) {
                    registration.model.active = None;
                    registration.redraw();
                }
            }
        });
    });
}

pub fn shutdown(app: &tauri::AppHandle) {
    let _ = app.run_on_main_thread(|| {
        REGISTRATION.with(|slot| {
            slot.borrow_mut().take();
        })
    });
}
