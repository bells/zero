use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path};

pub(crate) enum PathValidationError {
    Invalid,
    Symlink,
}

pub(crate) fn validate_absolute_no_symlinks(path: &Path) -> Result<(), PathValidationError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(PathValidationError::Invalid);
    }

    // Build the chain from complete paths. A Windows volume prefix without its
    // root separator (for example, `\\?\C:`) is not a filesystem path to check.
    let ancestors: Vec<_> = path
        .ancestors()
        .take_while(|ancestor| ancestor.is_absolute())
        .collect();
    for ancestor in ancestors.into_iter().rev() {
        match fs::symlink_metadata(ancestor) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(PathValidationError::Symlink);
            }
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => return Err(PathValidationError::Invalid),
        }
    }
    Ok(())
}
