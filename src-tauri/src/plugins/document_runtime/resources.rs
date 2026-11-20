use std::collections::HashSet;
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::Write;
use std::os::unix::fs::{FileExt, MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::plugins::protocol::PluginError;
use crate::plugins::session::error;
use crate::services::file::artifacts::{create_job_temp_directory, remove_job_temp_directory};
use crate::services::file::contracts::{
    FileConversionCandidateValidation, FileConversionDirection, FileConversionError,
};
use crate::services::file::engine_bridge::MAX_INPUT_BYTES;
use crate::services::file::output::target_extension;
use crate::services::file::provider::FileConversionCancellationToken;
use crate::services::file::validation::{detect_direction, inspect_source};

use super::{file_error, nonce};

const MAX_NAME_BYTES: usize = 160;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DocumentInput {
    pub id: String,
    pub file_name: String,
    pub direction: FileConversionDirection,
    pub size_bytes: u64,
}

#[derive(PartialEq, Eq)]
struct FileStamp {
    inode: (u64, u64),
    length: u64,
    modified: (i64, i64),
}

impl FileStamp {
    fn of(metadata: &Metadata) -> Self {
        Self {
            inode: inode(metadata),
            length: metadata.len(),
            modified: (metadata.mtime(), metadata.mtime_nsec()),
        }
    }
}

fn inode(metadata: &Metadata) -> (u64, u64) {
    (metadata.dev(), metadata.ino())
}

pub(super) struct SelectedInput {
    pub info: DocumentInput,
    pub parent: PathBuf,
    handle: File,
    stamp: FileStamp,
}

impl SelectedInput {
    pub(super) fn open(path: &Path) -> Result<Self, PluginError> {
        let direction = detect_direction(path).map_err(file_error)?;
        if direction == FileConversionDirection::DocxToPdf
            && !crate::services::file::native_print::native_pdf_export_available()
        {
            return Err(error("documents.unsupportedDirection"));
        }
        let file_name = file_name(path)?;
        let handle = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
            .map_err(|_| error("documents.inputUnavailable"))?;
        let metadata = handle
            .metadata()
            .map_err(|_| error("documents.inputUnavailable"))?;
        if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_INPUT_BYTES {
            return Err(error("documents.inputSize"));
        }
        let parent = path
            .parent()
            .ok_or_else(|| error("documents.inputUnavailable"))?
            .to_path_buf();
        Ok(Self {
            info: DocumentInput {
                id: nonce()?,
                file_name,
                direction,
                size_bytes: metadata.len(),
            },
            handle,
            stamp: FileStamp::of(&metadata),
            parent,
        })
    }

    pub(super) fn suggested_name(&self) -> String {
        let stem = self
            .info
            .file_name
            .rsplit_once('.')
            .map_or("document", |(stem, _)| stem);
        let mut end = stem.len().min(128);
        while !stem.is_char_boundary(end) {
            end -= 1;
        }
        format!(
            "{}-converted.{}",
            &stem[..end],
            target_extension(self.info.direction)
        )
    }

    pub(super) fn stage(
        &self,
        directory: &Path,
        cancellation: &FileConversionCancellationToken,
    ) -> Result<PathBuf, PluginError> {
        let extension = match self.info.direction {
            FileConversionDirection::PdfToDocx => "pdf",
            FileConversionDirection::DocxToPdf => "docx",
        };
        let path = directory.join(format!("selected-source.{extension}"));
        self.verify_snapshot()?;
        let mut target = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path)
            .map_err(|_| error("documents.workspaceUnavailable"))?;
        let mut buffer = [0u8; 64 * 1024];
        let mut offset = 0;
        while offset < self.info.size_bytes {
            cancellation.check().map_err(file_error)?;
            let length = buffer.len().min((self.info.size_bytes - offset) as usize);
            let count = self
                .handle
                .read_at(&mut buffer[..length], offset)
                .map_err(|_| error("documents.inputUnavailable"))?;
            if count == 0 {
                return Err(error("documents.inputChanged"));
            }
            target
                .write_all(&buffer[..count])
                .map_err(|_| error("documents.workspaceUnavailable"))?;
            offset += count as u64;
        }
        self.verify_snapshot()?;
        let candidate = inspect_source(&path, &HashSet::new());
        match candidate.validation {
            FileConversionCandidateValidation::Valid { .. } => Ok(path),
            FileConversionCandidateValidation::Rejected { error } => Err(file_error(error)),
        }
    }

    fn verify_snapshot(&self) -> Result<(), PluginError> {
        let current = self
            .handle
            .metadata()
            .map_err(|_| error("documents.inputUnavailable"))?;
        if FileStamp::of(&current) != self.stamp {
            return Err(error("documents.inputChanged"));
        }
        Ok(())
    }
}

fn file_name(path: &Path) -> Result<String, PluginError> {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| {
            !name.is_empty()
                && name.len() <= MAX_NAME_BYTES
                && !name
                    .chars()
                    .any(|character| character.is_control() || character == '\\')
        })
        .map(str::to_owned)
        .ok_or_else(|| error("documents.fileName"))
}

pub(super) struct Destination {
    pub path: PathBuf,
    pub file_name: String,
    parent: (u64, u64),
}

impl Destination {
    pub(super) fn approve(
        path: &Path,
        direction: FileConversionDirection,
    ) -> Result<Self, PluginError> {
        let file_name = file_name(path)?;
        let correct_extension = path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case(target_extension(direction)));
        if !correct_extension {
            return Err(error("documents.outputFormat"));
        }
        let directory = path
            .parent()
            .and_then(|path| fs::canonicalize(path).ok())
            .ok_or_else(|| error("documents.outputNotWritable"))?;
        let parent = directory_identity(&directory)?;
        let path = directory.join(&file_name);
        match fs::symlink_metadata(&path) {
            Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => (),
            Ok(_) => return Err(error("documents.outputConflict")),
            _ => return Err(error("documents.outputNotWritable")),
        }
        Ok(Self {
            path,
            file_name,
            parent,
        })
    }

    pub(super) fn verify_directory(&self) -> Result<(), PluginError> {
        let directory = self
            .path
            .parent()
            .ok_or_else(|| error("documents.outputNotWritable"))?;
        if directory_identity(directory)? != self.parent {
            return Err(error("documents.outputChanged"));
        }
        Ok(())
    }

    pub(super) fn output_identity(&self) -> Result<(u64, u64), PluginError> {
        self.verify_directory()?;
        fs::symlink_metadata(&self.path)
            .ok()
            .filter(Metadata::is_file)
            .map(|metadata| inode(&metadata))
            .ok_or_else(|| error("documents.outputMissing"))
    }
}

fn directory_identity(path: &Path) -> Result<(u64, u64), PluginError> {
    fs::symlink_metadata(path)
        .ok()
        .filter(Metadata::is_dir)
        .map(|metadata| inode(&metadata))
        .ok_or_else(|| error("documents.outputNotWritable"))
}

pub(super) struct Workspace {
    pub path: PathBuf,
    root: PathBuf,
}

impl Workspace {
    pub(super) fn create(id: &str) -> Result<Self, FileConversionError> {
        let root = crate::brand::canonical_data_root(&crate::brand::default_home())
            .join("cache/document-jobs");
        let path = create_job_temp_directory(&root, id)?;
        Ok(Self { root, path })
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = remove_job_temp_directory(&self.root, &self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_reads_only_its_original_inode_and_refuses_modified_content() {
        let root = std::env::temp_dir().join(nonce().unwrap());
        fs::create_dir(&root).unwrap();
        let source = root.join("original.pdf");
        let renamed = root.join("renamed.pdf");
        fs::write(&source, b"%PDF-1.7\nfixture").unwrap();
        let selected = SelectedInput::open(&source).unwrap();
        fs::rename(&source, &renamed).unwrap();
        fs::write(&source, b"%PDF-1.7\nreplaced").unwrap();
        let path = selected.stage(&root, &Default::default()).unwrap();
        assert_eq!(fs::read(path).unwrap(), b"%PDF-1.7\nfixture");
        fs::write(renamed, b"%PDF-1.7\nmodified and resized").unwrap();
        assert_eq!(
            selected.verify_snapshot().unwrap_err().code,
            "documents.inputChanged"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn destination_rejects_overwrite_and_detects_directory_replacement() {
        let root = std::env::temp_dir().join(nonce().unwrap());
        let original = root.join("selected");
        fs::create_dir_all(&original).unwrap();
        let output = original.join("edited.docx");
        let destination =
            Destination::approve(&output, FileConversionDirection::PdfToDocx).unwrap();
        fs::write(&output, b"existing").unwrap();
        assert!(matches!(
            Destination::approve(&output, FileConversionDirection::PdfToDocx),
            Err(error) if error.code == "documents.outputConflict",
        ));
        fs::rename(&original, root.join("moved")).unwrap();
        fs::create_dir(&original).unwrap();
        assert_eq!(
            destination.verify_directory().unwrap_err().code,
            "documents.outputChanged"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
