#![allow(deprecated, unexpected_cfgs)]

use std::collections::HashSet;
use std::ffi::CStr;

use cocoa::base::{id, nil};
use cocoa::foundation::NSString;
use objc::{class, msg_send, sel, sel_impl};

use crate::services::application_catalog::ActivationError;

use super::{PlatformActivation, PlatformIcon, RunningStates};
use crate::services::quick_launcher::contracts::{
    launcher_error, QuickLauncherActivationAction, QuickLauncherRunningState,
};
use crate::services::quick_launcher::model::{IndexedItem, LaunchTarget};

pub fn probe_running(items: &[IndexedItem]) -> RunningStates {
    let running_bundle_ids = running_bundle_ids();
    items
        .iter()
        .map(|item| {
            let state = match &item.target {
                LaunchTarget::Application {
                    bundle_id: Some(bundle_id),
                    ..
                } => {
                    if running_bundle_ids.contains(bundle_id) {
                        QuickLauncherRunningState::Running
                    } else {
                        QuickLauncherRunningState::NotRunning
                    }
                }
                LaunchTarget::Application { .. } => QuickLauncherRunningState::Unknown,
                LaunchTarget::SystemSetting { .. } => QuickLauncherRunningState::NotApplicable,
            };
            (item.id.clone(), state)
        })
        .collect()
}

fn running_bundle_ids() -> HashSet<String> {
    unsafe {
        let pool: id = msg_send![class!(NSAutoreleasePool), new];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let applications: id = msg_send![workspace, runningApplications];
        let count: usize = msg_send![applications, count];
        let mut bundle_ids = HashSet::new();
        for index in 0..count {
            let application: id = msg_send![applications, objectAtIndex: index];
            let bundle_id: id = msg_send![application, bundleIdentifier];
            if bundle_id != nil {
                let bytes: *const std::os::raw::c_char = msg_send![bundle_id, UTF8String];
                if !bytes.is_null() {
                    bundle_ids.insert(CStr::from_ptr(bytes).to_string_lossy().into_owned());
                }
            }
        }
        let _: () = msg_send![pool, drain];
        bundle_ids
    }
}

pub fn activate(item: &IndexedItem) -> PlatformActivation {
    let LaunchTarget::Application {
        path, bundle_id, ..
    } = &item.target
    else {
        return Err(launcher_error(
            "launcher.launchOrFocus",
            "launcher.item_kind_invalid",
            "The selected item is not an application.",
            false,
        ));
    };
    use crate::services::application_catalog::{activate_application, Activation};
    match activate_application(path, bundle_id.as_deref(), false) {
        Ok(Activation::Focused) => Ok(QuickLauncherActivationAction::Focused),
        Ok(Activation::Launched) => Ok(QuickLauncherActivationAction::Launched),
        Err(ActivationError::Focus) => Err(launcher_error(
            "launcher.launchOrFocus",
            "launcher.focus_denied",
            format!("macOS did not focus {}.", item.title),
            true,
        )),
        Err(ActivationError::Open) => Err(launcher_error(
            "launcher.launchOrFocus",
            "launcher.launch_failed",
            format!("macOS could not launch {}.", item.title),
            true,
        )),
    }
}

pub fn open_setting(uri: &str) -> PlatformActivation {
    unsafe {
        let pool: id = msg_send![class!(NSAutoreleasePool), new];
        let native_uri = NSString::alloc(nil).init_str(uri);
        let url: id = msg_send![class!(NSURL), URLWithString: native_uri];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let opened: bool = msg_send![workspace, openURL: url];
        let _: () = msg_send![native_uri, release];
        let _: () = msg_send![pool, drain];
        if opened {
            Ok(QuickLauncherActivationAction::OpenedSetting)
        } else {
            Err(launcher_error(
                "launcher.openSystemSetting",
                "launcher.setting_open_failed",
                "macOS did not accept the system setting destination.",
                true,
            ))
        }
    }
}

pub fn load_icon(item: &IndexedItem) -> PlatformIcon {
    let Some(path) = item.icon_source.as_ref() else {
        return Ok(None);
    };
    unsafe {
        let pool: id = msg_send![class!(NSAutoreleasePool), new];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let native_path = NSString::alloc(nil).init_str(&path.to_string_lossy());
        let image: id = msg_send![workspace, iconForFile: native_path];
        let tiff: id = msg_send![image, TIFFRepresentation];
        let bitmap: id = msg_send![class!(NSBitmapImageRep), imageRepWithData: tiff];
        let properties: id = msg_send![class!(NSDictionary), dictionary];
        let data: id = msg_send![bitmap, representationUsingType: 4usize properties: properties];
        let result = if data == nil {
            None
        } else {
            let length: usize = msg_send![data, length];
            let bytes: *const u8 = msg_send![data, bytes];
            if bytes.is_null() || length == 0 || length > 2 * 1024 * 1024 {
                None
            } else {
                Some(std::slice::from_raw_parts(bytes, length).to_vec())
            }
        };
        let _: () = msg_send![native_path, release];
        let _: () = msg_send![pool, drain];
        Ok(result)
    }
}
