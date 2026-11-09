use super::{native::edit_focused_window, NativeMenuEditAction};
use objc2::{
    define_class, msg_send, rc::Retained, runtime::AnyObject, DefinedClass, MainThreadOnly,
};
use objc2_app_kit::{NSApplication, NSMenuItem};
use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};

struct EditingIvars {
    app: tauri::AppHandle,
}

define_class!(
    // AppKit invokes editing synchronously, including inside native modal loops.
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = EditingIvars]
    #[name = "ZeroMenuEditingTarget"]
    struct EditingTarget;

    unsafe impl NSObjectProtocol for EditingTarget {}

    impl EditingTarget {
        // AppKit requires this opt-in for targets outside the modal window.
        #[unsafe(method(worksWhenModal))]
        fn works_when_modal(&self) -> bool {
            true
        }

        #[unsafe(method(undo:))]
        fn undo(&self, _sender: Option<&AnyObject>) {
            self.perform(NativeMenuEditAction::Undo);
        }

        #[unsafe(method(redo:))]
        fn redo(&self, _sender: Option<&AnyObject>) {
            self.perform(NativeMenuEditAction::Redo);
        }
    }
);

impl EditingTarget {
    fn new(app: tauri::AppHandle, mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(EditingIvars { app });
        // NSObject initialization preserves the initialized ivars.
        unsafe { msg_send![super(this), init] }
    }

    fn perform(&self, action: NativeMenuEditAction) {
        let mut diagnostic = crate::services::diagnostics::Operation::new(None, "window");
        diagnostic.finish(&edit_focused_window(&self.ivars().app, action));
    }
}

pub(super) fn attach(app: &tauri::AppHandle) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("menu editing requires main thread")?;
    let application = NSApplication::sharedApplication(mtm);
    let edit_menu = application
        .mainMenu()
        .and_then(|menu| menu.itemAtIndex(2))
        .and_then(|item| item.submenu())
        .ok_or("native Edit menu unavailable")?;
    let owner = EditingTarget::new(app.clone(), mtm);
    for (index, selector) in [(0, objc2::sel!(undo:)), (1, objc2::sel!(redo:))] {
        let item: Retained<NSMenuItem> = edit_menu
            .itemAtIndex(index)
            .ok_or("native edit action unavailable")?;
        // NSMenuItem borrows its target and retains representedObject. Each item
        // owns this callback for exactly its own lifetime, including menu tracking.
        unsafe {
            item.setRepresentedObject(Some(&owner));
            item.setTarget(Some(&owner));
            item.setAction(Some(selector));
        }
    }
    Ok(())
}
