use super::{check_input, metadata_without_links, modified_at, skip, Candidate, ParseError};
use plist::Value;
use std::collections::HashMap;
use std::fs::{Metadata, OpenOptions};
use std::io::{Cursor, Read};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Component, Path, PathBuf};

pub fn application_roots() -> Vec<PathBuf> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.insert(1, PathBuf::from(home).join("Applications"));
    }
    roots
}

pub(super) fn is_candidate(path: &Path, metadata: &Metadata) -> bool {
    let extension = path.extension().and_then(|extension| extension.to_str());
    if metadata.is_file() {
        return extension.is_some_and(|extension| extension.eq_ignore_ascii_case("app"));
    }
    metadata.is_dir() && extension == Some("app")
}

pub(super) fn insert(by_identity: &mut HashMap<String, Candidate>, candidate: Candidate) {
    by_identity
        .entry(candidate.identity.clone())
        .or_insert(candidate);
}

pub(super) fn parse_candidate(
    canonical: PathBuf,
    metadata: &Metadata,
    limit: usize,
) -> Result<Candidate, ParseError> {
    let contents = canonical.join("Contents");
    let plist_path = contents.join("Info.plist");
    metadata_without_links(&contents).map_err(|error| skip(&plist_path, error))?;
    let plist_metadata =
        metadata_without_links(&plist_path).map_err(|error| skip(&plist_path, error))?;
    check_input(&plist_metadata, &plist_path, limit)?;
    let dictionary = read_plist(&plist_path, limit)?
        .into_dictionary()
        .ok_or_else(|| skip(&plist_path, "not a plist dictionary"))?;
    let title = plist_string(&dictionary, "CFBundleDisplayName")
        .or_else(|| plist_string(&dictionary, "CFBundleName"))
        .or_else(|| canonical.file_stem().and_then(|name| name.to_str()))
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| skip(&canonical, "has no display name"))?
        .to_owned();
    let bundle_id = plist_string(&dictionary, "CFBundleIdentifier").map(str::to_owned);
    let executable_path = plist_string(&dictionary, "CFBundleExecutable")
        .map(|name| executable_path(&canonical, name))
        .transpose()?;
    let identity = bundle_id
        .clone()
        .unwrap_or_else(|| canonical.to_string_lossy().to_lowercase());
    Ok(Candidate {
        identity,
        title,
        icon_source: canonical.clone(),
        path: canonical,
        bundle_id,
        executable_path,
        modified_at: modified_at(metadata),
    })
}

fn read_plist(path: &Path, limit: usize) -> Result<Value, ParseError> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(|error| skip(path, error))?;
    let metadata = file.metadata().map_err(|error| skip(path, error))?;
    check_input(&metadata, path, limit)?;
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| skip(path, error))?;
    if bytes.len() > limit {
        return Err(ParseError::InputLimit);
    }
    Value::from_reader(Cursor::new(bytes)).map_err(|error| skip(path, error))
}

fn executable_path(bundle: &Path, name: &str) -> Result<PathBuf, ParseError> {
    let invalid = || skip(bundle, "has no valid executable");
    if !matches!(
        Path::new(name).components().collect::<Vec<_>>().as_slice(),
        [Component::Normal(_)]
    ) {
        return Err(invalid());
    }

    let path = bundle.join("Contents/MacOS").join(name);
    let real = path.canonicalize().map_err(|_| invalid())?;
    if !real.starts_with(bundle) {
        return Err(invalid());
    }
    Ok(path)
}

fn plist_string<'a>(dictionary: &'a plist::Dictionary, key: &str) -> Option<&'a str> {
    dictionary.get(key).and_then(Value::as_string)
}

pub(crate) enum Activation {
    Focused,
    Launched,
}

pub(crate) enum ActivationError {
    Focus,
    Open,
}

#[derive(Clone, PartialEq)]
struct FileIdentity {
    dev: u64,
    inode: u64,
    ctime: i64,
    ctime_nsec: i64,
}

impl FileIdentity {
    fn read(path: &Path) -> Option<Self> {
        use std::os::unix::fs::MetadataExt;

        let metadata = metadata_without_links(path).ok()?;
        Some(Self {
            dev: metadata.dev(),
            inode: metadata.ino(),
            ctime: metadata.ctime(),
            ctime_nsec: metadata.ctime_nsec(),
        })
    }
}

#[derive(Clone)]
pub(crate) struct ApplicationTarget {
    path: PathBuf,
    bundle_id: Option<String>,
    executable: PathBuf,
    fingerprint: [FileIdentity; 3],
}

impl ApplicationTarget {
    pub(crate) fn from_candidate(candidate: &Candidate) -> Option<Self> {
        let executable = candidate.executable_path.as_ref()?;
        let fingerprint = Self::fingerprint(&candidate.path, executable)?;
        Some(Self {
            path: candidate.path.clone(),
            bundle_id: candidate.bundle_id.clone(),
            executable: executable.clone(),
            fingerprint,
        })
    }

    fn fingerprint(path: &Path, executable: &Path) -> Option<[FileIdentity; 3]> {
        let plist = path.join("Contents/Info.plist");
        if !executable.starts_with(path)
            || path.canonicalize().ok()? != path
            || executable.canonicalize().ok()? != executable
            || plist.canonicalize().ok()? != plist
            || !path.is_dir()
            || !executable.is_file()
        {
            return None;
        }
        Some([
            FileIdentity::read(path)?,
            FileIdentity::read(&plist)?,
            FileIdentity::read(executable)?,
        ])
    }

    pub(crate) fn retained_path_bytes(&self) -> usize {
        self.path.as_os_str().len()
            + self.executable.as_os_str().len()
            + self.bundle_id.as_ref().map_or(0, String::len)
    }

    pub(crate) fn is_current(&self) -> bool {
        Self::fingerprint(&self.path, &self.executable).as_ref() == Some(&self.fingerprint)
    }

    pub(crate) fn activate(&self) -> Result<Activation, ActivationError> {
        activate_application(&self.path, self.bundle_id.as_deref(), true)
    }
}

#[allow(deprecated, unexpected_cfgs)]
pub(crate) fn activate_application(
    path: &Path,
    bundle_id: Option<&str>,
    require_same_location: bool,
) -> Result<Activation, ActivationError> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::CStr;

    fn string_matches(value: cocoa::base::id, expected: &str) -> bool {
        if value == cocoa::base::nil {
            return false;
        }
        unsafe {
            let bytes: *const std::ffi::c_char = msg_send![value, UTF8String];
            !bytes.is_null() && CStr::from_ptr(bytes).to_bytes() == expected.as_bytes()
        }
    }

    let path_string = path.to_str().ok_or(ActivationError::Open)?;
    unsafe {
        let pool: id = msg_send![class!(NSAutoreleasePool), new];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        if let Some(bundle_id) = bundle_id {
            let applications: id = msg_send![workspace, runningApplications];
            let count: usize = msg_send![applications, count];
            for index in 0..count {
                let application: id = msg_send![applications, objectAtIndex: index];
                let native_bundle_id: id = msg_send![application, bundleIdentifier];
                if !string_matches(native_bundle_id, bundle_id) {
                    continue;
                }
                if require_same_location {
                    let url: id = msg_send![application, bundleURL];
                    let native_path: id = msg_send![url, path];
                    if !string_matches(native_path, path_string) {
                        continue;
                    }
                }
                let activated: bool = msg_send![application, activateWithOptions: 2usize];
                let _: () = msg_send![pool, drain];
                return activated
                    .then_some(Activation::Focused)
                    .ok_or(ActivationError::Focus);
            }
        }
        let native_path = NSString::alloc(nil).init_str(path_string);
        let opened: bool = msg_send![workspace, openFile: native_path];
        let _: () = msg_send![native_path, release];
        let _: () = msg_send![pool, drain];
        opened
            .then_some(Activation::Launched)
            .ok_or(ActivationError::Open)
    }
}

#[cfg(test)]
mod target_tests {
    use super::*;
    use std::fs;

    #[test]
    fn indexed_identity_rejects_replaced_executables_and_linked_bundles() {
        let root = std::env::temp_dir().join(format!("zero-app-target-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let bundle = root.join("Test.app");
        fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
        let executable = bundle.join("Contents/MacOS/Test");
        fs::write(&executable, b"fixture").unwrap();
        fs::write(bundle.join("Contents/Info.plist"), b"fixture").unwrap();
        let candidate = Candidate {
            identity: "test.fixture".into(),
            title: "Fixture".into(),
            path: bundle.clone(),
            icon_source: bundle.clone(),
            bundle_id: Some("test.fixture".into()),
            executable_path: Some(executable.clone()),
            modified_at: None,
        };
        let target = ApplicationTarget::from_candidate(&candidate).unwrap();
        assert!(target.is_current());

        fs::rename(&executable, executable.with_extension("old")).unwrap();
        fs::write(&executable, b"fixture").unwrap();
        assert!(!target.is_current());

        let replaced = ApplicationTarget::from_candidate(&candidate).unwrap();
        let moved = root.join("Moved.app");
        fs::rename(&bundle, &moved).unwrap();
        std::os::unix::fs::symlink(moved, bundle).unwrap();
        assert!(!replaced.is_current());
        fs::remove_dir_all(root).unwrap();
    }
}
