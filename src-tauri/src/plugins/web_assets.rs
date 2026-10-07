use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;

use tauri::http::{Request, Response};
use tauri::Manager;

use super::protocol::safe_path;
use super::session::Sessions;

pub const SCHEME: &str = "zero-plugin";
pub const CSP: &str = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src ipc: http://ipc.localhost; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const MAX_ASSET_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Default)]
pub struct WebSessions(pub Mutex<Sessions>);

pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .manage(WebSessions::default())
        .register_uri_scheme_protocol(SCHEME, |context, request| {
            let state = context.app_handle().state::<WebSessions>();
            serve(&state, context.webview_label(), &request)
        })
}

pub fn serve(state: &WebSessions, caller: &str, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let result = (|| {
        if request.method() != "GET" && request.method() != "HEAD" {
            return Err(405u16);
        }
        if request.uri().query().is_some() {
            return Err(400u16);
        }
        let id = request.uri().host().ok_or(403u16)?;
        let relative = request.uri().path().strip_prefix('/').ok_or(400u16)?;
        if !safe_path(relative) {
            return Err(400u16);
        }
        // Clone only the authorized path; do not hold the session mutex during I/O.
        let root = state
            .0
            .lock()
            .map_err(|_| 503u16)?
            .asset_owner(id, caller, Instant::now())
            .map_err(|_| 403u16)?
            .root
            .clone();
        let (bytes, media) = read_asset(&root, relative).map_err(|_| 404u16)?;
        // A concurrent revoke cannot deliver late assets to a new session.
        state
            .0
            .lock()
            .map_err(|_| 503u16)?
            .asset_owner(id, caller, Instant::now())
            .map_err(|_| 403u16)?;
        Ok((
            if request.method() == "HEAD" {
                Vec::new()
            } else {
                bytes
            },
            media,
        ))
    })();
    match result {
        Ok((bytes, media)) => response(200, media, bytes),
        Err(status) => response(status, "text/plain", b"Plugin asset unavailable".to_vec()),
    }
}

fn response(status: u16, media: &str, bytes: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", media)
        .header("Content-Security-Policy", CSP)
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .body(bytes)
        .expect("static response headers")
}

fn read_asset(root: &Path, relative: &str) -> Result<(Vec<u8>, &'static str), ()> {
    if !safe_path(relative) {
        return Err(());
    }
    let mut path = root.to_path_buf();
    if fs::symlink_metadata(&path)
        .map_err(|_| ())?
        .file_type()
        .is_symlink()
    {
        return Err(());
    }
    for segment in relative.split('/') {
        path.push(segment);
        if fs::symlink_metadata(&path)
            .map_err(|_| ())?
            .file_type()
            .is_symlink()
        {
            return Err(());
        }
    }
    let root = root.canonicalize().map_err(|_| ())?;
    let path = path.canonicalize().map_err(|_| ())?;
    if !path.starts_with(&root) {
        return Err(());
    }
    let media = match path.extension().and_then(|s| s.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        _ => return Err(()),
    };
    let file = fs::File::open(path).map_err(|_| ())?;
    let metadata = file.metadata().map_err(|_| ())?;
    if !metadata.is_file() || metadata.len() > MAX_ASSET_BYTES {
        return Err(());
    }
    let mut bytes = Vec::new();
    file.take(MAX_ASSET_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err(());
    }
    Ok((bytes, media))
}
