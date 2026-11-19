//! Host-only image cache and ephemeral previews. Admission, live grants and operation
//! serialization belong to the host adapter. Run decode/IO off UI/async threads.
//! Data roots must be dedicated, host-owned, and single-writer. Path checks reject
//! symlinks but do not defeat malicious concurrent ancestor replacement.
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

use image::{DynamicImage, ImageFormat, ImageReader, Limits};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::native_resources::resource_error;
use crate::plugins::contracts::NativeResourceError;
use crate::plugins::registry::atomic_replace_file;
use crate::plugins::session::SessionOwner;

const MAX_ORIGINAL: usize = 25 * 1024 * 1024;
const MAX_PIXELS: u64 = 40_000_000;
const MAX_DECODE_BYTES: u64 = MAX_PIXELS * 4;
const MAX_ASSETS: usize = 10;
const MAX_CACHE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_INDEX: usize = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageAsset {
    pub asset_id: String,
    pub byte_length: u64,
    pub width: u32,
    pub height: u32,
    pub mime_type: String,
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct Owner {
    plugin_id: String,
    version: String,
    digest: String,
    root: PathBuf,
}
impl From<&SessionOwner> for Owner {
    fn from(owner: &SessionOwner) -> Self {
        Self {
            plugin_id: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Index {
    schema: u32,
    plugin_id: String,
    assets: Vec<ImageAsset>,
    #[serde(default)]
    retired: Vec<ImageAsset>,
}

pub struct ImageCache {
    root: PathBuf,
    owner: Owner,
}
impl ImageCache {
    /// The caller supplies the verified installation owner and its dedicated data root.
    /// A newly authorized installation of the same ID may re-admit persistent bytes.
    pub fn open(owner: &SessionOwner, data_root: &Path) -> Result<Self, NativeResourceError> {
        safe_path(data_root)?;
        if !data_root.is_dir() || owner.plugin_id.is_empty() {
            return Err(failure("image.root"));
        }
        let root = data_root.join("image-cache-v1");
        safe_path(&root)?;
        match fs::create_dir(&root) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && root.is_dir() => {}
            Err(_) => return Err(failure("image.root")),
        }
        let cache = Self {
            root,
            owner: owner.into(),
        };
        cache.index()?;
        Ok(cache)
    }

    pub fn store(
        &mut self,
        bytes: &[u8],
        declared_mime: &str,
    ) -> Result<ImageAsset, NativeResourceError> {
        self.store_with(bytes, declared_mime, atomic_replace_file)
    }
    pub(crate) fn store_with(
        &mut self,
        bytes: &[u8],
        mime: &str,
        replace: impl FnMut(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<ImageAsset, NativeResourceError> {
        self.store_with_ops(bytes, mime, replace, |path| fs::remove_file(path))
    }
    fn store_with_ops(
        &mut self,
        bytes: &[u8],
        mime: &str,
        mut replace: impl FnMut(&Path, &Path) -> std::io::Result<()>,
        mut remove: impl FnMut(&Path) -> std::io::Result<()>,
    ) -> Result<ImageAsset, NativeResourceError> {
        let mut index = self.index()?;
        self.known_files_only(&index)?;
        // One retired image is the complete recovery reserve. Never admit another
        // original until deletion and its metadata publication have both completed.
        self.finish_retirement(&mut index, &mut replace, &mut remove)?;
        let (asset, _) = decode(bytes, mime)?;
        if index.assets.iter().any(|entry| entry == &asset) {
            return Ok(asset);
        }
        let path = self.asset_path(&asset.asset_id)?;
        if fs::symlink_metadata(&path).is_ok() {
            return Err(failure("image.recoveryRequired"));
        }
        index.assets.push(asset.clone());
        while index.assets.len() > MAX_ASSETS
            || index
                .assets
                .iter()
                .map(|entry| entry.byte_length)
                .sum::<u64>()
                > MAX_CACHE_BYTES
        {
            index.retired.push(index.assets.remove(0));
        }
        if index.retired.len() > 1 {
            return Err(failure("image.quota"));
        }
        let serialized = serialize_index(&index)?;
        atomic_write(&path, bytes, &mut replace)?;
        if let Err(error) = atomic_write(&self.root.join("index.json"), &serialized, &mut replace) {
            // A failed rollback leaves an unknown orphan. Future writes refuse it;
            // they cannot accumulate another reserve or sweep unknown files.
            let _ = remove(&path);
            return Err(error);
        }
        self.finish_retirement(&mut index, &mut replace, &mut remove)?;
        Ok(asset)
    }
    fn known_files_only(&self, index: &Index) -> Result<(), NativeResourceError> {
        let mut known = HashSet::from(["index.json".to_owned()]);
        for asset in index.assets.iter().chain(&index.retired) {
            known.insert(format!("{}.image", asset.asset_id));
        }
        for entry in fs::read_dir(&self.root).map_err(|_| failure("image.read"))? {
            let entry = entry.map_err(|_| failure("image.read"))?;
            if !entry
                .file_name()
                .to_str()
                .is_some_and(|name| known.contains(name))
            {
                return Err(failure("image.recoveryRequired"));
            }
        }
        Ok(())
    }
    fn finish_retirement(
        &self,
        index: &mut Index,
        replace: &mut impl FnMut(&Path, &Path) -> std::io::Result<()>,
        remove: &mut impl FnMut(&Path) -> std::io::Result<()>,
    ) -> Result<(), NativeResourceError> {
        if index.retired.is_empty() {
            return Ok(());
        }
        for asset in &index.retired {
            let path = self.asset_path(&asset.asset_id)?;
            match fs::symlink_metadata(&path) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
                Err(_) => return Err(failure("image.cleanup")),
                Ok(_) => {
                    self.read_asset(asset)?;
                }
            }
            match remove(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(failure("image.cleanup")),
            }
        }
        index.retired.clear();
        atomic_write(
            &self.root.join("index.json"),
            &serialize_index(index)?,
            replace,
        )
    }

    /// Validated bytes only: a future wallpaper adapter must first copy/pin these
    /// into durable applied slots. Never apply an evictable cache path to the OS.
    pub fn read(&self, asset_id: &str) -> Result<Vec<u8>, NativeResourceError> {
        let index = self.index()?;
        let asset = index
            .assets
            .iter()
            .find(|entry| entry.asset_id == asset_id)
            .ok_or_else(|| failure("image.not_found"))?;
        self.read_asset(asset)
    }
    fn asset_path(&self, id: &str) -> Result<PathBuf, NativeResourceError> {
        if id.len() != 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(failure("image.asset_id"));
        }
        Ok(self.root.join(format!("{id}.image")))
    }
    fn read_asset(&self, asset: &ImageAsset) -> Result<Vec<u8>, NativeResourceError> {
        let path = self.asset_path(&asset.asset_id)?;
        let bytes = read_bounded(&path, MAX_ORIGINAL)?;
        let (actual, _) = decode(&bytes, &asset.mime_type)?;
        if actual != *asset {
            return Err(failure("image.integrity"));
        }
        Ok(bytes)
    }
    fn index(&self) -> Result<Index, NativeResourceError> {
        safe_path(&self.root)?;
        let path = self.root.join("index.json");
        match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Index {
                    schema: 1,
                    plugin_id: self.owner.plugin_id.clone(),
                    assets: vec![],
                    retired: vec![],
                })
            }
            Err(_) => return Err(failure("image.index")),
            Ok(_) => {}
        }
        let bytes = read_bounded(&path, MAX_INDEX)?;
        let index: Index = serde_json::from_slice(&bytes).map_err(|_| failure("image.index"))?;
        if index.schema != 1
            || index.plugin_id != self.owner.plugin_id
            || index.assets.len() > MAX_ASSETS
            || index.retired.len() > 1
        {
            return Err(failure("image.index"));
        }
        let mut seen = HashSet::new();
        let mut total = 0_u64;
        for asset in index.assets.iter().chain(&index.retired) {
            self.asset_path(&asset.asset_id)?;
            if !seen.insert(&asset.asset_id)
                || asset.byte_length == 0
                || asset.byte_length > MAX_ORIGINAL as u64
                || asset.width == 0
                || asset.height == 0
                || u64::from(asset.width) * u64::from(asset.height) > MAX_PIXELS
                || !matches!(asset.mime_type.as_str(), "image/jpeg" | "image/png")
            {
                return Err(failure("image.index"));
            }
        }
        for asset in &index.assets {
            total += asset.byte_length;
            if total > MAX_CACHE_BYTES {
                return Err(failure("image.quota"));
            }
            self.read_asset(asset)?;
        }
        // Missing retired files are a valid crash point after deletion but before
        // the final metadata publication; their descriptor remains recoverable.
        for asset in &index.retired {
            match fs::symlink_metadata(self.asset_path(&asset.asset_id)?) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(failure("image.read")),
                Ok(_) => {
                    self.read_asset(asset)?;
                }
            }
        }
        Ok(index)
    }
}

fn failure(code: &str) -> NativeResourceError {
    resource_error("image.cache", code, code.replace('.', " "), false)
}
fn safe_path(path: &Path) -> Result<(), NativeResourceError> {
    if !path.is_absolute() {
        return Err(failure("image.path"));
    }
    let mut current = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                current.push(component.as_os_str())
            }
            _ => return Err(failure("image.path")),
        }
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(failure("image.symlink")),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(failure("image.path")),
        }
    }
    Ok(())
}
fn read_bounded(path: &Path, max: usize) -> Result<Vec<u8>, NativeResourceError> {
    safe_path(path)?;
    if !fs::symlink_metadata(path)
        .map_err(|_| failure("image.read"))?
        .is_file()
    {
        return Err(failure("image.path"));
    }
    let mut file = File::open(path).map_err(|_| failure("image.read"))?;
    let metadata = file.metadata().map_err(|_| failure("image.read"))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > max as u64 {
        return Err(failure("image.size"));
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| failure("image.read"))?;
    if bytes.len() != metadata.len() as usize || bytes.len() > max {
        return Err(failure("image.size"));
    }
    Ok(bytes)
}
fn atomic_write(
    path: &Path,
    bytes: &[u8],
    replace: &mut impl FnMut(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), NativeResourceError> {
    safe_path(path)?;
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if !metadata.is_file() {
            return Err(failure("image.path"));
        }
    }
    let mut random = [0_u8; 32];
    getrandom::fill(&mut random).map_err(|_| failure("image.entropy"))?;
    let token: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let temporary = path
        .parent()
        .ok_or_else(|| failure("image.path"))?
        .join(format!(".{token}.part"));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| failure("image.write"))?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| failure("image.write"))?;
        replace(&temporary, path).map_err(|_| failure("image.atomic"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn decode(bytes: &[u8], mime: &str) -> Result<(ImageAsset, DynamicImage), NativeResourceError> {
    if bytes.is_empty() || bytes.len() > MAX_ORIGINAL {
        return Err(failure("image.size"));
    }
    let format = match mime {
        "image/png" => ImageFormat::Png,
        "image/jpeg" => ImageFormat::Jpeg,
        _ => return Err(failure("image.mime")),
    };
    if image::guess_format(bytes).map_err(|_| failure("image.format"))? != format {
        return Err(failure("image.mime"));
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_PIXELS as u32);
    limits.max_image_height = Some(MAX_PIXELS as u32);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    let reader = || {
        let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
        reader.limits(limits.clone());
        reader
    };
    let (width, height) = reader()
        .into_dimensions()
        .map_err(|_| failure("image.header"))?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err(failure("image.dimensions"));
    }
    // End markers reject incomplete containers early. JPEG scan completeness still
    // requires strict decoding; image's JPEG wrapper intentionally tolerates errors.
    if (format == ImageFormat::Jpeg && !bytes.ends_with(&[0xff, 0xd9]))
        || (format == ImageFormat::Png
            && !bytes.ends_with(&[0, 0, 0, 0, b'I', b'E', b'N', b'D', 0xae, 0x42, 0x60, 0x82]))
    {
        return Err(failure("image.truncated"));
    }
    let image = if format == ImageFormat::Jpeg {
        decode_strict_jpeg(bytes, width, height)?
    } else {
        reader().decode().map_err(|_| failure("image.decode"))?
    };
    Ok((
        ImageAsset {
            asset_id: format!("{:x}", Sha256::digest(bytes)),
            byte_length: bytes.len() as u64,
            width,
            height,
            mime_type: mime.into(),
        },
        image,
    ))
}

fn decode_strict_jpeg(
    bytes: &[u8],
    width: u32,
    height: u32,
) -> Result<DynamicImage, NativeResourceError> {
    use zune_jpeg::zune_core::{
        bytestream::ZCursor, colorspace::ColorSpace, options::DecoderOptions,
    };

    let options = DecoderOptions::default()
        .set_strict_mode(true)
        .set_max_width(width as usize)
        .set_max_height(height as usize)
        .jpeg_set_out_colorspace(ColorSpace::RGB);
    let mut decoder = zune_jpeg::JpegDecoder::new_with_options(ZCursor::new(bytes), options);
    decoder
        .decode_headers()
        .map_err(|_| failure("image.header"))?;
    if decoder.dimensions() != Some((width as usize, height as usize)) {
        return Err(failure("image.dimensions"));
    }
    let expected = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(3))
        .filter(|bytes| *bytes <= MAX_DECODE_BYTES)
        .ok_or_else(|| failure("image.allocation"))?;
    let required = decoder
        .output_buffer_size()
        .ok_or_else(|| failure("image.allocation"))?;
    if required as u64 != expected {
        return Err(failure("image.allocation"));
    }
    let mut pixels = Vec::new();
    pixels
        .try_reserve_exact(required)
        .map_err(|_| failure("image.allocation"))?;
    pixels.resize(required, 0);
    decoder
        .decode_into(&mut pixels)
        .map_err(|_| failure("image.decode"))?;
    let image =
        image::RgbImage::from_raw(width, height, pixels).ok_or_else(|| failure("image.decode"))?;
    Ok(DynamicImage::ImageRgb8(image))
}

#[cfg(test)]
#[path = "image_cache/tests.rs"]
mod tests;

const MAX_PREVIEW: usize = 2 * 1024 * 1024;
const OWNER_PREVIEW_BYTES: usize = 8 * 1024 * 1024;
const GLOBAL_PREVIEW_BYTES: usize = 32 * 1024 * 1024;
const PREVIEW_TTL_MS: u64 = 5 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewLease {
    pub lease_id: String,
    pub byte_length: u64,
    pub width: u32,
    pub height: u32,
    pub mime_type: String,
}
trait PreviewClock: Send + Sync {
    fn now_ms(&self) -> Result<u64, NativeResourceError>;
}
struct ContinuousPreviewClock;
impl PreviewClock for ContinuousPreviewClock {
    fn now_ms(&self) -> Result<u64, NativeResourceError> {
        super::continuous_clock::now_ms().map_err(|_| failure("image.clock"))
    }
}
pub(crate) struct PreparedPreview(PreviewResource);
struct PreviewResource {
    bytes: Arc<[u8]>,
    width: u32,
    height: u32,
}
struct PreviewEntry {
    owner: Owner,
    session: String,
    generation: u64,
    expires: u64,
    resource: PreviewResource,
}
impl PreviewEntry {
    fn matches(&self, owner: &SessionOwner, session: &str, generation: u64) -> bool {
        self.owner == Owner::from(owner) && self.session == session && self.generation == generation
    }
}

/// One shared host instance enforces global preview quotas. No worker or active
/// resource exists until a lease is issued. Lifecycle adapters must call release
/// on UI close and revoke on disable/update/uninstall, then deny stale admission.
pub struct PreviewLeases {
    entries: Mutex<HashMap<String, PreviewEntry>>,
    clock: Arc<dyn PreviewClock>,
}
impl Default for PreviewLeases {
    fn default() -> Self {
        Self::with_clock(Arc::new(ContinuousPreviewClock))
    }
}
impl PreviewLeases {
    fn with_clock(clock: Arc<dyn PreviewClock>) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            clock,
        }
    }
    pub(crate) fn release_session_id(&self, session: &str) -> Result<(), NativeResourceError> {
        self.entries
            .lock()
            .map_err(|_| failure("image.state"))?
            .retain(|_, e| e.session != session);
        Ok(())
    }
    pub(crate) fn revoke_plugin(&self, plugin: &str) -> Result<(), NativeResourceError> {
        self.entries
            .lock()
            .map_err(|_| failure("image.state"))?
            .retain(|_, e| e.owner.plugin_id != plugin);
        Ok(())
    }
    pub(crate) fn clear(&self) -> Result<(), NativeResourceError> {
        self.entries
            .lock()
            .map_err(|_| failure("image.state"))?
            .clear();
        Ok(())
    }
    pub fn issue(
        &self,
        cache: &ImageCache,
        owner: &SessionOwner,
        session: &str,
        generation: u64,
        asset_id: &str,
    ) -> Result<PreviewLease, NativeResourceError> {
        let prepared = Self::prepare(cache, owner, asset_id)?;
        self.publish(owner, session, generation, prepared)
    }
    pub(crate) fn prepare(
        cache: &ImageCache,
        owner: &SessionOwner,
        asset_id: &str,
    ) -> Result<PreparedPreview, NativeResourceError> {
        if cache.owner != Owner::from(owner) {
            return Err(failure("image.owner"));
        }
        let index = cache.index()?;
        let asset = index
            .assets
            .iter()
            .find(|asset| asset.asset_id == asset_id)
            .ok_or_else(|| failure("image.not_found"))?;
        let bytes = cache.read_asset(asset)?;
        let (_, image) = decode(&bytes, &asset.mime_type)?;
        let preview = image.thumbnail(960, 600).to_rgb8();
        let mut bytes = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 82)
            .encode_image(&preview)
            .map_err(|_| failure("image.preview_encode"))?;
        Ok(PreparedPreview(PreviewResource {
            bytes: bytes.into(),
            width: preview.width(),
            height: preview.height(),
        }))
    }
    pub(crate) fn publish(
        &self,
        owner: &SessionOwner,
        session: &str,
        generation: u64,
        prepared: PreparedPreview,
    ) -> Result<PreviewLease, NativeResourceError> {
        self.admit(owner, session, generation, prepared.0)
    }
    fn admit(
        &self,
        owner: &SessionOwner,
        session: &str,
        generation: u64,
        resource: PreviewResource,
    ) -> Result<PreviewLease, NativeResourceError> {
        if session.is_empty()
            || session.len() > 256
            || generation == 0
            || owner.plugin_id.is_empty()
        {
            return Err(failure("image.session"));
        }
        if resource.bytes.is_empty()
            || resource.bytes.len() > MAX_PREVIEW
            || resource.width == 0
            || resource.height == 0
            || resource.width > 960
            || resource.height > 600
        {
            return Err(failure("image.preview_size"));
        }
        let now = self.clock.now_ms()?;
        let expires = now
            .checked_add(PREVIEW_TTL_MS)
            .ok_or_else(|| failure("image.clock"))?;
        let owner = Owner::from(owner);
        let mut entries = self.entries.lock().map_err(|_| failure("image.state"))?;
        entries.retain(|_, entry| entry.expires > now);
        let owner_entries: Vec<_> = entries
            .values()
            .filter(|entry| entry.owner == owner)
            .collect();
        if entries.len() >= 64
            || owner_entries.len() >= 16
            || entries
                .values()
                .map(|entry| entry.resource.bytes.len())
                .sum::<usize>()
                + resource.bytes.len()
                > GLOBAL_PREVIEW_BYTES
            || owner_entries
                .iter()
                .map(|entry| entry.resource.bytes.len())
                .sum::<usize>()
                + resource.bytes.len()
                > OWNER_PREVIEW_BYTES
        {
            return Err(failure("image.preview_quota"));
        }
        let mut random = [0_u8; 32];
        getrandom::fill(&mut random).map_err(|_| failure("image.entropy"))?;
        let token: String = random.iter().map(|b| format!("{b:02x}")).collect();
        if entries.contains_key(&token) {
            return Err(failure("image.entropy"));
        }
        let info = PreviewLease {
            lease_id: token.clone(),
            byte_length: resource.bytes.len() as u64,
            width: resource.width,
            height: resource.height,
            mime_type: "image/jpeg".into(),
        };
        entries.insert(
            token,
            PreviewEntry {
                owner,
                session: session.into(),
                generation,
                expires,
                resource,
            },
        );
        Ok(info)
    }
    pub fn read(
        &self,
        owner: &SessionOwner,
        session: &str,
        generation: u64,
        token: &str,
    ) -> Result<Arc<[u8]>, NativeResourceError> {
        let now = self.clock.now_ms()?;
        let mut entries = self.entries.lock().map_err(|_| failure("image.state"))?;
        entries.retain(|_, entry| entry.expires > now);
        let entry = entries
            .get(token)
            .filter(|entry| entry.matches(owner, session, generation))
            .ok_or_else(|| failure("image.preview_denied"))?;
        Ok(entry.resource.bytes.clone())
    }
    /// Releasing a missing/already released token is idempotent. A live token
    /// belonging to another installation or session is always denied.
    pub fn release(
        &self,
        owner: &SessionOwner,
        session: &str,
        generation: u64,
        token: &str,
    ) -> Result<(), NativeResourceError> {
        let mut entries = self.entries.lock().map_err(|_| failure("image.state"))?;
        if entries
            .get(token)
            .is_some_and(|entry| !entry.matches(owner, session, generation))
        {
            return Err(failure("image.preview_denied"));
        }
        entries.remove(token);
        Ok(())
    }
    pub fn release_session(
        &self,
        owner: &SessionOwner,
        session: &str,
        generation: u64,
    ) -> Result<(), NativeResourceError> {
        self.entries
            .lock()
            .map_err(|_| failure("image.state"))?
            .retain(|_, entry| !entry.matches(owner, session, generation));
        Ok(())
    }
    pub fn revoke_owner(&self, owner: &SessionOwner) -> Result<(), NativeResourceError> {
        let owner = Owner::from(owner);
        self.entries
            .lock()
            .map_err(|_| failure("image.state"))?
            .retain(|_, entry| entry.owner != owner);
        Ok(())
    }
}
impl ImageCache {
    /// Host-only consumption with a full installed-owner binding. Live registry/grant
    /// authorization must still be checked by the side-effect adapter at commit time.
    pub fn read_for_owner(
        &self,
        owner: &SessionOwner,
        asset_id: &str,
    ) -> Result<Vec<u8>, NativeResourceError> {
        if self.owner != Owner::from(owner) {
            return Err(failure("image.owner"));
        }
        self.read(asset_id)
    }
}
pub(crate) fn validate_image(bytes: &[u8], mime: &str) -> Result<ImageAsset, NativeResourceError> {
    decode(bytes, mime).map(|(asset, _)| asset)
}
fn serialize_index(index: &Index) -> Result<Vec<u8>, NativeResourceError> {
    let bytes = serde_json::to_vec(index).map_err(|_| failure("image.index"))?;
    if bytes.len() > MAX_INDEX {
        return Err(failure("image.index"));
    }
    Ok(bytes)
}
