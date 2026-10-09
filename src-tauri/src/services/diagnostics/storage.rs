use super::contracts::PersistenceStatus;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, AtomicU8, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime},
};
use time::{macros::format_description, OffsetDateTime};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::writer::MakeWriter;

pub const FILE_BYTES: u64 = 4 * 1024 * 1024;
const PREFIX: &str = "zero-diagnostics";
#[derive(Default)]
pub struct WriterHealth {
    pub status: AtomicU8,
    pub dropped: AtomicU32,
}
impl WriterHealth {
    pub fn persistence(&self) -> PersistenceStatus {
        match self.status.load(Ordering::Relaxed) {
            1 => PersistenceStatus::Healthy,
            2 => PersistenceStatus::Degraded,
            _ => PersistenceStatus::MemoryOnly,
        }
    }
    pub fn loss(&self) {
        let _ = self
            .dropped
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                Some(n.saturating_add(1))
            });
    }
}
pub struct Storage {
    pub root: PathBuf,
    _lock: File,
    appender: Option<RollingFileAppender>,
    epoch: Arc<AtomicU32>,
    pub health: Arc<WriterHealth>,
    #[cfg(unix)]
    identity: (u64, u64),
}
pub struct SafeWriter(pub Arc<Mutex<Storage>>);
fn private_file(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}
fn directory(root: &Path) -> io::Result<()> {
    if let Some(parent) = root.parent() {
        if fs::symlink_metadata(parent).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        fs::create_dir_all(parent)?;
    }
    match fs::symlink_metadata(root) {
        Ok(m) if m.file_type().is_symlink() || !m.is_dir() => {
            return Err(io::ErrorKind::PermissionDenied.into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == io::ErrorKind::NotFound => fs::create_dir(root)?,
        Err(e) => return Err(e),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
fn owned(path: &Path) -> bool {
    path.file_name().and_then(|s| s.to_str()).is_some_and(|n| {
        n.strip_prefix("zero-diagnostics.")
            .and_then(|n| n.strip_suffix(".jsonl"))
            .is_some_and(|date| {
                date.len() == 13 && date.bytes().all(|b| b.is_ascii_digit() || b == b'-')
            })
    })
}
impl Storage {
    pub(super) fn validate_root(&self) -> io::Result<()> {
        let meta = fs::symlink_metadata(&self.root)?;
        if !meta.is_dir()
            || meta.file_type().is_symlink()
            || self
                .root
                .parent()
                .is_some_and(|p| fs::symlink_metadata(p).is_ok_and(|m| m.file_type().is_symlink()))
        {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if (meta.dev(), meta.ino()) != self.identity {
                return Err(io::ErrorKind::PermissionDenied.into());
            }
        }
        Ok(())
    }
    pub fn open(
        root: PathBuf,
        epoch: Arc<AtomicU32>,
        health: Arc<WriterHealth>,
    ) -> io::Result<Self> {
        directory(&root)?;
        let lock_path = root.join("writer.lock");
        if fs::symlink_metadata(&lock_path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        let mut options = OpenOptions::new();
        options.create(true).truncate(false).read(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let lock = options.open(&lock_path)?;
        private_file(&lock_path)?;
        lock.try_lock()
            .map_err(|_| io::Error::from(io::ErrorKind::WouldBlock))?;
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            let meta = fs::symlink_metadata(&root)?;
            (meta.dev(), meta.ino())
        };
        let mut value = Self {
            root,
            _lock: lock,
            appender: None,
            epoch,
            health,
            #[cfg(unix)]
            identity,
        };
        value.cleanup(SystemTime::now())?;
        value.appender = Some(value.appender()?);
        value.secure_files()?;
        value.health.status.store(1, Ordering::Relaxed);
        Ok(value)
    }
    fn appender(&self) -> io::Result<RollingFileAppender> {
        RollingFileAppender::builder()
            .rotation(Rotation::HOURLY)
            .filename_prefix(PREFIX)
            .filename_suffix("jsonl")
            .max_log_files(6)
            .build(&self.root)
            .map_err(io::Error::other)
    }
    fn paths(&self) -> io::Result<Vec<PathBuf>> {
        self.validate_root()?;
        let mut paths = Vec::new();
        for (n, entry) in fs::read_dir(&self.root)?.enumerate() {
            if n >= 1000 {
                return Err(io::ErrorKind::InvalidData.into());
            }
            let path = entry?.path();
            if owned(&path) {
                let meta = fs::symlink_metadata(&path)?;
                if meta.file_type().is_symlink() || !meta.is_file() {
                    return Err(io::ErrorKind::PermissionDenied.into());
                }
                paths.push(path);
            }
        }
        paths.sort();
        Ok(paths)
    }
    fn secure_files(&self) -> io::Result<()> {
        for p in self.paths()? {
            private_file(&p)?;
        }
        Ok(())
    }
    pub fn cleanup(&self, now: SystemTime) -> io::Result<()> {
        let paths = self.paths()?;
        let surplus = paths.len().saturating_sub(6);
        for (i, p) in paths.iter().enumerate() {
            let metadata = fs::symlink_metadata(p)?;
            let expired = now.duration_since(metadata.modified()?).unwrap_or_default()
                > Duration::from_secs(7 * 86400);
            if i < surplus || expired || metadata.len() > FILE_BYTES {
                fs::remove_file(p)?;
            }
        }
        Ok(())
    }
    pub fn clear(&mut self) -> io::Result<()> {
        let result = (|| {
            self.validate_root()?;
            self.appender.take();
            for path in self.paths()? {
                fs::remove_file(path)?;
            }
            self.appender = Some(self.appender()?);
            self.secure_files()?;
            Ok(())
        })();
        self.health
            .status
            .store(if result.is_ok() { 1 } else { 2 }, Ordering::Relaxed);
        result
    }
    fn current_path(&self, now: OffsetDateTime) -> io::Result<PathBuf> {
        let period = now
            .format(format_description!("[year]-[month]-[day]-[hour]"))
            .map_err(io::Error::other)?;
        Ok(self.root.join(format!("{PREFIX}.{period}.jsonl")))
    }
    pub fn write_at(&mut self, bytes: &[u8], now: OffsetDateTime) -> io::Result<usize> {
        self.validate_root()?;
        // Clear invalidates records already queued on the appender's worker.
        let event: serde_json::Value = serde_json::from_slice(bytes).map_err(io::Error::other)?;
        if event.get("storageEpoch").and_then(|v| v.as_u64())
            != Some(self.epoch.load(Ordering::Acquire) as u64)
        {
            return Ok(bytes.len());
        }
        if bytes.len() > 4096 {
            self.health.loss();
            return Ok(bytes.len());
        }
        let path = self.current_path(now)?;
        let size = match fs::symlink_metadata(&path) {
            Ok(m) if m.file_type().is_symlink() || !m.is_file() => {
                return Err(io::ErrorKind::PermissionDenied.into())
            }
            Ok(m) => m.len(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => 0,
            Err(e) => return Err(e),
        };
        if size.saturating_add(bytes.len() as u64) > FILE_BYTES {
            self.health.status.store(2, Ordering::Relaxed);
            self.health.loss();
            return Ok(bytes.len());
        }
        // Create the hourly file privately before the library opens it for rotation.
        if size == 0 {
            let mut opts = OpenOptions::new();
            opts.create(true).append(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                opts.mode(0o600).custom_flags(libc::O_NOFOLLOW);
            }
            let _file = opts.open(&path)?;
            private_file(&path)?;
            self.cleanup(SystemTime::now())?;
        }
        let appender = self.appender.as_ref().ok_or(io::ErrorKind::NotConnected)?;
        let mut writer = appender.make_writer();
        // The library pins this file while the writer is held. A rollover during budget
        // admission must be retried next event rather than write against the wrong budget.
        if self.current_path(OffsetDateTime::now_utc())? != path {
            self.health.loss();
            return Ok(bytes.len());
        }
        writer.write_all(bytes)?;
        writer.flush()?;
        self.health.status.store(1, Ordering::Relaxed);
        Ok(bytes.len())
    }
}
impl Write for SafeWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let mut storage = self
            .0
            .lock()
            .map_err(|_| io::Error::from(io::ErrorKind::Other))?;
        let result = storage.write_at(bytes, OffsetDateTime::now_utc());
        Ok(account_write(&storage.health, result, bytes.len()))
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub(super) fn account_write(
    health: &WriterHealth,
    result: io::Result<usize>,
    admitted_bytes: usize,
) -> usize {
    match result {
        Ok(n) => n,
        Err(_) => {
            health.status.store(2, Ordering::Relaxed);
            health.loss();
            admitted_bytes
        }
    }
}
