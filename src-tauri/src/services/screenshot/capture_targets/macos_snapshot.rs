use objc2_core_foundation::{CFDictionary, CFNumber, CFNumberType, CFString, CFType, CGRect};
use objc2_core_graphics::{
    CGRectMakeWithDictionaryRepresentation, CGWindowListCopyWindowInfo, CGWindowListOption,
};

use super::{NativeRect, NativeWindowSnapshot};

struct WindowKeys {
    number: objc2_core_foundation::CFRetained<CFString>,
    pid: objc2_core_foundation::CFRetained<CFString>,
    owner: objc2_core_foundation::CFRetained<CFString>,
    title: objc2_core_foundation::CFRetained<CFString>,
    bounds: objc2_core_foundation::CFRetained<CFString>,
    sharing: objc2_core_foundation::CFRetained<CFString>,
}

impl WindowKeys {
    fn new() -> Self {
        Self {
            number: CFString::from_str("kCGWindowNumber"),
            pid: CFString::from_str("kCGWindowOwnerPID"),
            owner: CFString::from_str("kCGWindowOwnerName"),
            title: CFString::from_str("kCGWindowName"),
            bounds: CFString::from_str("kCGWindowBounds"),
            sharing: CFString::from_str("kCGWindowSharingState"),
        }
    }
}

fn value<'a>(dictionary: &'a CFDictionary, key: &CFString) -> Option<&'a CFType> {
    // CoreGraphics owns these CF objects for the lifetime of the retained list.
    unsafe {
        dictionary
            .value((key as *const CFString).cast())
            .cast::<CFType>()
            .as_ref()
    }
}

fn number(dictionary: &CFDictionary, key: &CFString) -> Option<u32> {
    let number = value(dictionary, key)?.downcast_ref::<CFNumber>()?;
    let mut result = 0i64;
    let valid = unsafe { number.value(CFNumberType::SInt64Type, (&mut result as *mut i64).cast()) };
    valid.then(|| u32::try_from(result).ok()).flatten()
}

fn text(dictionary: &CFDictionary, key: &CFString) -> Option<String> {
    Some(
        value(dictionary, key)?
            .downcast_ref::<CFString>()?
            .to_string(),
    )
}

fn window(dictionary: &CFDictionary, keys: &WindowKeys) -> Option<NativeWindowSnapshot> {
    if number(dictionary, &keys.sharing)? == 0 {
        return None;
    }
    let bounds = value(dictionary, &keys.bounds)?.downcast_ref::<CFDictionary>()?;
    let mut rect = CGRect::default();
    if !unsafe { CGRectMakeWithDictionaryRepresentation(Some(bounds), &mut rect) } {
        return None;
    }
    Some(NativeWindowSnapshot {
        native_id: number(dictionary, &keys.number)?,
        process_id: number(dictionary, &keys.pid)?,
        app_name: text(dictionary, &keys.owner).unwrap_or_default(),
        title: text(dictionary, &keys.title).unwrap_or_default(),
        bounds: NativeRect {
            x: rect.origin.x,
            y: rect.origin.y,
            width: rect.size.width,
            height: rect.size.height,
        },
        // The single query excludes windows that are minimized or off screen.
        minimized: false,
    })
}

pub(super) fn windows() -> Result<Vec<NativeWindowSnapshot>, String> {
    let list = CGWindowListCopyWindowInfo(
        CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements,
        0,
    )
    .ok_or("native window snapshot unavailable")?;
    let keys = WindowKeys::new();
    Ok((0..list.count())
        .filter_map(|index| {
            let object = unsafe { list.value_at_index(index).cast::<CFType>().as_ref() }?;
            window(object.downcast_ref::<CFDictionary>()?, &keys)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "native metadata-only timing comparison; run explicitly on macOS"]
    fn native_window_query_timing() {
        for iteration in 0..3 {
            let start = std::time::Instant::now();
            let old = xcap::Window::all().expect("legacy windows");
            let count = old.len();
            for window in old {
                let _ = (
                    window.id(),
                    window.pid(),
                    window.app_name(),
                    window.title(),
                    window.x(),
                    window.y(),
                    window.width(),
                    window.height(),
                    window.is_minimized(),
                );
            }
            let legacy_us = start.elapsed().as_micros();
            let start = std::time::Instant::now();
            let batch_count = super::windows().expect("window snapshot").len();
            eprintln!("ZERO_SNAP_WINDOW_BENCH iteration={iteration} legacy_count={count} batch_count={batch_count} legacy_us={legacy_us} batch_us={}", start.elapsed().as_micros());
        }
    }
}
