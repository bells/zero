//! Windows owns the selection UI and the resulting screenshot.
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::SystemInformation::GetSystemDirectoryW;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

pub fn open() -> std::io::Result<()> {
    let result = unsafe {
        ShellExecuteW(
            HWND::default(),
            w!("open"),
            w!("ms-screenclip:"),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 > 32 {
        return Ok(());
    }
    let mut path = [0_u16; 32_768];
    let length = unsafe { GetSystemDirectoryW(Some(&mut path)) } as usize;
    if length == 0 || length >= path.len() {
        return Err(std::io::Error::other(
            "Windows system directory is unavailable",
        ));
    }
    let directory = PathBuf::from(OsString::from_wide(&path[..length]));
    std::process::Command::new(directory.join("SnippingTool.exe")).spawn()?;
    Ok(())
}
