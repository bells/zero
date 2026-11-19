use super::{check_input, modified_at, skip, Candidate, ParseError};
use std::collections::HashMap;
use std::fs::{Metadata, OpenOptions};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use windows::core::{ComInterface, PCWSTR};
use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ,
};

pub fn application_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(program_data) = std::env::var_os("PROGRAMDATA") {
        roots.push(
            PathBuf::from(program_data)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    if let Some(app_data) = std::env::var_os("APPDATA") {
        roots.push(
            PathBuf::from(app_data)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    roots
}

pub(super) fn is_candidate(path: &Path, metadata: &Metadata) -> bool {
    metadata.is_file()
        && path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("lnk") || extension.eq_ignore_ascii_case("exe")
            })
}

pub(super) fn insert(by_identity: &mut HashMap<String, Candidate>, candidate: Candidate) {
    by_identity.insert(candidate.identity.clone(), candidate);
}

pub(super) fn parse_candidate(
    canonical: PathBuf,
    metadata: &Metadata,
    limit: usize,
) -> Result<Candidate, ParseError> {
    let is_shortcut = canonical
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("lnk"));
    let executable_path = if is_shortcut {
        check_input(metadata, &canonical, limit)?;
        read_shortcut(&canonical, limit)?
    } else {
        canonical.clone()
    };
    let identity = executable_path.to_string_lossy().to_lowercase();
    let title = canonical
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| skip(&canonical, "has no display name"))?
        .to_owned();
    Ok(Candidate {
        identity,
        title,
        icon_source: canonical.clone(),
        path: canonical,
        bundle_id: None,
        executable_path: Some(executable_path),
        modified_at: modified_at(metadata),
    })
}

fn read_shortcut(path: &Path, limit: usize) -> Result<PathBuf, ParseError> {
    // ShellLink loads a path. Keep this read handle open without write/delete sharing
    // so the file cannot be replaced or enlarged between the size check and Load.
    let file = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| skip(path, "could not be resolved safely"))?;
    let metadata = file
        .metadata()
        .map_err(|_| skip(path, "could not be resolved safely"))?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(skip(path, "could not be resolved safely"));
    }
    check_input(&metadata, path, limit)?;
    let result = resolve_shortcut_target(path).map_err(|_| {
        ParseError::Skipped(format!("{} could not be resolved safely", path.display()))
    });
    drop(file);
    result
}

struct ComApartment;

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn resolve_shortcut_target(shortcut: &Path) -> Result<PathBuf, String> {
    unsafe {
        let _apartment = CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .is_ok()
            .then(|| ComApartment);
        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("failed to create ShellLink: {error}"))?;
        let persist: IPersistFile = shell_link
            .cast()
            .map_err(|error| format!("failed to access shortcut persistence: {error}"))?;
        let shortcut_wide: Vec<u16> = shortcut
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        persist
            .Load(PCWSTR(shortcut_wide.as_ptr()), STGM_READ)
            .map_err(|error| format!("failed to load shortcut: {error}"))?;
        let mut target = vec![0_u16; 32_768];
        let mut metadata = WIN32_FIND_DATAW::default();
        shell_link
            .GetPath(&mut target, &mut metadata, 0)
            .map_err(|error| format!("failed to resolve shortcut: {error}"))?;
        let length = target
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(target.len());
        if length == 0 {
            return Err("shortcut target is empty".into());
        }
        let path = PathBuf::from(String::from_utf16_lossy(&target[..length]));
        if !path.is_file() {
            return Err(format!(
                "shortcut target does not exist: {}",
                path.display()
            ));
        }
        Ok(path)
    }
}
