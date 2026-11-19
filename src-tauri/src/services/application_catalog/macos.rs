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
