use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
static REVISION: AtomicU64 = AtomicU64::new(0);
fn changed() {
    REVISION.fetch_add(1, Ordering::Relaxed);
}
pub fn revision() -> u64 {
    REVISION.load(Ordering::Relaxed)
}

pub struct NativePowerEvents {
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl NativePowerEvents {
    pub fn new() -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = Arc::clone(&stop);
        let thread = std::thread::Builder::new()
            .name("zero-awake-events".into())
            .spawn(move || platform::watch(stopped))
            .ok();
        Self { stop, thread }
    }
}
impl Drop for NativePowerEvents {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::c_void;
    type Id = *mut objc::runtime::Object;
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPSNotificationCreateRunLoopSource(
            callback: extern "C" fn(*mut c_void),
            context: *mut c_void,
        ) -> *const c_void;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFRunLoopDefaultMode: *const c_void;
        fn CFRunLoopGetCurrent() -> *const c_void;
        fn CFRunLoopAddSource(loop_: *const c_void, source: *const c_void, mode: *const c_void);
        fn CFRunLoopRemoveSource(loop_: *const c_void, source: *const c_void, mode: *const c_void);
        fn CFRunLoopRunInMode(mode: *const c_void, seconds: f64, return_after_source: bool) -> i32;
        fn CFRelease(object: *const c_void);
    }
    extern "C" fn power_changed(_: *mut c_void) {
        changed();
    }
    pub fn watch(stop: Arc<AtomicBool>) {
        objc2::rc::autoreleasepool(|_| unsafe {
            let source = IOPSNotificationCreateRunLoopSource(power_changed, std::ptr::null_mut());
            let loop_ = CFRunLoopGetCurrent();
            if !source.is_null() {
                CFRunLoopAddSource(loop_, source, kCFRunLoopDefaultMode);
            }
            let nil = std::ptr::null_mut::<objc::runtime::Object>();
            let center: Id = msg_send![class!(NSNotificationCenter), defaultCenter];
            let workspace: Id = msg_send![class!(NSWorkspace), sharedWorkspace];
            let workspace_center: Id = msg_send![workspace, notificationCenter];
            let block = block2::RcBlock::new(|_: *mut c_void| changed());
            let mut observers = Vec::new();
            for (owner, name) in [
                (center, "NSProcessInfoPowerStateDidChangeNotification"),
                (workspace_center, "NSWorkspaceDidWakeNotification"),
            ] {
                let name = objc2_foundation::NSString::from_str(name);
                let name_ptr = objc2::rc::Retained::as_ptr(&name).cast::<objc::runtime::Object>();
                let observer: Id = msg_send![owner,addObserverForName:name_ptr object:nil queue:nil usingBlock:std::ptr::from_ref(&*block).cast::<c_void>()];
                if !observer.is_null() {
                    let _: Id = msg_send![observer, retain];
                    observers.push((owner, observer));
                }
            }
            while !stop.load(Ordering::Relaxed) {
                CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.25, false);
            }
            for (owner, observer) in observers {
                let _: () = msg_send![owner,removeObserver:observer];
                let _: () = msg_send![observer, release];
            }
            if !source.is_null() {
                CFRunLoopRemoveSource(loop_, source, kCFRunLoopDefaultMode);
                CFRelease(source);
            }
        });
    }
}
#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use windows::Win32::{
        Foundation::HANDLE,
        System::{
            Power::*,
            SystemServices::{
                GUID_ACDC_POWER_SOURCE, GUID_BATTERY_PERCENTAGE_REMAINING, GUID_POWER_SAVING_STATUS,
            },
        },
        UI::WindowsAndMessaging::DEVICE_NOTIFY_CALLBACK,
    };
    unsafe extern "system" fn callback(
        _: *const std::ffi::c_void,
        _: u32,
        _: *const std::ffi::c_void,
    ) -> u32 {
        changed();
        0
    }
    pub fn watch(stop: Arc<AtomicBool>) {
        unsafe {
            let params = Box::new(DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS {
                Callback: Some(callback),
                Context: std::ptr::null_mut(),
            });
            let recipient = HANDLE(std::ptr::from_ref(&*params) as isize);
            let mut handles = Vec::new();
            for guid in [
                GUID_ACDC_POWER_SOURCE,
                GUID_BATTERY_PERCENTAGE_REMAINING,
                GUID_POWER_SAVING_STATUS,
            ] {
                let mut handle = std::ptr::null_mut();
                if PowerSettingRegisterNotification(
                    &guid,
                    DEVICE_NOTIFY_CALLBACK,
                    recipient,
                    &mut handle,
                )
                .is_ok()
                {
                    handles.push(HPOWERNOTIFY(handle as isize));
                }
            }
            let mut resume = std::ptr::null_mut();
            let resume_registered = PowerRegisterSuspendResumeNotification(
                DEVICE_NOTIFY_CALLBACK,
                recipient,
                &mut resume,
            )
            .is_ok();
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
            for handle in handles {
                let _ = PowerSettingUnregisterNotification(handle);
            }
            if resume_registered {
                let _ = PowerUnregisterSuspendResumeNotification(HPOWERNOTIFY(resume as isize));
            }
        }
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::*;
    pub fn watch(_: Arc<AtomicBool>) {}
}
