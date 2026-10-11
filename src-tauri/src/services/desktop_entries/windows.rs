use super::{owned_directory, real_directory, regular_file_or_missing, write_changed, TOOLS};
use sha2::{Digest, Sha256};
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use windows::core::{ComInterface, PCWSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

#[derive(serde::Serialize, serde::Deserialize)]
struct ShortcutIdentity {
    target: String,
    sha256: String,
}

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}

pub(super) fn install() -> Result<(), String> {
    let app_data = std::env::var_os("APPDATA").ok_or("user application directory unavailable")?;
    let programs = PathBuf::from(app_data).join("Microsoft/Windows/Start Menu/Programs");
    real_directory(&programs)?;
    let root = programs.join("Zero Tools");
    owned_directory(&root)?;
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let executable_wide = wide(executable.as_os_str());
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).map_err(|e| e.to_string())?;
        let result = (|| {
            for (tool, title) in TOOLS {
                let path = root.join(format!("{title}.lnk"));
                regular_file_or_missing(&path)?;
                let identity = path.with_extension("zero-target");
                regular_file_or_missing(&identity)?;
                let target = format!("{}\n{tool}", executable.display());
                if path.exists() {
                    let previous: ShortcutIdentity = std::fs::read(&identity)
                        .ok()
                        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                        .ok_or("shortcut belongs to another owner")?;
                    let current = std::fs::read(&path).map_err(|e| e.to_string())?;
                    if format!("{:x}", Sha256::digest(&current)) != previous.sha256 {
                        return Err("shortcut has been modified by another owner".into());
                    }
                    if previous.target == target {
                        continue;
                    }
                }
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| e.to_string())?;
                link.SetPath(PCWSTR(executable_wide.as_ptr()))
                    .map_err(|e| e.to_string())?;
                let arguments = wide(std::ffi::OsStr::new(&format!("--zero-tool {tool}")));
                link.SetArguments(PCWSTR(arguments.as_ptr()))
                    .map_err(|e| e.to_string())?;
                link.SetIconLocation(PCWSTR(executable_wide.as_ptr()), 0)
                    .map_err(|e| e.to_string())?;
                let persist: IPersistFile = link.cast().map_err(|e| e.to_string())?;
                let path_wide = wide(path.as_os_str());
                persist
                    .Save(PCWSTR(path_wide.as_ptr()), true)
                    .map_err(|e| e.to_string())?;
                let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
                let identity_bytes = serde_json::to_vec(&ShortcutIdentity {
                    target,
                    sha256: format!("{:x}", Sha256::digest(bytes)),
                })
                .map_err(|e| e.to_string())?;
                write_changed(&identity, &identity_bytes)?;
            }
            Ok(())
        })();
        CoUninitialize();
        result
    }
}
