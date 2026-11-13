#![cfg(all(target_os = "windows", target_env = "msvc"))]

use windows::{
    core::{w, PCSTR},
    Win32::{
        Foundation::FreeLibrary,
        System::LibraryLoader::{GetProcAddress, LoadLibraryW},
    },
};

#[test]
fn test_executable_activates_common_controls_v6() {
    unsafe {
        let library = LoadLibraryW(w!("comctl32.dll")).expect("Common Controls must load");
        let task_dialog = GetProcAddress(library, PCSTR(b"TaskDialogIndirect\0".as_ptr()));
        FreeLibrary(library).expect("Common Controls reference must be released");
        assert!(
            task_dialog.is_some(),
            "the executable manifest must activate Common Controls v6 for Tauri dialogs"
        );
    }
}
