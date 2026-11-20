use std::collections::HashMap;
use std::io::{Cursor, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use image::{ExtendedColorType, ImageEncoder, ImageFormat, ImageReader, Limits, RgbaImage};
use serde_json::{json, Value};
use tauri::{
    http::{header, HeaderValue, Request, Response},
    AppHandle, Manager, WebviewWindow, Wry,
};

use super::protocol::{CaptureExportAction, PluginError, PluginMethod, PluginRequest};
use super::registry::{atomic_replace_file, PluginRegistryState};
use super::session::error;
use super::web_assets::{response, WebSessions};
use super::web_runtime::{owner_from_registry, with_live_capability};

const CAPABILITY: &str = "screen.capture";
pub(crate) const CAPTURE_PATH_PREFIX: &str = "/__zero_capture/";
pub(crate) const MAX_CAPTURE_BYTES: usize = 32 * 1024 * 1024;
const MAX_PIXELS: u64 = 40_000_000;
const MAX_AXIS: u32 = 16_384;
const MAX_CAPTURE_VIEWS: usize = 4;
const CAPTURE_TTL: Duration = Duration::from_secs(10 * 60);
const EXPORT_TTL: Duration = Duration::from_secs(30);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[derive(Default)]
pub(crate) struct CaptureState {
    assets: Mutex<HashMap<String, ViewCapture>>,
    capturing: AtomicBool,
    exporting: AtomicBool,
}

struct ViewCapture {
    id: String,
    width: u32,
    height: u32,
    png: Arc<[u8]>,
    expires_at: Instant,
    export: Option<ExportLease>,
    expiration_task: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl Drop for ViewCapture {
    fn drop(&mut self) {
        if let Some(task) = &self.expiration_task {
            task.abort();
        }
    }
}

struct ExportLease {
    id: String,
    action: CaptureExportAction,
    expires_at: Instant,
}

struct ExportClaim {
    capture_id: String,
    action: CaptureExportAction,
    width: u32,
    height: u32,
}

struct Permit<'a>(&'a AtomicBool);

impl Drop for Permit<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn permit(flag: &AtomicBool) -> Result<Permit<'_>, PluginError> {
    flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| PluginError {
            retryable: true,
            ..error("screen.busy")
        })?;
    Ok(Permit(flag))
}

impl CaptureState {
    pub(crate) fn close_window(&self, caller: &str) {
        if let Ok(mut views) = self.assets.lock() {
            views.remove(caller);
        }
    }

    fn clear_capture(&self, caller: &str, capture_id: &str) -> Result<bool, PluginError> {
        let mut views = self.assets.lock().map_err(|_| error("screen.state"))?;
        if views
            .get(caller)
            .is_some_and(|asset| asset.id != capture_id)
        {
            return Ok(false);
        }
        views.remove(caller);
        Ok(true)
    }

    fn clear_expired(&self, owner_window: &WebviewWindow, id: &str) {
        if let Ok(mut views) = self.assets.lock() {
            let caller = owner_window.label();
            if views.get(caller).is_some_and(|asset| asset.id == id) {
                let _ = owner_window.set_always_on_top(false);
                views.remove(caller);
            }
        }
    }

    fn publish(
        &self,
        caller: &str,
        capture: ViewCapture,
        now: Instant,
    ) -> Result<Value, PluginError> {
        let mut views = self.assets.lock().map_err(|_| error("screen.state"))?;
        views.retain(|_, asset| asset.expires_at > now);
        if views.len() >= MAX_CAPTURE_VIEWS && !views.contains_key(caller) {
            return Err(error("screen.captureLimit"));
        }
        let result = json!({
            "captureId": capture.id,
            "width": capture.width,
            "height": capture.height,
            "url": format!("{CAPTURE_PATH_PREFIX}{}", capture.id),
        });
        views.insert(caller.to_owned(), capture);
        Ok(result)
    }

    fn with_capture<T>(
        &self,
        caller: &str,
        id: &str,
        now: Instant,
        use_asset: impl FnOnce(&mut ViewCapture) -> Result<T, PluginError>,
    ) -> Result<T, PluginError> {
        let mut views = self.assets.lock().map_err(|_| error("screen.state"))?;
        views.retain(|_, asset| asset.expires_at > now);
        let asset = views
            .get_mut(caller)
            .filter(|asset| asset.id == id)
            .ok_or_else(|| error("screen.captureExpired"))?;
        use_asset(asset)
    }

    fn prepare(
        &self,
        caller: &str,
        capture_id: &str,
        action: CaptureExportAction,
        now: Instant,
    ) -> Result<Value, PluginError> {
        self.with_capture(caller, capture_id, now, |asset| {
            let id = opaque_id()?;
            let value = json!({"leaseId": id, "maxBytes": MAX_CAPTURE_BYTES});
            asset.export = Some(ExportLease {
                id,
                action,
                expires_at: now + EXPORT_TTL,
            });
            Ok(value)
        })
    }

    fn redeem(
        &self,
        caller: &str,
        lease_id: &str,
        now: Instant,
    ) -> Result<ExportClaim, PluginError> {
        let mut views = self.assets.lock().map_err(|_| error("screen.state"))?;
        views.retain(|_, asset| asset.expires_at > now);
        let asset = views
            .get_mut(caller)
            .ok_or_else(|| error("screen.leaseExpired"))?;
        let lease = asset
            .export
            .take_if(|lease| lease.id == lease_id)
            .filter(|lease| lease.expires_at > now)
            .ok_or_else(|| error("screen.leaseExpired"))?;
        Ok(ExportClaim {
            capture_id: asset.id.clone(),
            action: lease.action,
            width: asset.width,
            height: asset.height,
        })
    }
}

pub(crate) fn dispatch(
    app: &AppHandle,
    caller: &str,
    request: &PluginRequest,
    method: PluginMethod,
) -> Result<Value, PluginError> {
    let state = app.state::<CaptureState>();
    match method {
        PluginMethod::ScreenCaptureDisplay(_) => capture_display(app, caller, request, &state),
        PluginMethod::ScreenReleaseCapture(input) => {
            let owner_window = window(app, caller)?;
            with_live_capability(app, caller, request, CAPABILITY, |sessions| {
                if state.clear_capture(caller, &input.capture_id)? {
                    owner_window
                        .set_always_on_top(false)
                        .map_err(|_| error("screen.pinFailed"))?;
                }
                sessions.finish(caller, request, Instant::now())?;
                Ok(Value::Null)
            })
        }
        PluginMethod::ScreenPrepareCaptureExport(input) => {
            with_live_capability(app, caller, request, CAPABILITY, |sessions| {
                let value =
                    state.prepare(caller, &input.capture_id, input.action, Instant::now())?;
                sessions.finish(caller, request, Instant::now())?;
                Ok(value)
            })
        }
        PluginMethod::ScreenSetCapturePinned(input) => {
            let owner_window = window(app, caller)?;
            with_live_capability(app, caller, request, CAPABILITY, |sessions| {
                if input.pinned {
                    state.with_capture(caller, &input.capture_id, Instant::now(), |_| Ok(()))?;
                }
                owner_window
                    .set_always_on_top(input.pinned)
                    .map_err(|_| error("screen.pinFailed"))?;
                sessions.finish(caller, request, Instant::now())?;
                Ok(Value::Null)
            })
        }
        _ => Err(error("request.invalid")),
    }
}

fn opaque_id() -> Result<String, PluginError> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| error("screen.entropy"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn window(app: &AppHandle, caller: &str) -> Result<WebviewWindow, PluginError> {
    app.get_webview_window(caller)
        .ok_or_else(|| error("session.revoked"))
}

fn capture_display(
    app: &AppHandle,
    caller: &str,
    request: &PluginRequest,
    state: &CaptureState,
) -> Result<Value, PluginError> {
    with_live_capability(app, caller, request, CAPABILITY, |_| Ok(()))?;
    let _permit = permit(&state.capturing)?;
    let owner_window = window(app, caller)?;
    if !owner_window.is_focused().unwrap_or(false) {
        return Err(error("screen.focusRequired"));
    }
    if !unsafe { CGPreflightScreenCaptureAccess() } {
        // Request from the foreground app in response to launching the capture.
        if !unsafe { CGRequestScreenCaptureAccess() } {
            return Err(error("screen.permission"));
        }
    }
    with_live_capability(app, caller, request, CAPABILITY, |_| Ok(()))?;
    let monitor = xcap::Monitor::all()
        .map_err(|_| error("screen.displayUnavailable"))?
        .into_iter()
        .find(|monitor| monitor.is_primary().unwrap_or(false))
        .ok_or_else(|| error("screen.displayUnavailable"))?;
    crate::services::surface_activity::hide_surface(&owner_window)
        .map_err(|_| error("screen.hideFailed"))?;
    let captured = (|| {
        // Give WindowServer time to remove the tool surface from the composited frame.
        std::thread::sleep(Duration::from_millis(180));
        with_live_capability(app, caller, request, CAPABILITY, |_| Ok(()))?;
        monitor
            .capture_image()
            .map_err(|_| error("screen.captureFailed"))
    })();
    // A timed-out capture still restores its originating window; a revoked session does not.
    let sessions = app.state::<WebSessions>();
    let still_open = sessions.0.lock().is_ok_and(|sessions| {
        sessions
            .get(&request.session_id, caller, request.generation)
            .is_ok()
    });
    if still_open {
        crate::services::surface_activity::show_surface(&owner_window)
            .map_err(|_| error("screen.showFailed"))?;
        let _ = owner_window.set_focus();
    }
    let image = captured?;
    let (width, height) = image.dimensions();
    validate_dimensions(width, height)?;
    let png = encode_png(&image)?;
    let id = opaque_id()?;
    let expires_at = Instant::now() + CAPTURE_TTL;
    let (owner_app, owner_label, expiration_id) = (app.clone(), caller.to_owned(), id.clone());
    let expiration_task = tauri::async_runtime::spawn(async move {
        tokio::time::sleep_until(tokio::time::Instant::from_std(expires_at)).await;
        if let Some(owner_window) = owner_app.get_webview_window(&owner_label) {
            owner_app
                .state::<CaptureState>()
                .clear_expired(&owner_window, &expiration_id);
        }
    });
    let capture = ViewCapture {
        id,
        width,
        height,
        png: Arc::from(png.into_boxed_slice()),
        expires_at,
        export: None,
        expiration_task: Some(expiration_task),
    };
    with_live_capability(app, caller, request, CAPABILITY, |sessions| {
        let result = state.publish(caller, capture, Instant::now())?;
        sessions.finish(caller, request, Instant::now())?;
        Ok(result)
    })
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), PluginError> {
    if width == 0
        || height == 0
        || width > MAX_AXIS
        || height > MAX_AXIS
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err(error("screen.captureSize"));
    }
    Ok(())
}

#[derive(Default)]
struct PngBuffer(Vec<u8>);

impl Write for PngBuffer {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > MAX_CAPTURE_BYTES.saturating_sub(self.0.len()) {
            return Err(std::io::Error::other("PNG byte limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn encode_png(image: &RgbaImage) -> Result<Vec<u8>, PluginError> {
    let mut buffer = PngBuffer::default();
    image::codecs::png::PngEncoder::new(&mut buffer)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|_| error("screen.pngEncode"))?;
    Ok(buffer.0)
}

fn decode_export(bytes: &[u8], claim: &ExportClaim) -> Result<RgbaImage, PluginError> {
    if bytes.len() > MAX_CAPTURE_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(error("screen.invalidPng"));
    }
    let reader = ImageReader::with_format(Cursor::new(bytes), ImageFormat::Png);
    let (width, height) = reader
        .into_dimensions()
        .map_err(|_| error("screen.invalidPng"))?;
    validate_dimensions(width, height)?;
    if width > claim.width || height > claim.height {
        return Err(error("screen.captureSize"));
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(claim.width.min(MAX_AXIS));
    limits.max_image_height = Some(claim.height.min(MAX_AXIS));
    limits.max_alloc = Some(MAX_PIXELS * 8);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), ImageFormat::Png);
    reader.limits(limits);
    reader
        .decode()
        .map(|image| image.into_rgba8())
        .map_err(|_| error("screen.invalidPng"))
}

pub(crate) fn upload(
    app: &AppHandle,
    caller: &str,
    request: &PluginRequest,
    lease_id: &str,
    bytes: Vec<u8>,
) -> Result<Value, PluginError> {
    let state = app.state::<CaptureState>();
    let _permit = permit(&state.exporting)?;
    let claim = with_live_capability(app, caller, request, CAPABILITY, |_| {
        state.redeem(caller, lease_id, Instant::now())
    })?;
    let image = decode_export(&bytes, &claim)?;
    drop(bytes);
    let ensure_capture =
        || state.with_capture(caller, &claim.capture_id, Instant::now(), |_| Ok(()));
    let authorize = || with_live_capability(app, caller, request, CAPABILITY, |_| ensure_capture());
    let cancelled = match claim.action {
        CaptureExportAction::Copy => {
            let image = tauri::image::Image::new(image.as_raw(), image.width(), image.height());
            with_live_capability(app, caller, request, CAPABILITY, |sessions| {
                ensure_capture()?;
                app.try_state::<tauri_plugin_clipboard_manager::Clipboard<Wry>>()
                    .ok_or_else(|| error("screen.clipboardUnavailable"))?
                    .write_image(&image)
                    .map_err(|_| error("screen.clipboardFailed"))?;
                sessions.finish(caller, request, Instant::now())
            })?;
            false
        }
        CaptureExportAction::Save => {
            let png = encode_png(&image)?;
            drop(image);
            let result = super::media_runtime::export_with(
                &png,
                "zero-snap.png",
                "image/png",
                |name, extension| {
                    authorize()?;
                    let owner_window = window(app, caller)?;
                    Ok(tauri::async_runtime::block_on(
                        rfd::AsyncFileDialog::new()
                            .set_parent(&owner_window)
                            .set_file_name(name)
                            .add_filter("PNG", &[extension])
                            .save_file(),
                    )
                    .map(|file| file.path().to_path_buf()))
                },
                authorize,
                |source, target| {
                    with_live_capability(app, caller, request, CAPABILITY, |sessions| {
                        ensure_capture()?;
                        atomic_replace_file(source, target)
                            .map_err(|_| error("screen.saveFailed"))?;
                        sessions.finish(caller, request, Instant::now())
                    })
                    .map_err(|error| std::io::Error::other(error.code))
                },
            )?;
            let cancelled = result["cancelled"].as_bool().unwrap_or(true);
            if cancelled {
                with_live_capability(app, caller, request, CAPABILITY, |sessions| {
                    sessions.finish(caller, request, Instant::now())
                })?;
            }
            cancelled
        }
    };
    Ok(json!({"cancelled": cancelled}))
}

pub(crate) fn serve_capture(
    app: &AppHandle,
    caller: &str,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let result = (|| {
        if request.method() != "GET" && request.method() != "HEAD" {
            return Err(405u16);
        }
        if request.uri().query().is_some() {
            return Err(400u16);
        }
        let session_id = request.uri().host().ok_or(403u16)?;
        let id = request
            .uri()
            .path()
            .strip_prefix(CAPTURE_PATH_PREFIX)
            .filter(|token| {
                token.len() == 64
                    && token
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
            .ok_or(400u16)?;
        let read = || read_capture(app, caller, session_id, id);
        let snapshot = read()?;
        let bytes = if request.method() == "HEAD" {
            Vec::new()
        } else {
            snapshot.to_vec()
        };
        read()?;
        Ok((bytes, snapshot.len()))
    })();
    match result {
        Ok((bytes, size)) => {
            let mut response = response(200, "image/png", bytes);
            if let Ok(value) = HeaderValue::from_str(&size.to_string()) {
                response.headers_mut().insert(header::CONTENT_LENGTH, value);
            }
            response
        }
        Err(status) => response(status, "text/plain", b"Capture unavailable".to_vec()),
    }
}

fn read_capture(
    app: &AppHandle,
    caller: &str,
    session_id: &str,
    capture_id: &str,
) -> Result<Arc<[u8]>, u16> {
    app.state::<PluginRegistryState>()
        .read_registry(|registry| {
            let state = app.state::<WebSessions>();
            let sessions = state.0.lock().map_err(|_| 503u16)?;
            let now = Instant::now();
            let owner = sessions
                .asset_owner(session_id, caller, now)
                .map_err(|_| 403u16)?;
            if sessions
                .background_main(session_id, caller, now)
                .map_err(|_| 403u16)?
                .is_some()
            {
                return Err(403u16);
            }
            let live = owner_from_registry(registry, &owner.plugin_id, &owner.view_id)
                .map_err(|_| 403u16)?;
            if owner.digest != live.digest
                || owner.root != live.root
                || owner.version != live.version
                || !owner
                    .permissions
                    .iter()
                    .any(|permission| permission == CAPABILITY)
                || !live
                    .permissions
                    .iter()
                    .any(|permission| permission == CAPABILITY)
            {
                return Err(403u16);
            }
            app.state::<CaptureState>()
                .with_capture(caller, capture_id, now, |asset| Ok(Arc::clone(&asset.png)))
                .map_err(|_| 403u16)
        })
        .map_err(|_| 503u16)?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synthetic(id: &str, now: Instant) -> ViewCapture {
        ViewCapture {
            id: id.into(),
            width: 4,
            height: 3,
            png: Arc::from(encode_png(&RgbaImage::new(4, 3)).unwrap()),
            expires_at: now + CAPTURE_TTL,
            export: None,
            expiration_task: None,
        }
    }

    #[test]
    fn capture_tokens_and_single_use_export_leases_belong_to_one_open_view() {
        let state = CaptureState::default();
        let now = Instant::now();
        state.publish("main", synthetic("first", now), now).unwrap();
        assert!(state
            .with_capture("other", "first", now, |_| Ok(()))
            .is_err());
        let lease = state
            .prepare("main", "first", CaptureExportAction::Copy, now)
            .unwrap();
        let id = lease["leaseId"].as_str().unwrap();
        assert!(state.redeem("other", id, now).is_err());
        assert_eq!(state.redeem("main", id, now).unwrap().capture_id, "first");
        assert!(state.redeem("main", id, now).is_err());

        let old = state
            .prepare("main", "first", CaptureExportAction::Save, now)
            .unwrap();
        state
            .publish("main", synthetic("second", now), now)
            .unwrap();
        assert!(state
            .redeem("main", old["leaseId"].as_str().unwrap(), now)
            .is_err());
        state.close_window("main");
        assert!(state
            .with_capture("main", "second", now, |_| Ok(()))
            .is_err());
    }

    #[test]
    fn ttl_and_png_dimensions_bound_retained_capture_and_output() {
        let state = CaptureState::default();
        let now = Instant::now();
        let capture = synthetic("first", now);
        let original = Arc::clone(&capture.png);
        state.publish("main", capture, now).unwrap();
        let lease = state
            .prepare("main", "first", CaptureExportAction::Save, now)
            .unwrap();
        assert!(state
            .redeem("main", lease["leaseId"].as_str().unwrap(), now + EXPORT_TTL)
            .is_err());
        assert!(state
            .with_capture("main", "first", now + CAPTURE_TTL, |_| Ok(()))
            .is_err());
        assert!(state.assets.lock().unwrap().is_empty());

        let claim = ExportClaim {
            capture_id: "first".into(),
            action: CaptureExportAction::Save,
            width: 4,
            height: 3,
        };
        assert_eq!(
            decode_export(&original, &claim).unwrap().dimensions(),
            (4, 3)
        );
        assert!(decode_export(b"not png", &claim).is_err());
        let too_wide = encode_png(&RgbaImage::new(5, 3)).unwrap();
        assert!(decode_export(&too_wide, &claim).is_err());
    }
}
