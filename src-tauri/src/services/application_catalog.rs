use std::collections::HashMap;
use std::fmt;
use std::fs::{self, Metadata};
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(target_os = "windows")]
use windows as platform;

pub use platform::application_roots;

#[derive(Debug, PartialEq, Eq)]
pub enum DiscoveryError {
    Cancelled,
    EntryLimit,
    DepthLimit,
    InputLimit,
    PayloadLimit,
}

impl fmt::Display for DiscoveryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Cancelled => "Application discovery was cancelled.",
            Self::EntryLimit => "Application discovery exceeded its directory entry limit.",
            Self::DepthLimit => "Application discovery exceeded its directory depth limit.",
            Self::PayloadLimit => "Application discovery exceeded its metadata payload limit.",
            Self::InputLimit => {
                "An application manifest or shortcut exceeded the input size limit."
            }
        })
    }
}

impl std::error::Error for DiscoveryError {}

#[derive(Clone, Copy)]
struct Limits {
    entries: usize,
    depth: usize,
    input_bytes: usize,
    payload_bytes: usize,
}

impl Limits {
    const DEFAULT: Self = Self {
        entries: 65_536,
        depth: 32,
        input_bytes: 1024 * 1024,
        payload_bytes: 64 * 1024 * 1024,
    };
}

#[derive(Debug)]
pub struct Candidate {
    pub identity: String,
    pub title: String,
    pub path: PathBuf,
    pub bundle_id: Option<String>,
    pub executable_path: Option<PathBuf>,
    pub icon_source: PathBuf,
    pub modified_at: Option<u64>,
}

#[derive(Debug)]
pub struct Catalog {
    pub candidates: Vec<Candidate>,
    pub skipped: Vec<String>,
}

enum ParseError {
    Skipped(String),
    InputLimit,
}

fn skip(path: &Path, reason: impl fmt::Display) -> ParseError {
    ParseError::Skipped(format!("{}: {reason}", path.display()))
}

fn metadata_without_links(path: &Path) -> io::Result<Metadata> {
    let metadata = fs::symlink_metadata(path)?;
    #[cfg(target_os = "windows")]
    let reparse_point = {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    };
    #[cfg(not(target_os = "windows"))]
    let reparse_point = false;

    if metadata.is_symlink() || reparse_point {
        return Err(io::Error::other("symbolic link or reparse point skipped"));
    }
    Ok(metadata)
}

fn check_input(metadata: &Metadata, path: &Path, limit: usize) -> Result<(), ParseError> {
    if !metadata.is_file() {
        return Err(skip(path, "expected a regular file"));
    }
    if metadata.len() > limit as u64 {
        return Err(ParseError::InputLimit);
    }
    Ok(())
}

fn modified_at(metadata: &Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
}

fn check_cancelled(is_cancelled: &impl Fn() -> bool) -> Result<(), DiscoveryError> {
    if is_cancelled() {
        return Err(DiscoveryError::Cancelled);
    }
    Ok(())
}

pub fn discover_applications(is_cancelled: &impl Fn() -> bool) -> Result<Catalog, DiscoveryError> {
    scan_roots(&application_roots(), Limits::DEFAULT, is_cancelled)
}

fn scan_roots(
    roots: &[PathBuf],
    limits: Limits,
    is_cancelled: &impl Fn() -> bool,
) -> Result<Catalog, DiscoveryError> {
    let mut by_identity = HashMap::<String, Candidate>::new();
    let mut skipped = Vec::new();
    let mut entries_seen = 0;
    let mut remaining_payload = limits.payload_bytes;

    // Reverse roots and LIFO directory entries preserve the legacy duplicate precedence.
    for root in roots.iter().rev() {
        check_cancelled(is_cancelled)?;
        count_entry(&mut entries_seen, limits.entries)?;
        if metadata_without_links(root).is_err() {
            continue;
        }
        let Ok(root) = root.canonicalize() else {
            continue;
        };
        let mut stack = vec![(root.clone(), 0)];
        while let Some((path, depth)) = stack.pop() {
            check_cancelled(is_cancelled)?;
            if depth > limits.depth {
                return Err(DiscoveryError::DepthLimit);
            }
            let Ok(metadata) = metadata_without_links(&path) else {
                continue;
            };
            let Ok(canonical) = path.canonicalize() else {
                continue;
            };
            if !canonical.starts_with(&root) {
                continue;
            }
            if platform::is_candidate(&path, &metadata) {
                check_cancelled(is_cancelled)?;
                match platform::parse_candidate(canonical, &metadata, limits.input_bytes) {
                    Ok(candidate) => {
                        // Charge each parsed candidate, even if a duplicate is discarded or replaced.
                        charge_payload(
                            &mut remaining_payload,
                            [
                                candidate.identity.len(),
                                candidate.identity.len(), // map key
                                candidate.title.len(),
                                candidate.path.as_os_str().len(),
                                candidate.bundle_id.as_ref().map_or(0, String::len),
                                candidate
                                    .executable_path
                                    .as_ref()
                                    .map_or(0, |path| path.as_os_str().len()),
                                candidate.icon_source.as_os_str().len(),
                            ],
                        )?;
                        platform::insert(&mut by_identity, candidate);
                    }
                    Err(ParseError::Skipped(message)) => {
                        charge_payload(&mut remaining_payload, [message.len()])?;
                        skipped.push(message);
                    }
                    Err(ParseError::InputLimit) => return Err(DiscoveryError::InputLimit),
                }
                continue;
            }
            if metadata.is_dir() {
                let Ok(entries) = fs::read_dir(canonical) else {
                    continue;
                };
                for entry in entries {
                    check_cancelled(is_cancelled)?;
                    count_entry(&mut entries_seen, limits.entries)?;
                    if let Ok(entry) = entry {
                        stack.push((entry.path(), depth + 1));
                    }
                }
            }
        }
    }

    check_cancelled(is_cancelled)?;
    let mut candidates: Vec<_> = by_identity.into_values().collect();
    candidates.sort_by_key(|item| item.title.to_lowercase());
    check_cancelled(is_cancelled)?;
    Ok(Catalog {
        candidates,
        skipped,
    })
}

fn charge_payload(
    remaining: &mut usize,
    lengths: impl IntoIterator<Item = usize>,
) -> Result<(), DiscoveryError> {
    for length in lengths {
        *remaining = remaining
            .checked_sub(length)
            .ok_or(DiscoveryError::PayloadLimit)?;
    }
    Ok(())
}

fn count_entry(seen: &mut usize, limit: usize) -> Result<(), DiscoveryError> {
    if *seen >= limit {
        return Err(DiscoveryError::EntryLimit);
    }
    *seen += 1;
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests;
