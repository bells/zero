//! Native media coordinator. Heavy jobs retain admission until their last worker
//! or UI callback drops; cancellation never waits for a store actor.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::time::Instant;

use super::protocol::{PluginError, PluginRequest};
use super::session::{error, SessionOwner};
use crate::services::image_cache::{ImageCache, PreviewLease, PreviewLeases};
use crate::services::wallpaper_effects::WallpaperEffects;

const PREVIEW_PATH_PREFIX: &str = "/__zero_preview/";

#[derive(Clone, PartialEq, Eq)]
struct Identity {
    plugin: String,
    version: String,
    digest: String,
    root: PathBuf,
}
impl From<&SessionOwner> for Identity {
    fn from(owner: &SessionOwner) -> Self {
        Self {
            plugin: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
        }
    }
}
struct Stores {
    owner: Identity,
    cache: ImageCache,
    effects: WallpaperEffects,
}
#[derive(Default)]
struct Resources {
    jobs: HashMap<String, Weak<MediaJob>>,
    stores: HashMap<String, Arc<Mutex<Option<Stores>>>>,
    stopped: bool,
}
#[derive(Clone, Default)]
pub struct NativeMediaState {
    resources: Arc<Mutex<Resources>>,
    pub(crate) previews: Arc<PreviewLeases>,
}
pub(crate) struct MediaJob {
    resources: Weak<Mutex<Resources>>,
    owner: Identity,
    request: PluginRequest,
    aborted: AtomicBool,
    deadline: Instant,
    store: Arc<Mutex<Option<Stores>>>,
}
impl MediaJob {
    pub(crate) fn check(&self) -> Result<(), PluginError> {
        if self.aborted.load(Ordering::SeqCst) {
            return Err(error("request.cancelled"));
        }
        if Instant::now() >= self.deadline {
            return Err(error("request.timeout"));
        }
        Ok(())
    }
}
impl Drop for MediaJob {
    fn drop(&mut self) {
        if let Some(resources) = self.resources.upgrade() {
            if let Ok(mut resources) = resources.lock() {
                resources.jobs.remove(&self.owner.plugin);
            }
        }
    }
}
impl NativeMediaState {
    pub(crate) fn admit(
        &self,
        owner: &SessionOwner,
        request: &PluginRequest,
        deadline: Instant,
    ) -> Result<Arc<MediaJob>, PluginError> {
        let mut resources = self.resources.lock().map_err(|_| error("media.state"))?;
        if resources.stopped {
            return Err(error("request.cancelled"));
        }
        if resources.jobs.len() >= 2 || resources.jobs.contains_key(&owner.plugin_id) {
            return Err(PluginError {
                retryable: true,
                ..error("media.busy")
            });
        }
        let store = resources
            .stores
            .entry(owner.plugin_id.clone())
            .or_default()
            .clone();
        let job = Arc::new(MediaJob {
            resources: Arc::downgrade(&self.resources),
            owner: owner.into(),
            request: request.clone(),
            aborted: AtomicBool::new(false),
            deadline,
            store,
        });
        resources
            .jobs
            .insert(owner.plugin_id.clone(), Arc::downgrade(&job));
        Ok(job)
    }
    pub fn cancel(&self, request: &PluginRequest) {
        self.abort(|job| {
            job.request.session_id == request.session_id
                && job.request.generation == request.generation
                && job.request.request_id == request.request_id
        });
    }
    fn abort(&self, predicate: impl Fn(&MediaJob) -> bool) {
        let jobs = self
            .resources
            .lock()
            .map(|resources| {
                resources
                    .jobs
                    .values()
                    .filter_map(Weak::upgrade)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for job in jobs {
            if predicate(&job) {
                job.aborted.store(true, Ordering::SeqCst);
            }
        }
    }
    pub fn close_window(&self, label: &str) {
        let Some(session) = label.strip_prefix("plugin-") else {
            return;
        };
        self.abort(|job| job.request.session_id == session);
        let _ = self.previews.release_session_id(session);
    }
    pub fn revoke(&self, plugin: &str) {
        self.abort(|job| job.owner.plugin == plugin);
        let _ = self.previews.revoke_plugin(plugin);
    }
    pub fn shutdown(&self) {
        if let Ok(mut resources) = self.resources.lock() {
            resources.stopped = true;
        }
        self.abort(|_| true);
        let _ = self.previews.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn owner(id: &str) -> SessionOwner {
        SessionOwner {
            plugin_id: id.into(),
            version: "1.0.0".into(),
            digest: "a".repeat(64),
            root: PathBuf::from("/synthetic/package"),
            view_id: "main".into(),
            revision: 1,
            permissions: vec!["network".into()],
        }
    }
    fn request(session: &str) -> PluginRequest {
        PluginRequest {
            protocol_version: "1.0.0".into(),
            request_id: "request".into(),
            session_id: session.into(),
            generation: 1,
            method: "media.cacheImage".into(),
            payload: serde_json::json!({"url":"https://example.com/image.png"}),
        }
    }

    fn assert_retryable_contention(result: Result<Arc<MediaJob>, PluginError>) {
        let error = result.err().expect("quota must deny admission");
        let response = super::super::protocol::PluginResponse::Failure {
            request_id: "request".into(),
            error,
        };
        assert_eq!(
            serde_json::to_value(response).unwrap(),
            serde_json::json!({
                "requestId": "request",
                "ok": false,
                "error": {"code": "media.busy", "message": "media busy", "retryable": true}
            })
        );
    }

    #[test]
    fn admission_spans_owner_replacement_and_actual_last_callback_drop() {
        let state = NativeMediaState::default();
        let deadline = Instant::now() + Duration::from_secs(10);
        let first = state
            .admit(&owner("test.one"), &request("one"), deadline)
            .unwrap();
        let callback = first.clone();
        drop(first);
        let mut replacement = owner("test.one");
        replacement.version = "2.0.0".into();
        assert_retryable_contention(state.admit(&replacement, &request("new"), deadline));
        let second = state
            .admit(&owner("test.two"), &request("two"), deadline)
            .unwrap();
        assert_retryable_contention(state.admit(&owner("test.three"), &request("three"), deadline));
        drop(second);
        assert!(state
            .admit(&owner("test.three"), &request("three"), deadline)
            .is_ok());
        state.revoke("test.one");
        assert!(callback.check().is_err());
        assert_retryable_contention(state.admit(&replacement, &request("new"), deadline));
        drop(callback);
        assert!(state.admit(&replacement, &request("new"), deadline).is_ok());
    }
    #[test]
    fn cancellation_and_close_do_not_wait_for_store_actor() {
        let state = NativeMediaState::default();
        let deadline = Instant::now() + Duration::from_secs(10);
        let export = PluginRequest {
            method: "media.exportImage".into(),
            payload: serde_json::json!({"assetId":"a".repeat(64),"suggestedName":"image.png"}),
            ..request("one")
        };
        let paper = owner("test.one");
        let job = state.admit(&paper, &export, deadline).unwrap();
        let actor = job.store.lock().unwrap();
        state.cancel(&export);
        let cancelled = job.check().unwrap_err();
        assert_eq!(cancelled.code, "request.cancelled");
        assert!(!cancelled.retryable);
        state.close_window("plugin-one");
        let background = request("background");
        assert_retryable_contention(state.admit(&paper, &background, deadline));
        drop(actor);
        drop(job);
        assert!(state.admit(&paper, &background, deadline).is_ok());
        state.shutdown();
        let stopped = state
            .admit(&paper, &background, deadline)
            .err()
            .expect("stopped host must deny admission");
        assert_eq!(stopped.code, "request.cancelled");
        assert!(!stopped.retryable);
    }
}

use super::protocol::PluginMethod;
use super::registry::{atomic_replace_file, PluginRegistryState};
use super::web_assets::WebSessions;
use crate::plugins::contracts::NativeResourceError;
use crate::services::wallpaper::{WallpaperPlatformCapability, WallpaperSetter};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use tauri::Manager;

fn native(error: NativeResourceError) -> PluginError {
    super::session::error(&error.code)
}
#[derive(Clone)]
struct Call {
    app: tauri::AppHandle,
    caller: String,
    request: PluginRequest,
    owner: SessionOwner,
    job: Arc<MediaJob>,
}
impl Call {
    fn commit<T>(
        &self,
        operation: impl FnOnce() -> Result<T, PluginError>,
    ) -> Result<T, PluginError> {
        self.app
            .state::<PluginRegistryState>()
            .read_registry(|registry| {
                let live = super::web_runtime::owner_from_registry(
                    registry,
                    &self.owner.plugin_id,
                    &self.owner.view_id,
                )
                .map_err(|_| error("session.stale"))?;
                let sessions = self.app.state::<WebSessions>();
                let sessions = sessions.0.lock().map_err(|_| error("session.lock"))?;
                sessions.commit_live(
                    &self.caller,
                    &self.request,
                    &live,
                    true,
                    Instant::now(),
                    || {
                        self.job.check()?;
                        operation()
                    },
                )
            })
            .map_err(|_| error("plugin.unavailable"))?
    }
    fn try_commit<T>(
        &self,
        operation: impl FnOnce() -> Result<T, PluginError>,
    ) -> Result<T, PluginError> {
        self.app
            .state::<PluginRegistryState>()
            .try_read_registry(|registry| {
                let live = super::web_runtime::owner_from_registry(
                    registry,
                    &self.owner.plugin_id,
                    &self.owner.view_id,
                )
                .map_err(|_| error("session.stale"))?;
                let sessions = self.app.state::<WebSessions>();
                let sessions = sessions.0.try_lock().map_err(|_| error("session.busy"))?;
                sessions.commit_live(
                    &self.caller,
                    &self.request,
                    &live,
                    true,
                    Instant::now(),
                    || {
                        self.job.check()?;
                        operation()
                    },
                )
            })
            .map_err(|_| error("plugin.busy"))?
    }
    fn publish(&self, source: &Path, target: &Path) -> std::io::Result<()> {
        self.commit(|| atomic_replace_file(source, target).map_err(|_| error("media.publish")))
            .map_err(|error| std::io::Error::other(error.code))
    }
}

pub(crate) fn dispatch(
    app: &tauri::AppHandle,
    caller: &str,
    request: &PluginRequest,
    method: PluginMethod,
) -> Result<Value, PluginError> {
    if matches!(
        method,
        PluginMethod::MediaReleasePreview(_) | PluginMethod::WallpaperPlatform(_)
    ) {
        return dispatch_light(app, caller, request, method);
    }
    let network_started = Instant::now();
    let (owner, root, job) = app
        .state::<PluginRegistryState>()
        .read_registry(|registry| {
            let sessions = app.state::<WebSessions>();
            let sessions = sessions.0.lock().map_err(|_| error("session.lock"))?;
            let session = sessions.get(&request.session_id, caller, request.generation)?;
            let owner = super::web_runtime::owner_from_registry(
                registry,
                &session.owner.plugin_id,
                &session.owner.view_id,
            )
            .map_err(|_| error("session.stale"))?;
            sessions.commit_live(caller, request, &owner, true, Instant::now(), || {
                let root = registry.plugin_data_root(&owner.plugin_id);
                let deadline = session.request_deadline(&request.request_id)?;
                let job = app
                    .state::<NativeMediaState>()
                    .admit(&owner, request, deadline)?;
                Ok((owner.clone(), root, job))
            })
        })
        .map_err(|_| error("plugin.unavailable"))??;
    let call = Call {
        app: app.clone(),
        caller: caller.into(),
        request: request.clone(),
        owner: owner.clone(),
        job,
    };
    let media = app.state::<NativeMediaState>();
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Err(error("platform.unsupported"));
    }
    let download = if let PluginMethod::MediaCache(input) = &method {
        let mut network = app
            .state::<PluginRegistryState>()
            .read_registry(|registry| {
                let scopes = registry
                    .records()
                    .iter()
                    .find(|record| record.name == owner.plugin_id)
                    .and_then(|record| record.protocol_manifest.as_ref())
                    .and_then(|manifest| manifest.network.as_ref())
                    .ok_or_else(|| error("network.scopeDenied"))?
                    .allowed_origins
                    .clone();
                let live = super::web_runtime::owner_from_registry(
                    registry,
                    &owner.plugin_id,
                    &owner.view_id,
                )
                .map_err(|_| error("session.stale"))?;
                let sessions = app.state::<WebSessions>();
                let sessions = sessions.0.lock().map_err(|_| error("session.lock"))?;
                sessions.commit_live(caller, request, &live, true, Instant::now(), || {
                    call.job.check()?;
                    app.state::<crate::services::network_fetch::NetworkFetchState>()
                        .admit(&live, request, scopes, network_started)
                })
            })
            .map_err(|_| error("plugin.unavailable"))??;
        let output = tauri::async_runtime::block_on(network.download_image(input.url.clone()))?;
        network.ensure_active()?;
        if output.status != 200
            || !matches!(
                output.content_type.as_deref(),
                Some("image/jpeg" | "image/png")
            )
        {
            return Err(error("image.mime"));
        }
        Some(output)
    } else {
        None
    };
    call.job.check()?;
    // This actor is never acquired by cancellation/revocation or while a global
    // authorization guard is held. The per-ID permit spans owner replacement.
    let mut actor = call.job.store.lock().map_err(|_| error("media.state"))?;
    if actor
        .as_ref()
        .is_some_and(|store| store.owner != Identity::from(&owner))
    {
        *actor = None;
    }
    if actor.is_none() {
        call.commit(|| Ok(()))?;
        fs::create_dir_all(&root).map_err(|_| error("media.root"))?;
        let cache = ImageCache::open(&owner, &root).map_err(native)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
                .map_err(|_| error("media.root"))?;
        }
        let effects = WallpaperEffects::open(&owner, &root).map_err(native)?;
        *actor = Some(Stores {
            owner: (&owner).into(),
            cache,
            effects,
        });
    }
    let store = actor.as_mut().ok_or_else(|| error("media.state"))?;
    let publish = |source: &Path, target: &Path| call.publish(source, target);
    let value = match method {
        PluginMethod::MediaCache(_) => {
            let output = download.ok_or_else(|| error("network.failed"))?;
            let asset = store
                .cache
                .store_with(
                    &output.bytes,
                    output.content_type.as_deref().unwrap_or(""),
                    publish,
                )
                .map_err(native)?;
            serde_json::to_value(asset).map_err(|_| error("response.invalid"))?
        }
        PluginMethod::MediaPreview(input) => {
            let prepared =
                PreviewLeases::prepare(&store.cache, &owner, &input.asset_id).map_err(native)?;
            call.commit(|| {
                let lease = media
                    .previews
                    .publish(&owner, &request.session_id, request.generation, prepared)
                    .map_err(native)?;
                preview_output(&lease)
            })?
        }
        PluginMethod::WallpaperPrepare(input) => {
            let intent = store
                .effects
                .prepare_claimed(
                    &owner,
                    &store.cache,
                    &input.asset_id,
                    &input.claim_id,
                    &publish,
                )
                .map_err(native)?;
            json!({"intentId":intent.intent_id,"generation":intent.generation})
        }
        PluginMethod::WallpaperApply(input) => {
            let setter = PublicSetter(call.clone());
            let outcome = store
                .effects
                .apply_authorized(&owner, &input.intent_id, &setter, &publish)
                .map_err(native)?;
            json!({"outcome":match outcome {crate::services::wallpaper_effects::ApplyOutcome::Applied=>"applied",crate::services::wallpaper_effects::ApplyOutcome::AlreadyApplied=>"alreadyApplied"}})
        }
        PluginMethod::WallpaperCancel(input) => {
            store
                .effects
                .cancel_authorized(&owner, &input.intent_id, &publish)
                .map_err(native)?;
            Value::Null
        }
        PluginMethod::WallpaperRecover(_) => {
            store
                .effects
                .recover_authorized(&owner, &publish)
                .map_err(native)?;
            Value::Null
        }
        PluginMethod::MediaExport(input) => {
            let bytes = store
                .cache
                .read_for_owner(&owner, &input.asset_id)
                .map_err(native)?;
            let asset = crate::services::image_cache::validate_image(
                &bytes,
                match image::guess_format(&bytes).map_err(|_| error("image.format"))? {
                    image::ImageFormat::Png => "image/png",
                    image::ImageFormat::Jpeg => "image/jpeg",
                    _ => return Err(error("image.mime")),
                },
            )
            .map_err(native)?;
            export_image(
                &call,
                &bytes,
                &input.suggested_name,
                &asset.mime_type,
                &NativePicker,
            )?
        }
        _ => return Err(error("request.invalid")),
    };
    drop(actor);
    call.commit(|| Ok(value))
}
fn public_platform() -> WallpaperPlatformCapability {
    WallpaperPlatformCapability {
        platform: if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "linux") {
            "linux"
        } else {
            "unknown"
        }
        .into(),
        supported: cfg!(any(target_os = "macos", target_os = "windows")),
        detail: None,
    }
}
#[derive(Default)]
struct EffectStartGate(AtomicU8);
impl EffectStartGate {
    fn start(&self) -> Result<(), PluginError> {
        self.0
            .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| ())
            .map_err(|_| error("request.cancelled"))
    }
    fn cancel_before_start(&self) -> bool {
        self.0
            .compare_exchange(0, 2, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
            || self.0.load(Ordering::SeqCst) == 2
    }
}
fn effect_failure(started: bool) -> NativeResourceError {
    crate::services::native_resources::resource_error(
        "wallpaper.apply",
        if started {
            "wallpaper.uncertain"
        } else {
            "wallpaper.not_started"
        },
        if started {
            "Wallpaper outcome is uncertain."
        } else {
            "The native invocation did not start."
        },
        false,
    )
}
struct PublicSetter(Call);
impl WallpaperSetter for PublicSetter {
    fn set_from_path(&self, path: &Path) -> Result<(), NativeResourceError> {
        #[cfg(target_os = "macos")]
        {
            let gate = Arc::new(EffectStartGate::default());
            let callback_gate = gate.clone();
            let call = self.0.clone();
            let path = path.to_path_buf();
            let (send, receive) = std::sync::mpsc::sync_channel(1);
            if self
                .0
                .app
                .run_on_main_thread(move || {
                    let outcome = call.try_commit(|| {
                        use objc2::{runtime::AnyObject, MainThreadMarker};
                        use objc2_app_kit::{
                            NSScreen, NSWorkspace, NSWorkspaceDesktopImageOptionKey,
                        };
                        use objc2_foundation::{NSDictionary, NSString, NSURL};
                        let mtm =
                            MainThreadMarker::new().ok_or_else(|| error("wallpaper.thread"))?;
                        let url = NSURL::fileURLWithPath(&NSString::from_str(
                            path.to_str().ok_or_else(|| error("wallpaper.path"))?,
                        ));
                        let options =
                            NSDictionary::<NSWorkspaceDesktopImageOptionKey, AnyObject>::new();
                        let screens = NSScreen::screens(mtm);
                        if screens.is_empty() {
                            return Err(error("wallpaper.screens"));
                        }
                        let workspace = NSWorkspace::sharedWorkspace();
                        for (index, screen) in screens.iter().enumerate() {
                            call.job.check()?;
                            if index == 0 {
                                callback_gate.start()?;
                            }
                            unsafe {
                                workspace.setDesktopImageURL_forScreen_options_error(
                                    &url, &screen, &options,
                                )
                            }
                            .map_err(|_| error("wallpaper.uncertain"))?;
                        }
                        Ok(())
                    });
                    let _ = send.send(outcome);
                })
                .is_err()
            {
                gate.cancel_before_start();
                return Err(effect_failure(false));
            }
            let remaining = self
                .0
                .job
                .deadline
                .saturating_duration_since(Instant::now());
            return match receive.recv_timeout(remaining) {
                Ok(Ok(())) => Ok(()),
                _ => Err(effect_failure(!gate.cancel_before_start())),
            };
        }
        #[cfg(target_os = "windows")]
        {
            let gate = EffectStartGate::default();
            return self
                .0
                .try_commit(|| {
                    gate.start()?;
                    crate::services::wallpaper::SystemWallpaperSetter
                        .set_from_path(path)
                        .map_err(native)
                })
                .map_err(|_| effect_failure(!gate.cancel_before_start()));
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = path;
            Err(effect_failure(false))
        }
    }
}

trait SavePicker {
    fn pick(
        &self,
        call: &Call,
        name: &str,
        extension: &str,
    ) -> Result<Option<PathBuf>, PluginError>;
}
struct NativePicker;
impl SavePicker for NativePicker {
    fn pick(
        &self,
        call: &Call,
        name: &str,
        extension: &str,
    ) -> Result<Option<PathBuf>, PluginError> {
        call.commit(|| Ok(()))?;
        let window = call
            .app
            .get_webview_window(&call.caller)
            .ok_or_else(|| error("session.revoked"))?;
        Ok(tauri::async_runtime::block_on(
            rfd::AsyncFileDialog::new()
                .set_parent(&window)
                .set_file_name(name)
                .add_filter("Image", &[extension])
                .save_file(),
        )
        .map(|file| file.path().to_path_buf()))
    }
}
fn suggested_name(value: &str, mime: &str) -> String {
    let stem = value
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(value);
    let clean: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .scan(0usize, |bytes, character| {
            *bytes += character.len_utf8();
            (*bytes <= 120).then_some(character)
        })
        .collect();
    let clean = clean.trim_matches(['.', ' ']);
    format!(
        "{}.{}",
        if clean.is_empty() { "wallpaper" } else { clean },
        if mime == "image/png" { "png" } else { "jpg" }
    )
}
fn export_image(
    call: &Call,
    bytes: &[u8],
    suggestion: &str,
    mime: &str,
    picker: &dyn SavePicker,
) -> Result<Value, PluginError> {
    export_with(
        bytes,
        suggestion,
        mime,
        |name, extension| picker.pick(call, name, extension),
        || call.commit(|| Ok(())),
        |source, target| call.publish(source, target),
    )
}
fn export_with(
    bytes: &[u8],
    suggestion: &str,
    mime: &str,
    pick: impl FnOnce(&str, &str) -> Result<Option<PathBuf>, PluginError>,
    authorize: impl Fn() -> Result<(), PluginError>,
    publish: impl Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<Value, PluginError> {
    if suggestion.len() > 1024 {
        return Err(error("request.invalid"));
    }
    let name = suggested_name(suggestion, mime);
    let Some(destination) = pick(&name, if mime == "image/png" { "png" } else { "jpg" })? else {
        authorize()?;
        return Ok(json!({"cancelled":true,"fileName":null}));
    };
    authorize()?;
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| {
            !name.is_empty()
                && name.len() <= 180
                && !name.contains('\\')
                && !name.chars().any(char::is_control)
        })
        .ok_or_else(|| error("export.destination"))?
        .to_owned();
    let parent = destination
        .parent()
        .filter(|path| path.is_absolute())
        .ok_or_else(|| error("export.destination"))?;
    if fs::symlink_metadata(&destination)
        .is_ok_and(|metadata| !metadata.is_file() || metadata.file_type().is_symlink())
    {
        return Err(error("export.destination"));
    }
    let mut nonce = [0_u8; 32];
    getrandom::fill(&mut nonce).map_err(|_| error("export.entropy"))?;
    let temporary = parent.join(format!(
        ".zero-export-{}.part",
        nonce
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    ));
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|_| error("export.write"))?;
    let outcome = (|| {
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| error("export.write"))?;
        drop(file);
        publish(&temporary, &destination).map_err(|_| error("export.publish"))?;
        Ok(json!({"cancelled":false,"fileName":file_name}))
    })();
    if outcome.is_err() {
        let _ = fs::remove_file(temporary);
    }
    outcome
}

fn preview_output(lease: &PreviewLease) -> Result<Value, PluginError> {
    let mut value = serde_json::to_value(lease).map_err(|_| error("response.invalid"))?;
    // A root-relative path resolves on the invoking WebView's effective origin.
    value["url"] = json!(format!("{PREVIEW_PATH_PREFIX}{}", lease.lease_id));
    Ok(value)
}

pub(crate) fn serve_preview(
    app: &tauri::AppHandle,
    caller: &str,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    preview_response(request, |session_id, token| {
        app.state::<PluginRegistryState>()
            .read_registry(|registry| {
                let sessions = app.state::<WebSessions>();
                let sessions = sessions.0.lock().map_err(|_| 403u16)?;
                let owner = sessions
                    .asset_owner(session_id, caller, Instant::now())
                    .map_err(|_| 403u16)?;
                let session = sessions
                    .get(
                        session_id,
                        caller,
                        session_generation(&sessions, session_id, caller)?,
                    )
                    .map_err(|_| 403u16)?;
                if !matches!(session.kind, super::session::SessionKind::View) {
                    return Err(403u16);
                }
                let live = super::web_runtime::owner_from_registry(
                    registry,
                    &owner.plugin_id,
                    &owner.view_id,
                )
                .map_err(|_| 403u16)?;
                if Identity::from(owner) != Identity::from(&live)
                    || !owner
                        .permissions
                        .iter()
                        .any(|permission| permission == "network")
                    || !live
                        .permissions
                        .iter()
                        .any(|permission| permission == "network")
                {
                    return Err(403u16);
                }
                app.state::<NativeMediaState>()
                    .previews
                    .read(&live, session_id, session.info.generation, token)
                    .map_err(|_| 403u16)
            })
            .map_err(|_| 503u16)?
    })
}
fn preview_response(
    request: &tauri::http::Request<Vec<u8>>,
    read: impl Fn(&str, &str) -> Result<Arc<[u8]>, u16>,
) -> tauri::http::Response<Vec<u8>> {
    let result = (|| {
        if request.method() != "GET" && request.method() != "HEAD" {
            return Err(405u16);
        }
        if request.uri().query().is_some() {
            return Err(400u16);
        }
        let session_id = request.uri().host().ok_or(403u16)?;
        let token = request
            .uri()
            .path()
            .strip_prefix(PREVIEW_PATH_PREFIX)
            .filter(|token| {
                token.len() == 64
                    && token
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
            .ok_or(400u16)?;
        let bytes = read(session_id, token)?;
        let output = if request.method() == "HEAD" {
            Vec::new()
        } else {
            bytes.to_vec()
        };
        // Copy off authorization guards, then recheck full owner/grants/TTL at delivery.
        read(session_id, token)?;
        Ok((output, bytes.len()))
    })();
    match result {
        Ok((bytes, length)) => {
            let mut response = super::web_assets::response(200, "image/jpeg", bytes);
            if let Ok(length) = tauri::http::HeaderValue::from_str(&length.to_string()) {
                response
                    .headers_mut()
                    .insert(tauri::http::header::CONTENT_LENGTH, length);
            }
            response
        }
        Err(status) => {
            super::web_assets::response(status, "text/plain", b"Preview unavailable".to_vec())
        }
    }
}
fn session_generation(
    sessions: &super::session::Sessions,
    id: &str,
    caller: &str,
) -> Result<u64, u16> {
    // asset_owner already validates the caller; find_view returns only view sessions.
    let owner = sessions
        .asset_owner(id, caller, Instant::now())
        .map_err(|_| 403u16)?;
    sessions
        .find_view(&owner.plugin_id, &owner.view_id)
        .filter(|(_, info)| info.session_id == id)
        .map(|(_, info)| info.generation)
        .ok_or(403)
}

fn dispatch_light(
    app: &tauri::AppHandle,
    caller: &str,
    request: &PluginRequest,
    method: PluginMethod,
) -> Result<Value, PluginError> {
    app.state::<PluginRegistryState>()
        .read_registry(|registry| {
            let sessions = app.state::<WebSessions>();
            let sessions = sessions.0.lock().map_err(|_| error("session.lock"))?;
            let session = sessions.get(&request.session_id, caller, request.generation)?;
            let owner = super::web_runtime::owner_from_registry(
                registry,
                &session.owner.plugin_id,
                &session.owner.view_id,
            )
            .map_err(|_| error("session.stale"))?;
            sessions.commit_live(
                caller,
                request,
                &owner,
                true,
                Instant::now(),
                || match method {
                    PluginMethod::MediaReleasePreview(input) => {
                        app.state::<NativeMediaState>()
                            .previews
                            .release(
                                &owner,
                                &request.session_id,
                                request.generation,
                                &input.lease_id,
                            )
                            .map_err(native)?;
                        Ok(Value::Null)
                    }
                    PluginMethod::WallpaperPlatform(_) => serde_json::to_value(public_platform())
                        .map_err(|_| error("response.invalid")),
                    _ => Err(error("request.invalid")),
                },
            )
        })
        .map_err(|_| error("plugin.unavailable"))?
}

#[cfg(test)]
mod publication_tests {
    use super::*;
    use image::{DynamicImage, ImageFormat, RgbImage};
    use std::sync::atomic::AtomicU64;
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let path = std::env::temp_dir().canonicalize().unwrap().join(format!(
                "zero-media-adapter-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn png() -> Vec<u8> {
        let mut bytes = std::io::Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 6, image::Rgb([2, 3, 4])))
            .write_to(&mut bytes, ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }
    fn owner() -> SessionOwner {
        SessionOwner {
            plugin_id: "test.media".into(),
            version: "1.0.0".into(),
            digest: "a".repeat(64),
            root: "/installed/test.media".into(),
            view_id: "main".into(),
            revision: 1,
            permissions: vec![
                "network".into(),
                "system.wallpaper".into(),
                "files.export".into(),
                "background.schedule".into(),
            ],
        }
    }
    fn methods() -> Vec<(&'static str, Value, &'static str, bool)> {
        let id = "a".repeat(64);
        vec![
            (
                "media.cacheImage",
                json!({"url":"https://example.com/a.png"}),
                "network",
                false,
            ),
            ("media.preview", json!({"assetId":id}), "network", true),
            (
                "media.releasePreview",
                json!({"leaseId":id}),
                "network",
                true,
            ),
            (
                "media.exportImage",
                json!({"assetId":id,"suggestedName":"wallpaper.png"}),
                "files.export",
                true,
            ),
            ("wallpaper.platform", json!({}), "system.wallpaper", false),
            (
                "wallpaper.prepare",
                json!({"assetId":id,"claimId":"4c612626-dd03-40b4-8fc1-96fc75f2980c"}),
                "system.wallpaper",
                false,
            ),
            (
                "wallpaper.apply",
                json!({"intentId":id}),
                "system.wallpaper",
                false,
            ),
            (
                "wallpaper.cancelPrepared",
                json!({"intentId":id}),
                "system.wallpaper",
                false,
            ),
            ("wallpaper.recover", json!({}), "system.wallpaper", true),
        ]
    }
    #[test]
    fn every_media_method_has_exact_payload_grant_and_background_kind_boundary() {
        use super::super::session::Sessions;
        let now = Instant::now();
        for (method, payload, permission, view_only) in methods() {
            let mut sessions = Sessions::default();
            let owner = owner();
            let info = sessions.issue(owner.clone(), now).unwrap();
            let caller = format!("plugin-{}", info.session_id);
            sessions
                .ready(&info.session_id, &caller, info.generation, now)
                .unwrap();
            let request = PluginRequest {
                protocol_version: "1.0.0".into(),
                request_id: "request".into(),
                session_id: info.session_id.clone(),
                generation: info.generation,
                method: method.into(),
                payload: payload.clone(),
            };
            assert_eq!(
                request.decode_method().unwrap().permission(),
                permission,
                "{method}"
            );
            let mut extra = request.clone();
            extra.payload["path"] = json!("/private/no");
            assert!(extra.decode_method().is_err(), "{method}");
            let mut denied = owner.clone();
            denied.permissions.retain(|grant| grant != permission);
            assert_eq!(
                sessions
                    .begin(&caller, &request, &denied, true, now)
                    .unwrap_err()
                    .code,
                "permission.denied",
                "{method}"
            );
            sessions
                .begin(&caller, &request, &owner, true, now)
                .unwrap();
            for field in ["version", "digest", "root", "grant", "disable"] {
                let mut changed = owner.clone();
                match field {
                    "version" => changed.version = "2.0.0".into(),
                    "digest" => changed.digest = "b".repeat(64),
                    "root" => changed.root = "/other".into(),
                    "grant" => changed.permissions.clear(),
                    _ => {}
                }
                assert!(
                    sessions
                        .commit_live::<()>(
                            &caller,
                            &request,
                            &changed,
                            field != "disable",
                            now,
                            || panic!("stale publication")
                        )
                        .is_err(),
                    "{method}:{field}"
                );
            }
            sessions.finish(&caller, &request, now).unwrap();
            let occurrence = super::super::scheduler::Occurrence {
                owner: super::super::scheduler::Owner {
                    plugin_id: owner.plugin_id.clone(),
                    version: owner.version.clone(),
                    digest: owner.digest.clone(),
                    root: owner.root.clone(),
                },
                schedule: super::super::scheduler::Schedule {
                    task_id: "daily".into(),
                    event_id: "scheduled.daily".into(),
                    next_at_ms: 1,
                    payload: Value::Null,
                },
                generation: 1,
                occurrence_id: "f".repeat(32),
                attempt: 1,
            };
            let info = sessions
                .issue_background(
                    owner.clone(),
                    occurrence,
                    "background.js".into(),
                    crate::services::continuous_clock::now_ms().unwrap(),
                    now,
                )
                .unwrap();
            let caller = format!("plugin-{}", info.session_id);
            sessions
                .ready(&info.session_id, &caller, info.generation, now)
                .unwrap();
            let background = PluginRequest {
                session_id: info.session_id,
                generation: info.generation,
                ..request
            };
            assert_eq!(
                sessions
                    .begin(&caller, &background, &owner, true, now)
                    .is_ok(),
                !view_only,
                "{method}"
            );
        }
    }
    #[test]
    fn issued_preview_path_serves_the_jpeg_only_for_the_issuing_session() {
        use super::super::session::Sessions;

        let temp = Temp::new();
        let owner = owner();
        let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
        let asset = cache.store(&png(), "image/png").unwrap();
        let mut sessions = Sessions::default();
        let now = Instant::now();
        let issuer = sessions.issue(owner.clone(), now).unwrap();
        let peer = sessions
            .issue(
                SessionOwner {
                    view_id: "tray".into(),
                    ..owner.clone()
                },
                now,
            )
            .unwrap();
        let issuer_label = format!("plugin-{}", issuer.session_id);
        let peer_label = format!("plugin-{}", peer.session_id);
        sessions
            .ready(&issuer.session_id, &issuer_label, issuer.generation, now)
            .unwrap();
        sessions
            .ready(&peer.session_id, &peer_label, peer.generation, now)
            .unwrap();
        let leases = PreviewLeases::default();
        let lease = leases
            .issue(
                &cache,
                &owner,
                &issuer.session_id,
                issuer.generation,
                &asset.asset_id,
            )
            .unwrap();
        let output = preview_output(&lease).unwrap();
        assert_eq!(
            output,
            json!({
                "leaseId": lease.lease_id,
                "url": format!("/__zero_preview/{}", lease.lease_id),
                "byteLength": lease.byte_length,
                "width": lease.width,
                "height": lease.height,
                "mimeType": "image/jpeg"
            })
        );
        let path = output["url"].as_str().unwrap();

        // Wry restores the custom scheme before invoking the protocol handler.
        for (session, caller, status) in [
            (&issuer, &issuer_label, 200),
            (&issuer, &peer_label, 403),
            (&peer, &peer_label, 403),
        ] {
            let request = tauri::http::Request::builder()
                .uri(format!("zero-plugin://{}{path}", session.session_id))
                .body(vec![])
                .unwrap();
            let response = preview_response(&request, |host, token| {
                let owner = sessions
                    .asset_owner(host, caller, now)
                    .map_err(|_| 403u16)?;
                leases
                    .read(
                        owner,
                        host,
                        session_generation(&sessions, host, caller)?,
                        token,
                    )
                    .map_err(|_| 403u16)
            });
            assert_eq!(response.status(), status);
            assert_eq!(response.body().starts_with(&[0xff, 0xd8]), status == 200);
        }
    }

    #[test]
    fn cache_staging_denied_after_flush_preserves_index_and_cleans_only_owned_temporary() {
        let temp = Temp::new();
        let owner = owner();
        let mut cache = ImageCache::open(&owner, &temp.0).unwrap();
        let bytes = png();
        let deny = |source: &Path, _target: &Path| {
            assert!(source.is_file());
            assert!(!fs::read(source).unwrap().is_empty());
            Err(std::io::Error::other("revoked"))
        };
        assert!(cache.store_with(&bytes, "image/png", deny).is_err());
        assert_eq!(
            fs::read_dir(temp.0.join("image-cache-v1")).unwrap().count(),
            0
        );
        assert!(cache.store(&bytes, "image/png").is_ok());
    }
    #[test]
    fn export_cancel_and_revocation_never_publish_or_modify_unrelated_files() {
        let temp = Temp::new();
        let unrelated = temp.0.join("unrelated.txt");
        fs::write(&unrelated, b"preserve").unwrap();
        let bytes = png();
        assert_eq!(
            export_with(
                &bytes,
                "../bad/name.exe",
                "image/png",
                |name, extension| {
                    assert_eq!(name, "_bad_name.png");
                    assert_eq!(extension, "png");
                    Ok(None)
                },
                || Ok(()),
                |_, _| panic!("cancel writes nothing")
            )
            .unwrap(),
            json!({"cancelled":true,"fileName":null})
        );
        let destination = temp.0.join("confirmed.png");
        fs::write(&destination, b"old confirmed bytes").unwrap();
        assert!(export_with(
            &bytes,
            "new.png",
            "image/png",
            |_, _| Ok(Some(destination.clone())),
            || Ok(()),
            |source, _| {
                assert_eq!(fs::read(source).unwrap(), bytes);
                Err(std::io::Error::other("revoked"))
            }
        )
        .is_err());
        assert_eq!(fs::read(&destination).unwrap(), b"old confirmed bytes");
        assert_eq!(fs::read(&unrelated).unwrap(), b"preserve");
        assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 2);
        assert_eq!(
            export_with(
                &bytes,
                "new.png",
                "image/png",
                |_, _| Ok(Some(destination.clone())),
                || Ok(()),
                atomic_replace_file
            )
            .unwrap(),
            json!({"cancelled":false,"fileName":"confirmed.png"})
        );
        assert_eq!(fs::read(destination).unwrap(), bytes);
        assert_eq!(fs::read(unrelated).unwrap(), b"preserve");
    }

    #[test]
    fn export_job_enforces_cutoff_and_retains_admission_while_picker_owns_it() {
        use std::time::Duration;

        let state = NativeMediaState::default();
        let owner = owner();
        let request = PluginRequest {
            protocol_version: "1.0.0".into(),
            request_id: "export".into(),
            session_id: "view".into(),
            generation: 1,
            method: "media.exportImage".into(),
            payload: json!({"assetId":"a".repeat(64),"suggestedName":"wallpaper.png"}),
        };
        let now = Instant::now();
        for (elapsed, expected) in [(11, "request.cancelled"), (120, "request.timeout")] {
            let cutoff = now + Duration::from_secs(120 - elapsed);
            let job = state.admit(&owner, &request, cutoff).unwrap();
            let picker = job.clone();
            drop(job);
            if elapsed == 11 {
                picker.check().unwrap();
                state.cancel(&request);
            }
            assert_eq!(picker.check().unwrap_err().code, expected);
            assert_eq!(
                state.admit(&owner, &request, cutoff).err().unwrap().code,
                "media.busy"
            );
            drop(picker);
            assert!(state.admit(&owner, &request, cutoff).is_ok());
        }
    }

    #[test]
    fn export_waiting_for_picker_rechecks_grant_and_cancellation_before_writing() {
        use super::super::session::Sessions;
        use std::time::Duration;

        let temp = Temp::new();
        let destination = temp.0.join("confirmed.png");
        fs::write(&destination, b"old bytes").unwrap();
        let bytes = png();
        let now = Instant::now();
        let after_picker = now + Duration::from_secs(11);
        let owner = owner();
        let mut live = owner.clone();
        live.permissions.retain(|grant| grant != "files.export");
        let mut sessions = Sessions::default();
        let info = sessions.issue(owner.clone(), now).unwrap();
        let caller = format!("plugin-{}", info.session_id);
        sessions
            .ready(&info.session_id, &caller, info.generation, now)
            .unwrap();
        let request = PluginRequest {
            protocol_version: "1.0.0".into(),
            request_id: "export".into(),
            session_id: info.session_id,
            generation: info.generation,
            method: "media.exportImage".into(),
            payload: json!({"assetId":"a".repeat(64),"suggestedName":"wallpaper.png"}),
        };
        sessions
            .begin(&caller, &request, &owner, true, now)
            .unwrap();
        for (cancel, current, expected) in [
            (false, &live, "permission.denied"),
            (true, &owner, "request.cancelled"),
        ] {
            if cancel {
                sessions.finish(&caller, &request, after_picker).unwrap();
            }
            let result = export_with(
                &bytes,
                "wallpaper.png",
                "image/png",
                |_, _| Ok(Some(destination.clone())),
                || sessions.commit_live(&caller, &request, current, true, after_picker, || Ok(())),
                |_, _| panic!("revocation must fence export publication"),
            );
            let failure = result.unwrap_err();
            assert_eq!(failure.code, expected);
            assert!(!failure.retryable);
            assert_eq!(fs::read(&destination).unwrap(), b"old bytes");
            assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 1);
        }
    }
}

#[cfg(test)]
mod preview_route_tests {
    use super::*;
    use std::cell::Cell;
    #[test]
    fn native_preview_route_rejects_traversal_queries_wrong_methods_and_final_revocation() {
        let id = "a".repeat(64);
        let lease = "b".repeat(64);
        let url = format!("zero-plugin://{id}/__zero_preview/{lease}");
        let bytes: Arc<[u8]> = Arc::from(&b"\xff\xd8native jpeg\xff\xd9"[..]);
        for method in ["GET", "HEAD"] {
            let request = tauri::http::Request::builder()
                .method(method)
                .uri(&url)
                .body(vec![])
                .unwrap();
            let reads = Cell::new(0);
            let response = preview_response(&request, |session, token| {
                assert_eq!(session, id);
                assert_eq!(token, lease);
                reads.set(reads.get() + 1);
                Ok(bytes.clone())
            });
            assert_eq!(reads.get(), 2);
            assert_eq!(response.status(), 200);
            assert_eq!(response.headers()["Content-Type"], "image/jpeg");
            assert_eq!(response.headers()["Cache-Control"], "no-store");
            assert_eq!(response.headers()["X-Content-Type-Options"], "nosniff");
            assert_eq!(
                response.headers()["Content-Length"],
                bytes.len().to_string()
            );
            assert_eq!(response.body().is_empty(), method == "HEAD");
            if method == "GET" {
                assert_eq!(response.body(), bytes.as_ref());
            }
        }
        for path in [
            format!("{url}?path=/private/x"),
            format!("{url}/../peer"),
            format!("zero-plugin://{id}/__zero_preview/%2e%2e"),
            format!("zero-plugin://{id}/__zero_preview/{}", "C".repeat(64)),
        ] {
            let request = tauri::http::Request::builder()
                .uri(path)
                .body(vec![])
                .unwrap();
            assert_eq!(
                preview_response(&request, |_, _| panic!(
                    "invalid route cannot access leases"
                ))
                .status(),
                400
            );
        }
        let request = tauri::http::Request::builder()
            .method("POST")
            .uri(&url)
            .body(vec![])
            .unwrap();
        assert_eq!(
            preview_response(&request, |_, _| panic!("invalid method")).status(),
            405
        );
        let request = tauri::http::Request::builder()
            .uri(&url)
            .body(vec![])
            .unwrap();
        let reads = Cell::new(0);
        let response = preview_response(&request, |_, _| {
            reads.set(reads.get() + 1);
            if reads.get() == 1 {
                Ok(bytes.clone())
            } else {
                Err(403)
            }
        });
        assert_eq!(response.status(), 403);
        assert!(!response.body().starts_with(&[0xff, 0xd8]));
    }
}

#[cfg(test)]
mod effect_gate_tests {
    use super::*;
    #[test]
    fn queued_timeout_fences_late_os_start_but_started_effect_is_uncertain() {
        let queued = EffectStartGate::default();
        assert!(queued.cancel_before_start());
        assert!(queued.start().is_err());
        assert!(queued.cancel_before_start());
        assert_eq!(effect_failure(false).code, "wallpaper.not_started");
        let started = EffectStartGate::default();
        started.start().unwrap();
        assert!(!started.cancel_before_start());
        assert_eq!(effect_failure(true).code, "wallpaper.uncertain");
    }
}
