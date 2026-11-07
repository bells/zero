use super::{
    contracts::{
        FileConversionDirection as Direction, FileConversionError, FileConversionErrorCode,
        FileConversionProviderId as Id,
    },
    provider::{provider_error, ProviderPlatform},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileProviderPreferences {
    pub schema_version: u16,
    pub revision: u64,
    pub pdf_to_docx: Option<Id>,
    pub docx_to_pdf: Option<Id>,
    #[serde(skip)]
    pub invalid_directions: Vec<Direction>,
}

impl FileProviderPreferences {
    pub fn defaults(platform: ProviderPlatform) -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            pdf_to_docx: default_provider(Direction::PdfToDocx, platform),
            docx_to_pdf: default_provider(Direction::DocxToPdf, platform),
            invalid_directions: Vec::new(),
        }
    }
    pub fn selected(&self, direction: Direction) -> Option<Id> {
        match direction {
            Direction::PdfToDocx => self.pdf_to_docx,
            Direction::DocxToPdf => self.docx_to_pdf,
        }
    }
    pub fn replace(
        &self,
        direction: Direction,
        provider: Id,
        expected_revision: u64,
        platform: ProviderPlatform,
    ) -> Result<Self, FileConversionError> {
        if self.revision != expected_revision {
            return Err(provider_error(
                FileConversionErrorCode::InvalidJobState,
                "Provider preferences changed in another window. Refresh and choose again.",
                true,
                None,
            ));
        }
        if !supported_providers(direction, platform).contains(&provider) {
            return Err(provider_error(
                FileConversionErrorCode::InvalidInput,
                "This provider does not support the selected direction and platform.",
                false,
                Some(provider),
            ));
        }
        let mut next = self.clone();
        next.revision = self.revision.checked_add(1).ok_or_else(storage_error)?;
        match direction {
            Direction::PdfToDocx => next.pdf_to_docx = Some(provider),
            Direction::DocxToPdf => next.docx_to_pdf = Some(provider),
        }
        next.invalid_directions.retain(|value| *value != direction);
        Ok(next)
    }
}

pub fn default_provider(direction: Direction, platform: ProviderPlatform) -> Option<Id> {
    supported_providers(direction, platform).first().copied()
}

pub fn supported_providers(direction: Direction, platform: ProviderPlatform) -> Vec<Id> {
    match (direction, platform) {
        (Direction::PdfToDocx, ProviderPlatform::Macos | ProviderPlatform::Windows) => {
            vec![Id::ZeroFilePdfToDocx]
        }
        (Direction::DocxToPdf, ProviderPlatform::Macos) => vec![
            Id::ZeroFileDocxToPdfMacos,
            Id::LibreOffice,
            Id::MicrosoftWordMacos,
        ],
        (Direction::DocxToPdf, ProviderPlatform::Windows) => vec![
            Id::ZeroFileDocxToPdfWindows,
            Id::LibreOffice,
            Id::MicrosoftWordWindows,
        ],
        _ => Vec::new(),
    }
}

pub fn load(
    path: &Path,
    platform: ProviderPlatform,
) -> Result<FileProviderPreferences, FileConversionError> {
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(FileProviderPreferences::defaults(platform))
        }
        Err(_) => return Err(storage_error()),
    };
    let mut bytes = Vec::new();
    std::io::Read::by_ref(&mut file)
        .take(4097)
        .read_to_end(&mut bytes)
        .map_err(|_| storage_error())?;
    let mut prefs = FileProviderPreferences::defaults(platform);
    let value = (bytes.len() <= 4096)
        .then(|| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .flatten();
    if let Some(value) = value.filter(|value| {
        value.is_object() && value.get("schemaVersion").and_then(|value| value.as_u64()) == Some(1)
    }) {
        prefs.revision = value
            .get("revision")
            .and_then(|value| value.as_u64())
            .unwrap_or_default();
        for (direction, key) in [
            (Direction::PdfToDocx, "pdfToDocx"),
            (Direction::DocxToPdf, "docxToPdf"),
        ] {
            let Some(raw) = value.get(key) else { continue };
            let valid = serde_json::from_value::<Id>(raw.clone())
                .ok()
                .filter(|id| supported_providers(direction, platform).contains(id));
            if let Some(id) = valid {
                match direction {
                    Direction::PdfToDocx => prefs.pdf_to_docx = Some(id),
                    Direction::DocxToPdf => prefs.docx_to_pdf = Some(id),
                }
            } else {
                prefs.invalid_directions.push(direction);
            }
        }
    } else {
        prefs.invalid_directions = vec![Direction::PdfToDocx, Direction::DocxToPdf];
    }
    Ok(prefs)
}

pub fn save(path: &Path, prefs: &FileProviderPreferences) -> Result<(), FileConversionError> {
    let parent = path.parent().ok_or_else(storage_error)?;
    fs::create_dir_all(parent).map_err(|_| storage_error())?;
    let temporary: PathBuf = path.with_extension(format!("{}.part", std::process::id()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| storage_error())?;
        file.write_all(&serde_json::to_vec(prefs).map_err(|_| storage_error())?)
            .map_err(|_| storage_error())?;
        file.sync_all().map_err(|_| storage_error())?;
        replace_file(&temporary, path).map_err(|_| storage_error())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &Path, target: &Path) -> Result<(), ()> {
    fs::rename(source, target).map_err(|_| ())
}
#[cfg(target_os = "windows")]
fn replace_file(source: &Path, target: &Path) -> Result<(), ()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source: Vec<_> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<_> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(())
    } else {
        Ok(())
    }
}
fn storage_error() -> FileConversionError {
    provider_error(
        FileConversionErrorCode::PermissionDenied,
        "Provider preferences could not be read or saved. The previous selection is unchanged.",
        true,
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn choices_validate_direction_platform_and_revision_without_testing_availability() {
        let prefs = FileProviderPreferences::defaults(ProviderPlatform::Macos);
        assert_eq!(prefs.docx_to_pdf, Some(Id::ZeroFileDocxToPdfMacos));
        assert!(prefs
            .replace(
                Direction::PdfToDocx,
                Id::LibreOffice,
                0,
                ProviderPlatform::Macos
            )
            .is_err());
        assert!(prefs
            .replace(
                Direction::DocxToPdf,
                Id::MicrosoftWordWindows,
                0,
                ProviderPlatform::Macos
            )
            .is_err());
        let next = prefs
            .replace(
                Direction::DocxToPdf,
                Id::MicrosoftWordMacos,
                0,
                ProviderPlatform::Macos,
            )
            .unwrap();
        assert_eq!(next.revision, 1);
        assert!(next
            .replace(
                Direction::DocxToPdf,
                Id::LibreOffice,
                0,
                ProviderPlatform::Macos
            )
            .is_err());
    }
    #[test]
    fn persistence_restarts_without_document_data_and_discloses_invalid_saved_choices() {
        let root = std::env::temp_dir().join(format!(
            "zero-provider-prefs-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = root.join("providers.json");
        let prefs = FileProviderPreferences::defaults(ProviderPlatform::Macos)
            .replace(
                Direction::DocxToPdf,
                Id::MicrosoftWordMacos,
                0,
                ProviderPlatform::Macos,
            )
            .unwrap();
        save(&path, &prefs).unwrap();
        assert_eq!(load(&path, ProviderPlatform::Macos).unwrap(), prefs);
        let json: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(json.as_object().unwrap().len(), 4);
        fs::write(&path, br#"{"schemaVersion":1,"revision":4,"pdfToDocx":"arbitrary.exe","docxToPdf":"microsoftWordWindows"}"#).unwrap();
        let recovered = load(&path, ProviderPlatform::Macos).unwrap();
        assert_eq!(recovered.invalid_directions.len(), 2);
        assert_eq!(recovered.docx_to_pdf, Some(Id::ZeroFileDocxToPdfMacos));
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(save(&path, &prefs).is_err());
        assert!(path.is_dir());
        fs::remove_dir_all(root).unwrap();
    }
}
