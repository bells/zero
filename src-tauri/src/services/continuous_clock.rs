//! Suspend-inclusive elapsed time shared by native resource owners.
#[cfg(target_os = "macos")]
pub fn now_ms() -> Result<u64, String> {
    #[repr(C)]
    struct Timebase {
        numer: u32,
        denom: u32,
    }
    extern "C" {
        fn mach_continuous_time() -> u64;
        fn mach_timebase_info(info: *mut Timebase) -> i32;
    }
    let mut scale = Timebase { numer: 0, denom: 0 };
    // mach_continuous_time includes system sleep, unlike mach_absolute_time.
    unsafe {
        if mach_timebase_info(&mut scale) != 0 || scale.denom == 0 {
            return Err("clock_unavailable".into());
        }
        u64::try_from(
            u128::from(mach_continuous_time()) * u128::from(scale.numer)
                / u128::from(scale.denom)
                / 1_000_000,
        )
        .map_err(|_| "clock_unavailable".into())
    }
}
#[cfg(target_os = "windows")]
pub fn now_ms() -> Result<u64, String> {
    Ok(unsafe { windows::Win32::System::SystemInformation::GetTickCount64() })
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn now_ms() -> Result<u64, String> {
    Err("clock_unsupported".into())
}
