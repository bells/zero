use objc2::{define_class, msg_send, rc::Retained, DefinedClass, MainThreadOnly};
use objc2_app_kit::{NSToolTipTag, NSView};
use objc2_foundation::{
    MainThreadMarker, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
};
use std::{cell::RefCell, ffi::c_void};
use tauri::{tray::TrayIcon, Runtime};

struct TooltipIvars {
    title: Retained<NSString>,
}

define_class!(
    // NSObject has no subclass invariants; tooltip owners live on the main thread.
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = TooltipIvars]
    #[name = "ZeroStatusTooltipOwner"]
    struct TooltipOwner;

    unsafe impl NSObjectProtocol for TooltipOwner {}

    impl TooltipOwner {
        #[unsafe(method(view:stringForToolTip:point:userData:))]
        fn title(&self, _view: &NSView, _tag: NSToolTipTag, _point: NSPoint, _data: *mut c_void) -> *const NSString {
            Retained::as_ptr(&self.ivars().title)
        }
    }
);

impl TooltipOwner {
    fn new(title: &str, mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(TooltipIvars {
            title: NSString::from_str(title),
        });
        unsafe { msg_send![super(this), init] }
    }
}

struct Registration {
    view: Retained<NSView>,
    tags: Vec<NSToolTipTag>,
    _owners: Vec<Retained<TooltipOwner>>,
}

impl Drop for Registration {
    fn drop(&mut self) {
        for tag in &self.tags {
            self.view.removeToolTip(*tag);
        }
    }
}

thread_local! {
    static REGISTRATION: RefCell<Option<Registration>> = const { RefCell::new(None) };
}

pub fn apply<R: Runtime>(tray: &TrayIcon<R>, titles: Vec<String>) -> Result<(), String> {
    tray.with_inner_tray_icon(move |inner| {
        let mtm = MainThreadMarker::new().ok_or("tooltip update is not on the main thread")?;
        let item = inner.ns_status_item().ok_or("status item is unavailable")?;
        let button = item.button(mtm).ok_or("status button is unavailable")?;
        REGISTRATION.with(|slot| {
            // Remove old regions before releasing their callback owners.
            slot.borrow_mut().take();
            button.setToolTip(None);
            let bounds = button.bounds();
            let width = bounds.size.width / titles.len().max(1) as f64;
            let mut tags = Vec::new();
            let mut owners = Vec::new();
            for (index, title) in titles.iter().enumerate() {
                let owner = TooltipOwner::new(title, mtm);
                let rect = NSRect::new(
                    NSPoint::new(bounds.origin.x + width * index as f64, bounds.origin.y),
                    NSSize::new(width, bounds.size.height),
                );
                // AppKit borrows owner; Registration retains it until removal.
                tags.push(unsafe {
                    button.addToolTipRect_owner_userData(rect, &owner, std::ptr::null_mut())
                });
                owners.push(owner);
            }
            let view: Retained<NSView> = button.into_super().into_super().into_super();
            *slot.borrow_mut() = Some(Registration {
                view,
                tags,
                _owners: owners,
            });
        });
        Ok(())
    })
    .map_err(|error| error.to_string())?
}

pub fn clear(app: &tauri::AppHandle) {
    if MainThreadMarker::new().is_some() {
        clear_registration();
        return;
    }
    let _ = app.run_on_main_thread(clear_registration);
}

fn clear_registration() {
    REGISTRATION.with(|slot| {
        slot.borrow_mut().take();
    });
}
