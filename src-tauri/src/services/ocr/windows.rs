use super::{OcrCapability, OcrError, OcrLine, OcrPageResult, OcrRect};
use paddle_ocr_rs::ocr_lite::OcrLite;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::Manager;

static ROOT: OnceLock<PathBuf> = OnceLock::new();
static ENGINE: OnceLock<Result<Mutex<OcrLite>, OcrError>> = OnceLock::new();

#[derive(Deserialize)]
struct Manifest {
    files: Vec<Asset>,
}
#[derive(Deserialize)]
struct Asset {
    path: String,
    bytes: u64,
    sha256: String,
}

pub(super) fn configure(app: &tauri::AppHandle) {
    let root = app
        .path()
        .resource_dir()
        .ok()
        .map(|p| p.join("windows-ocr"));
    #[cfg(debug_assertions)]
    let root = root.filter(|p| p.is_dir()).or_else(|| {
        Some(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../node_modules/.cache/zero-windows-ocr/resources"),
        )
    });
    if let Some(root) = root {
        let _ = ROOT.set(root);
    }
}

fn verified_root() -> Result<&'static Path, OcrError> {
    let root = ROOT.get().ok_or(OcrError::ProviderUnavailable)?;
    let manifest: Manifest = serde_json::from_str(include_str!("../../../ocr-assets.json"))
        .map_err(|_| OcrError::ProviderUnavailable)?;
    for asset in manifest.files {
        if asset.path.is_empty()
            || !asset
                .path
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
            || matches!(asset.path.as_str(), "." | "..")
            || asset.sha256.len() != 64
            || asset.bytes > 80 * 1024 * 1024
        {
            return Err(OcrError::ProviderUnavailable);
        }
        let path = root.join(&asset.path);
        let metadata = fs::symlink_metadata(&path).map_err(|_| OcrError::ProviderUnavailable)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() != asset.bytes
        {
            return Err(OcrError::ProviderUnavailable);
        }
        let mut file = fs::File::open(path).map_err(|_| OcrError::ProviderUnavailable)?;
        let mut digest = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let count = file
                .read(&mut buffer)
                .map_err(|_| OcrError::ProviderUnavailable)?;
            if count == 0 {
                break;
            }
            digest.update(&buffer[..count]);
        }
        if format!("{:x}", digest.finalize()) != asset.sha256 {
            return Err(OcrError::ProviderUnavailable);
        }
    }
    Ok(root)
}

fn preload_runtime(root: &Path) -> Result<(), OcrError> {
    use ::windows::{
        core::PCWSTR,
        Win32::System::LibraryLoader::{
            LoadLibraryExW, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32,
        },
    };
    use std::os::windows::ffi::OsStrExt;
    for name in [
        "vcruntime140.dll",
        "vcruntime140_1.dll",
        "msvcp140.dll",
        "msvcp140_1.dll",
        "onnxruntime.dll",
    ] {
        let path = root
            .join(name)
            .canonicalize()
            .map_err(|_| OcrError::ProviderUnavailable)?;
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        // Keep the verified runtime loaded for the process lifetime; dependencies
        // resolve only beside it or in System32, never the working directory.
        unsafe {
            LoadLibraryExW(
                PCWSTR(wide.as_ptr()),
                None,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32,
            )
        }
        .map_err(|_| OcrError::ProviderUnavailable)?;
    }
    Ok(())
}

fn engine() -> Result<&'static Mutex<OcrLite>, OcrError> {
    ENGINE
        .get_or_init(|| {
            let root = verified_root()?;
            preload_runtime(root)?;
            ort::init_from(root.join("onnxruntime.dll").to_string_lossy())
                .with_name("Zero local OCR")
                .with_telemetry(false)
                .commit()
                .map_err(|_| OcrError::ProviderUnavailable)?;
            let mut engine = OcrLite::new();
            let path = |name: &str| root.join(name).to_string_lossy().into_owned();
            engine
                .init_models_with_dict(
                    &path("ch_PP-OCRv4_det_infer.onnx"),
                    &path("ch_ppocr_mobile_v2.0_cls_infer.onnx"),
                    &path("ch_PP-OCRv4_rec_infer.onnx"),
                    &path("ppocr_keys_v1.txt"),
                    2,
                )
                .map_err(|_| OcrError::ProviderUnavailable)?;
            Ok(Mutex::new(engine))
        })
        .as_ref()
        .map_err(Clone::clone)
}

pub(super) fn capability() -> OcrCapability {
    match engine() {
        Ok(_) => OcrCapability {
            available: true,
            languages: vec!["zh-Hans".into(), "en-US".into()],
            reason: None,
        },
        Err(_) => OcrCapability {
            available: false,
            languages: vec![],
            reason: Some("providerUnavailable".into()),
        },
    }
}

pub(super) fn recognize(
    bytes: &[u8],
    languages: &[String],
    dimensions: (u32, u32),
) -> Result<OcrPageResult, OcrError> {
    if languages
        .iter()
        .any(|language| !matches!(language.as_str(), "zh-Hans" | "zh-CN" | "en" | "en-US"))
    {
        return Err(OcrError::LanguageUnavailable);
    }
    let image = image::load_from_memory(bytes)
        .map_err(|_| OcrError::InvalidInput)?
        .to_rgb8();
    let result = engine()?
        .lock()
        .map_err(|_| OcrError::ProviderUnavailable)?
        .detect(&image, 32, 2048, 0.5, 0.3, 1.6, true, false)
        .map_err(|_| OcrError::RecognitionFailed)?;
    let (width, height) = dimensions;
    let mut lines = Vec::with_capacity(result.text_blocks.len().min(10000));
    if result.text_blocks.len() > 10000 {
        return Err(OcrError::ResourceLimit);
    }
    for block in result.text_blocks {
        if block.text.trim().is_empty() {
            continue;
        }
        if !block.text_score.is_finite() || block.box_points.len() < 4 {
            return Err(OcrError::RecognitionFailed);
        }
        let x = block
            .box_points
            .iter()
            .map(|p| p.x.min(width))
            .min()
            .unwrap_or(0);
        let y = block
            .box_points
            .iter()
            .map(|p| p.y.min(height))
            .min()
            .unwrap_or(0);
        let right = block
            .box_points
            .iter()
            .map(|p| p.x.min(width))
            .max()
            .unwrap_or(0);
        let bottom = block
            .box_points
            .iter()
            .map(|p| p.y.min(height))
            .max()
            .unwrap_or(0);
        if right <= x || bottom <= y {
            continue;
        }
        lines.push(OcrLine {
            text: block.text,
            bounds: OcrRect {
                x: x.into(),
                y: y.into(),
                width: (right - x).into(),
                height: (bottom - y).into(),
            },
            confidence: f64::from(block.text_score.clamp(0.0, 1.0)),
        });
    }
    lines.sort_by(|a, b| {
        a.bounds
            .y
            .total_cmp(&b.bounds.y)
            .then(a.bounds.x.total_cmp(&b.bounds.x))
    });
    Ok(OcrPageResult {
        width,
        height,
        lines,
        warnings: vec![],
    })
}
