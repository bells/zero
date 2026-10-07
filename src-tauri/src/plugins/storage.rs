use super::{protocol::PluginError, session::error};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const QUOTA: u64 = 1024 * 1024;
pub struct PreparedStorage {
    destination: PathBuf,
    temporary: Option<PathBuf>,
    value: Value,
}
impl PreparedStorage {
    // The caller holds the session revocation gate only for this final rename.
    pub fn commit(mut self) -> Result<Value, PluginError> {
        if let Some(temporary) = &self.temporary {
            super::registry::atomic_replace_file(temporary, &self.destination)
                .map_err(|_| error("storage.unavailable"))?;
            self.temporary = None;
        }
        Ok(std::mem::take(&mut self.value))
    }
}
impl Drop for PreparedStorage {
    fn drop(&mut self) {
        if let Some(path) = &self.temporary {
            let _ = fs::remove_file(path);
        }
    }
}

// Serialize callers per plugin while preparing a read-modify-write transaction.
pub fn prepare(
    root: &Path,
    key: &str,
    value: Option<Value>,
) -> Result<PreparedStorage, PluginError> {
    if key.is_empty() || key.chars().count() > 128 {
        return Err(error("storage.key"));
    }
    fs::create_dir_all(root).map_err(|_| error("storage.unavailable"))?;
    if fs::symlink_metadata(root)
        .map_err(|_| error("storage.unavailable"))?
        .file_type()
        .is_symlink()
    {
        return Err(error("storage.path"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root, fs::Permissions::from_mode(0o700))
            .map_err(|_| error("storage.unavailable"))?;
    }
    let destination = root.join("storage.json");
    let mut data: serde_json::Map<String, Value> = if destination.exists() {
        if fs::symlink_metadata(&destination)
            .map_err(|_| error("storage.unavailable"))?
            .file_type()
            .is_symlink()
        {
            return Err(error("storage.path"));
        }
        let file = fs::File::open(&destination).map_err(|_| error("storage.unavailable"))?;
        if !file
            .metadata()
            .map_err(|_| error("storage.unavailable"))?
            .is_file()
        {
            return Err(error("storage.path"));
        }
        let mut bytes = Vec::new();
        file.take(QUOTA + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| error("storage.unavailable"))?;
        if bytes.len() as u64 > QUOTA {
            return Err(error("storage.quota"));
        }
        serde_json::from_slice(&bytes).map_err(|_| error("storage.corrupt"))?
    } else {
        serde_json::Map::new()
    };
    let Some(value) = value else {
        return Ok(PreparedStorage {
            destination,
            temporary: None,
            value: data.remove(key).unwrap_or(Value::Null),
        });
    };
    data.insert(key.into(), value);
    let bytes = serde_json::to_vec(&data).map_err(|_| error("storage.invalid"))?;
    if bytes.len() as u64 > QUOTA {
        return Err(error("storage.quota"));
    }
    let mut nonce = [0u8; 16];
    getrandom::fill(&mut nonce).map_err(|_| error("storage.entropy"))?;
    let nonce: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
    let temporary = root.join(format!(".storage-{nonce}.tmp"));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|_| error("storage.unavailable"))?;
    let prepared = PreparedStorage {
        destination,
        temporary: Some(temporary),
        value: Value::Null,
    };
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| error("storage.unavailable"))?;
    Ok(prepared)
}
