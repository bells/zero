//! Host-only durable wallpaper transactions. Run on a blocking worker after final
//! registry→session authorization; this module never acquires either host lock.
//!
//! The host supplies a dedicated private directory, never a package path. A
//! lifetime OS lock and in-process mutex serialize effects. Ancestor checks do not
//! defeat malicious concurrent replacement by another process with user access.
//! Immutable slot files are published before the state referencing them. Unknown
//! files (including crash orphans) block new writes and are preserved, not swept.
//! File data is fsynced before atomic replacement. Rename is publication; Unix
//! directory fsync is best effort, not proof of power-loss durability.
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use super::{
    image_cache::{validate_image, ImageAsset, ImageCache},
    native_resources::resource_error,
    wallpaper::WallpaperSetter,
};
use crate::plugins::{
    contracts::NativeResourceError, registry::atomic_replace_file, session::SessionOwner,
};

const MAX_STATE: usize = 32 * 1024;
const MAX_IMAGE: usize = 25 * 1024 * 1024;
const MAX_GENERATION: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WallpaperIntent {
    pub intent_id: String,
    pub generation: u64,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyOutcome {
    Applied,
    AlreadyApplied,
}
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Phase {
    Prepared,
    Applying,
    Uncertain,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Intent {
    intent_id: String,
    generation: u64,
    owner: Owner,
    slot: u8,
    phase: Phase,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    claim_id: Option<String>,
}
impl Intent {
    fn descriptor(&self) -> WallpaperIntent {
        WallpaperIntent {
            intent_id: self.intent_id.clone(),
            generation: self.generation,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    intent_id: String,
    generation: u64,
    owner: Owner,
    slot: u8,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct State {
    schema: u8,
    plugin_id: String,
    generation: u64,
    slots: [Option<ImageAsset>; 3],
    active: Option<Intent>,
    latest: Option<Receipt>,
    recovery: Vec<u8>,
}
impl State {
    fn empty(id: &str) -> Self {
        Self {
            schema: 1,
            plugin_id: id.into(),
            generation: 0,
            slots: [None, None, None],
            active: None,
            latest: None,
            recovery: vec![],
        }
    }
    fn pinned(&self, slot: usize) -> bool {
        self.active
            .as_ref()
            .is_some_and(|i| usize::from(i.slot) == slot)
            || self
                .latest
                .as_ref()
                .is_some_and(|i| usize::from(i.slot) == slot)
            || self.recovery.iter().any(|s| usize::from(*s) == slot)
    }
}

// A replacement error must leave the target unchanged. Rename success is the
// linearization point, so later best-effort directory sync cannot undo success.
trait StatePublication: Send + Sync {
    fn replace(&self, source: &Path, target: &Path) -> std::io::Result<()>;
}
struct AtomicPublication;
impl StatePublication for AtomicPublication {
    fn replace(&self, source: &Path, target: &Path) -> std::io::Result<()> {
        atomic_replace_file(source, target)
    }
}

pub struct WallpaperEffects {
    root: PathBuf,
    owner: Owner,
    _lock: File,
    publication: Arc<dyn StatePublication>,
    state: Mutex<State>,
}
impl WallpaperEffects {
    /// Reopening the same plugin ID preserves all old-version safety records.
    /// The adapter must cache one instance; a second instance/process is rejected.
    pub fn open(owner: &SessionOwner, data_root: &Path) -> Result<Self, NativeResourceError> {
        let owner = Owner::from(owner);
        validate_owner(&owner)?;
        safe_path(data_root)?;
        if !data_root.is_dir() {
            return Err(failure("wallpaper.root"));
        }
        let root = data_root.join("wallpaper-effects-v1");
        safe_path(&root)?;
        match fs::create_dir(&root) {
            Ok(()) => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
                        .map_err(|_| failure("wallpaper.root"))?;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && root.is_dir() => {}
            Err(_) => return Err(failure("wallpaper.root")),
        }
        let lock_path = root.join(".lock");
        regular_or_missing(&lock_path)?;
        if fs::symlink_metadata(&lock_path).is_ok_and(|meta| meta.len() != 0) {
            return Err(failure("wallpaper.foreign_file"));
        }
        let lock = private_options()
            .read(true)
            .write(true)
            .create(true)
            .open(&lock_path)
            .map_err(|_| failure("wallpaper.lock"))?;
        lock.try_lock().map_err(|_| failure("wallpaper.busy"))?;
        let state_path = root.join("state.json");
        regular_or_missing(&state_path)?;
        let missing = !state_path.exists();
        let state = if missing {
            State::empty(&owner.plugin_id)
        } else {
            serde_json::from_slice(&read_bounded(&state_path, MAX_STATE)?)
                .map_err(|_| failure("wallpaper.state"))?
        };
        let store = Self {
            root,
            owner,
            _lock: lock,
            publication: Arc::new(AtomicPublication),
            state: Mutex::new(state),
        };
        let mut guard = store.state.lock().map_err(|_| failure("wallpaper.state"))?;
        store.validate_store(&guard)?;
        if missing {
            store.persist(&guard)?;
        }
        if guard
            .active
            .as_ref()
            .is_some_and(|i| i.phase == Phase::Applying)
        {
            let mut next = guard.clone();
            next.active.as_mut().expect("checked active").phase = Phase::Uncertain;
            store.persist(&next)?;
            *guard = next;
        }
        drop(guard);
        Ok(store)
    }

    /// Only cache bytes admitted for this exact installed owner can be prepared.
    /// This performs no OS call. The returned native token must be persisted by
    /// the package as its domain operation ID before a later apply request.
    pub fn prepare(
        &self,
        owner: &SessionOwner,
        cache: &ImageCache,
        asset_id: &str,
    ) -> Result<WallpaperIntent, NativeResourceError> {
        self.prepare_inner(owner, cache, asset_id, None, &|source, target| {
            self.publication.replace(source, target)
        })
    }
    pub(crate) fn prepare_claimed(
        &self,
        owner: &SessionOwner,
        cache: &ImageCache,
        asset_id: &str,
        claim_id: &str,
        publish: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<WallpaperIntent, NativeResourceError> {
        if !valid_claim(claim_id) {
            return Err(failure("wallpaper.claim"));
        }
        self.prepare_inner(owner, cache, asset_id, Some(claim_id), publish)
    }
    fn prepare_inner(
        &self,
        owner: &SessionOwner,
        cache: &ImageCache,
        asset_id: &str,
        claim_id: Option<&str>,
        publish: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<WallpaperIntent, NativeResourceError> {
        self.authorize(owner)?;
        let mut guard = self.state.lock().map_err(|_| failure("wallpaper.state"))?;
        if let Some(active) = &guard.active {
            if active.claim_id.as_deref() != claim_id {
                return Err(failure("wallpaper.busy"));
            }
            if active.owner != self.owner {
                return Err(failure("wallpaper.owner_pending"));
            }
            if active.phase != Phase::Prepared {
                return Err(uncertain());
            }
        }
        let bytes = cache.read_for_owner(owner, asset_id)?;
        let mime = match image::guess_format(&bytes).map_err(|_| failure("wallpaper.image"))? {
            image::ImageFormat::Jpeg => "image/jpeg",
            image::ImageFormat::Png => "image/png",
            _ => return Err(failure("wallpaper.image")),
        };
        let asset = validate_image(&bytes, mime)?;
        if asset.asset_id != asset_id {
            return Err(failure("wallpaper.image"));
        }
        self.validate_store(&guard)?;
        if let Some(active) = &guard.active {
            if guard.slots[usize::from(active.slot)].as_ref() == Some(&asset) {
                return Ok(active.descriptor());
            }
            return Err(failure("wallpaper.prepared_conflict"));
        }
        let generation = guard
            .generation
            .checked_add(1)
            .filter(|g| *g <= MAX_GENERATION)
            .ok_or_else(|| failure("wallpaper.generation"))?;
        let slot = (0..3)
            .find(|slot| !guard.pinned(*slot))
            .ok_or_else(|| failure("wallpaper.slots_full"))?;
        let intent = Intent {
            intent_id: token()?,
            generation,
            owner: self.owner.clone(),
            slot: slot as u8,
            phase: Phase::Prepared,
            claim_id: claim_id.map(str::to_owned),
        };
        let path = self.slot_path(slot, &asset);
        let reused = guard.slots[slot].as_ref() == Some(&asset);
        if !reused {
            if claim_id.is_none() {
                write_new(&path, &bytes)?;
            } else {
                let temporary = self.root.join(format!(".{}.part", token()?));
                write_new(&temporary, &bytes)?;
                if publish(&temporary, &path).is_err() {
                    let _ = fs::remove_file(&temporary);
                    return Err(failure("wallpaper.publish"));
                }
            }
        }
        let mut next = guard.clone();
        next.generation = generation;
        next.slots[slot] = Some(asset);
        next.active = Some(intent.clone());
        if let Err(error) = self.persist_with(&next, publish) {
            if !reused {
                let _ = fs::remove_file(&path);
            }
            return Err(error);
        }
        let old = guard.slots[slot].clone();
        *guard = next;
        // Publication now owns the new immutable bytes. Only this old marker's
        // unpinned file can be retired; a cleanup failure leaves a blocking orphan.
        if !reused {
            if let Some(old) = old {
                let _ = fs::remove_file(self.slot_path(slot, &old));
            }
        }
        Ok(intent.descriptor())
    }

    /// Call only on the caller's blocking worker while final authorization is
    /// held. The OS effect is noninterruptible once Applying has been published.
    pub fn apply(
        &self,
        owner: &SessionOwner,
        intent_id: &str,
        setter: &dyn WallpaperSetter,
    ) -> Result<ApplyOutcome, NativeResourceError> {
        self.apply_authorized(owner, intent_id, setter, &|source, target| {
            self.publication.replace(source, target)
        })
    }
    pub(crate) fn apply_authorized(
        &self,
        owner: &SessionOwner,
        intent_id: &str,
        setter: &dyn WallpaperSetter,
        publish: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<ApplyOutcome, NativeResourceError> {
        self.authorize(owner)?;
        let mut guard = self.state.lock().map_err(|_| failure("wallpaper.state"))?;
        if guard
            .latest
            .as_ref()
            .is_some_and(|r| r.intent_id == intent_id && r.owner == self.owner)
        {
            return Ok(ApplyOutcome::AlreadyApplied);
        }
        let intent = guard
            .active
            .as_ref()
            .filter(|i| i.intent_id == intent_id && i.owner == self.owner)
            .cloned()
            .ok_or_else(|| failure("wallpaper.stale"))?;
        if intent.phase != Phase::Prepared {
            return Err(uncertain());
        }
        self.validate_store(&guard)?;
        let mut applying = guard.clone();
        applying.active.as_mut().expect("checked active").phase = Phase::Applying;
        self.persist_with(&applying, publish)?;
        *guard = applying;
        let asset = guard.slots[usize::from(intent.slot)]
            .as_ref()
            .expect("validated slot");
        let path = self.slot_path(usize::from(intent.slot), asset);
        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| setter.set_from_path(&path)));
        if matches!(&result, Ok(Err(error)) if error.code=="wallpaper.not_started") {
            let mut prepared = guard.clone();
            prepared.active.as_mut().expect("checked active").phase = Phase::Prepared;
            if self.persist(&prepared).is_err() {
                self.mark_uncertain(&mut guard);
                return Err(uncertain());
            }
            *guard = prepared;
            return Err(failure("wallpaper.not_started"));
        }
        if !matches!(result, Ok(Ok(()))) {
            self.mark_uncertain(&mut guard);
            return Err(uncertain());
        }
        let mut applied = guard.clone();
        applied.active = None;
        applied.recovery.clear();
        applied.latest = Some(Receipt {
            intent_id: intent.intent_id,
            generation: intent.generation,
            owner: intent.owner,
            slot: intent.slot,
        });
        if self.persist(&applied).is_err() {
            self.mark_uncertain(&mut guard);
            return Err(uncertain());
        }
        *guard = applied;
        Ok(ApplyOutcome::Applied)
    }

    /// Cancel is safe only while a current owner's exact token is still Prepared.
    pub fn cancel(&self, owner: &SessionOwner, intent_id: &str) -> Result<(), NativeResourceError> {
        self.cancel_authorized(owner, intent_id, &|source, target| {
            self.publication.replace(source, target)
        })
    }
    pub(crate) fn cancel_authorized(
        &self,
        owner: &SessionOwner,
        intent_id: &str,
        publish: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<(), NativeResourceError> {
        self.authorize(owner)?;
        let mut guard = self.state.lock().map_err(|_| failure("wallpaper.state"))?;
        let intent = guard
            .active
            .as_ref()
            .filter(|i| i.intent_id == intent_id && i.owner == self.owner)
            .ok_or_else(|| failure("wallpaper.stale"))?;
        if intent.phase != Phase::Prepared {
            return Err(uncertain());
        }
        self.validate_store(&guard)?;
        let mut next = guard.clone();
        next.active = None;
        self.persist_with(&next, publish)?;
        *guard = next;
        Ok(())
    }

    /// Native-only interactive recovery. Future background adapters MUST reject
    /// it. Abandoning uncertainty never asserts which image the OS currently uses;
    /// that candidate remains pinned until a new successful deliberate apply.
    /// Repeated uncertain attempts may exhaust all three slots and fail closed.
    pub fn recover(&self, owner: &SessionOwner) -> Result<(), NativeResourceError> {
        self.recover_authorized(owner, &|source, target| {
            self.publication.replace(source, target)
        })
    }
    pub(crate) fn recover_authorized(
        &self,
        owner: &SessionOwner,
        publish: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<(), NativeResourceError> {
        self.authorize(owner)?;
        let mut guard = self.state.lock().map_err(|_| failure("wallpaper.state"))?;
        self.validate_store(&guard)?;
        let Some(active) = &guard.active else {
            return Ok(());
        };
        if active.phase == Phase::Applying {
            return Err(uncertain());
        }
        let mut next = guard.clone();
        if active.phase == Phase::Uncertain {
            next.recovery.push(active.slot);
        }
        next.active = None;
        self.validate_state(&next)?;
        self.persist_with(&next, publish)?;
        *guard = next;
        Ok(())
    }

    fn authorize(&self, owner: &SessionOwner) -> Result<(), NativeResourceError> {
        if Owner::from(owner) != self.owner {
            return Err(failure("wallpaper.stale"));
        }
        Ok(())
    }
    fn mark_uncertain(&self, state: &mut State) {
        // Memory remains authoritative even when both success and uncertainty
        // publication fail. Durable Applying also blocks replay after reopen.
        if let Some(active) = state.active.as_mut() {
            active.phase = Phase::Uncertain;
        }
        let _ = self.persist(state);
    }
    fn slot_path(&self, slot: usize, asset: &ImageAsset) -> PathBuf {
        let ext = if asset.mime_type == "image/png" {
            "png"
        } else {
            "jpg"
        };
        self.root
            .join(format!("slot-{slot}-{}.{ext}", asset.asset_id))
    }
    fn validate_state(&self, state: &State) -> Result<(), NativeResourceError> {
        if state.schema != 1
            || state.plugin_id != self.owner.plugin_id
            || state.generation > MAX_GENERATION
            || state.recovery.len() > 2
        {
            return Err(failure("wallpaper.state"));
        }
        let mut pins = HashSet::new();
        let mut check_pin = |slot: u8| -> Result<(), NativeResourceError> {
            if slot > 2 || state.slots[usize::from(slot)].is_none() || !pins.insert(slot) {
                return Err(failure("wallpaper.state"));
            }
            Ok(())
        };
        if let Some(active) = &state.active {
            validate_owner(&active.owner)?;
            if active
                .claim_id
                .as_ref()
                .is_some_and(|claim| !valid_claim(claim))
            {
                return Err(failure("wallpaper.claim"));
            }
            if active.owner.plugin_id != state.plugin_id
                || !valid_token(&active.intent_id)
                || active.generation == 0
                || active.generation != state.generation
            {
                return Err(failure("wallpaper.state"));
            }
            check_pin(active.slot)?;
        }
        if let Some(receipt) = &state.latest {
            validate_owner(&receipt.owner)?;
            if receipt.owner.plugin_id != state.plugin_id
                || !valid_token(&receipt.intent_id)
                || receipt.generation == 0
                || receipt.generation > state.generation
                || state.active.as_ref().is_some_and(|a| {
                    a.generation <= receipt.generation || a.intent_id == receipt.intent_id
                })
            {
                return Err(failure("wallpaper.state"));
            }
            check_pin(receipt.slot)?;
        }
        for slot in &state.recovery {
            check_pin(*slot)?;
        }
        for asset in state.slots.iter().flatten() {
            if !valid_token(&asset.asset_id)
                || asset.byte_length == 0
                || asset.byte_length > MAX_IMAGE as u64
                || asset.width == 0
                || asset.height == 0
                || !matches!(asset.mime_type.as_str(), "image/jpeg" | "image/png")
            {
                return Err(failure("wallpaper.state"));
            }
        }
        Ok(())
    }
    fn validate_store(&self, state: &State) -> Result<(), NativeResourceError> {
        self.validate_state(state)?;
        safe_path(&self.root)?;
        let mut allowed = HashSet::from([self.root.join(".lock"), self.root.join("state.json")]);
        for (slot, asset) in state.slots.iter().enumerate() {
            if let Some(asset) = asset {
                let path = self.slot_path(slot, asset);
                let actual = validate_image(&read_bounded(&path, MAX_IMAGE)?, &asset.mime_type)?;
                if &actual != asset {
                    return Err(failure("wallpaper.integrity"));
                }
                allowed.insert(path);
            }
        }
        for entry in fs::read_dir(&self.root).map_err(|_| failure("wallpaper.root"))? {
            let entry = entry.map_err(|_| failure("wallpaper.root"))?;
            if !allowed.contains(&entry.path()) {
                return Err(failure("wallpaper.foreign_file"));
            }
            regular_or_missing(&entry.path())?;
        }
        Ok(())
    }
    fn persist(&self, state: &State) -> Result<(), NativeResourceError> {
        self.persist_with(state, &|source, target| {
            self.publication.replace(source, target)
        })
    }
    fn persist_with(
        &self,
        state: &State,
        publish: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<(), NativeResourceError> {
        self.validate_state(state)?;
        let bytes = serde_json::to_vec(state).map_err(|_| failure("wallpaper.state"))?;
        if bytes.len() > MAX_STATE {
            return Err(failure("wallpaper.state"));
        }
        let target = self.root.join("state.json");
        regular_or_missing(&target)?;
        let temporary = self.root.join(format!(".{}.part", token()?));
        write_new(&temporary, &bytes)?;
        if publish(&temporary, &target).is_err() {
            let _ = fs::remove_file(&temporary);
            return Err(failure("wallpaper.publish"));
        }
        #[cfg(unix)]
        if let Ok(directory) = File::open(&self.root) {
            let _ = directory.sync_all();
        }
        Ok(())
    }
}
fn failure(code: &str) -> NativeResourceError {
    resource_error(
        "wallpaper.effects",
        code,
        "Wallpaper safety state requires attention; existing images were preserved.",
        false,
    )
}
fn uncertain() -> NativeResourceError {
    resource_error(
        "wallpaper.effects",
        "wallpaper.uncertain",
        "Wallpaper outcome is uncertain. Interactive recovery is required before a new attempt.",
        false,
    )
}
fn valid_claim(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
fn valid_token(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn token() -> Result<String, NativeResourceError> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| failure("wallpaper.entropy"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn validate_owner(owner: &Owner) -> Result<(), NativeResourceError> {
    if owner.plugin_id.is_empty()
        || owner.plugin_id.len() > 128
        || owner.version.is_empty()
        || owner.version.len() > 128
        || !valid_token(&owner.digest)
        || owner.root.as_os_str().len() > 4096
        || !owner.root.is_absolute()
        || owner
            .root
            .components()
            .any(|c| matches!(c, Component::CurDir | Component::ParentDir))
    {
        return Err(failure("wallpaper.owner"));
    }
    Ok(())
}
fn safe_path(path: &Path) -> Result<(), NativeResourceError> {
    if !path.is_absolute() {
        return Err(failure("wallpaper.path"));
    }
    let mut current = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                current.push(component.as_os_str())
            }
            _ => return Err(failure("wallpaper.path")),
        }
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(failure("wallpaper.symlink")),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(failure("wallpaper.path")),
        }
    }
    Ok(())
}
fn regular_or_missing(path: &Path) -> Result<(), NativeResourceError> {
    safe_path(path)?;
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err(failure("wallpaper.path")),
    }
}
fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>, NativeResourceError> {
    regular_or_missing(path)?;
    let mut file = File::open(path).map_err(|_| failure("wallpaper.read"))?;
    let metadata = file.metadata().map_err(|_| failure("wallpaper.read"))?;
    if metadata.len() == 0 || metadata.len() > limit as u64 {
        return Err(failure("wallpaper.size"));
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| failure("wallpaper.read"))?;
    if bytes.len() != metadata.len() as usize || bytes.len() > limit {
        return Err(failure("wallpaper.size"));
    }
    Ok(bytes)
}
fn private_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), NativeResourceError> {
    safe_path(path)?;
    // Exclusive creation precedes cleanup ownership: a colliding foreign file is
    // never deleted just because create_new failed.
    let mut file = private_options()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| failure("wallpaper.write"))?;
    if file.write_all(bytes).and_then(|_| file.sync_all()).is_err() {
        let _ = fs::remove_file(path);
        return Err(failure("wallpaper.write"));
    }
    Ok(())
}

#[cfg(test)]
#[path = "wallpaper_effects/tests.rs"]
mod tests;
