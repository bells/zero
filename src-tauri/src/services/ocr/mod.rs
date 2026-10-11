use serde::{Deserialize, Serialize};
use std::{
    io::Cursor,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;

#[cfg(target_os = "macos")]
mod macos;

pub const MAX_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_PIXELS: u64 = 24_000_000;
pub const MAX_EDGE: u32 = 8192;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrLine {
    pub text: String,
    pub bounds: OcrRect,
    pub confidence: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrPageResult {
    pub width: u32,
    pub height: u32,
    pub lines: Vec<OcrLine>,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrCapability {
    pub available: bool,
    pub languages: Vec<String>,
    pub reason: Option<String>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OcrError {
    UnsupportedPlatform,
    ProviderUnavailable,
    LanguageUnavailable,
    InvalidInput,
    ResourceLimit,
    Busy,
    Timeout,
    Cancelled,
    RecognitionFailed,
    Unauthorized,
}

pub struct OcrState {
    admission: Arc<Semaphore>,
    worker: Arc<Semaphore>,
}
impl Default for OcrState {
    fn default() -> Self {
        Self {
            admission: Arc::new(Semaphore::new(3)),
            worker: Arc::new(Semaphore::new(1)),
        }
    }
}
pub fn capability() -> OcrCapability {
    #[cfg(target_os = "macos")]
    {
        match macos::languages() {
            Ok(languages) => OcrCapability {
                available: !languages.is_empty(),
                languages,
                reason: None,
            },
            Err(_) => OcrCapability {
                available: false,
                languages: vec![],
                reason: Some("providerUnavailable".into()),
            },
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        OcrCapability {
            available: false,
            languages: vec![],
            reason: Some("unsupportedPlatform".into()),
        }
    }
}

pub fn validate_png(bytes: &[u8]) -> Result<(u32, u32), OcrError> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err(OcrError::ResourceLimit);
    }
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(OcrError::InvalidInput);
    }
    let (width, height) = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| OcrError::InvalidInput)?
        .into_dimensions()
        .map_err(|_| OcrError::InvalidInput)?;
    validate_dimensions(width, height)?;
    Ok((width, height))
}
pub fn validate_dimensions(width: u32, height: u32) -> Result<(), OcrError> {
    if width == 0 || height == 0 {
        return Err(OcrError::InvalidInput);
    }
    if width > MAX_EDGE || height > MAX_EDGE || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err(OcrError::ResourceLimit);
    }
    Ok(())
}
pub fn validate_result(result: &OcrPageResult) -> Result<(), OcrError> {
    validate_dimensions(result.width, result.height)?;
    if result.lines.len() > 10_000
        || result
            .lines
            .iter()
            .map(|line| line.text.len())
            .sum::<usize>()
            > 1024 * 1024
    {
        return Err(OcrError::ResourceLimit);
    }
    for line in &result.lines {
        let b = &line.bounds;
        if ![b.x, b.y, b.width, b.height, line.confidence]
            .iter()
            .all(|n| n.is_finite())
            || b.x < 0.0
            || b.y < 0.0
            || b.width <= 0.0
            || b.height <= 0.0
            || b.x + b.width > f64::from(result.width) + 0.01
            || b.y + b.height > f64::from(result.height) + 0.01
            || !(0.0..=1.0).contains(&line.confidence)
        {
            return Err(OcrError::RecognitionFailed);
        }
    }
    Ok(())
}
impl OcrState {
    pub async fn recognize(
        &self,
        bytes: Vec<u8>,
        languages: Vec<String>,
        cancel: Arc<AtomicBool>,
        parent_deadline: Instant,
    ) -> Result<OcrPageResult, OcrError> {
        self.recognize_with(
            bytes,
            languages,
            cancel,
            parent_deadline,
            |bytes, languages, dimensions| {
                #[cfg(target_os = "macos")]
                {
                    macos::recognize(bytes, languages, dimensions)
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = (bytes, languages, dimensions);
                    Err(OcrError::UnsupportedPlatform)
                }
            },
        )
        .await
    }
    async fn recognize_with<F>(
        &self,
        mut bytes: Vec<u8>,
        languages: Vec<String>,
        cancel: Arc<AtomicBool>,
        parent_deadline: Instant,
        provider: F,
    ) -> Result<OcrPageResult, OcrError>
    where
        F: FnOnce(&[u8], &[String], (u32, u32)) -> Result<OcrPageResult, OcrError> + Send + 'static,
    {
        let dimensions = validate_png(&bytes)?;
        let deadline = parent_deadline.min(Instant::now() + Duration::from_secs(30));
        let admission = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| OcrError::Busy)?;
        let mut acquisition = Box::pin(self.worker.clone().acquire_owned());
        let worker = loop {
            if cancel.load(Ordering::Acquire) {
                bytes.fill(0);
                return Err(OcrError::Cancelled);
            }
            if Instant::now() >= deadline {
                bytes.fill(0);
                return Err(OcrError::Timeout);
            }
            if let Ok(permit) =
                tokio::time::timeout(Duration::from_millis(25), &mut acquisition).await
            {
                break permit.map_err(|_| OcrError::ProviderUnavailable)?;
            }
        };
        if cancel.load(Ordering::Acquire) || Instant::now() >= deadline {
            bytes.fill(0);
            return Err(if cancel.load(Ordering::Acquire) {
                OcrError::Cancelled
            } else {
                OcrError::Timeout
            });
        }
        // Permits live inside native work: timing out the future cannot release capacity early.
        let mut work = tauri::async_runtime::spawn_blocking(move || {
            let (_admission, _worker) = (admission, worker);
            let result = provider(&bytes, &languages, dimensions);
            bytes.fill(0);
            result
        });
        loop {
            if cancel.load(Ordering::Acquire) {
                return Err(OcrError::Cancelled);
            }
            if Instant::now() >= deadline {
                cancel.store(true, Ordering::Release);
                return Err(OcrError::Timeout);
            }
            if let Ok(result) = tokio::time::timeout(Duration::from_millis(25), &mut work).await {
                if Instant::now() >= deadline {
                    cancel.store(true, Ordering::Release);
                    return Err(OcrError::Timeout);
                }
                let result = result.map_err(|_| OcrError::RecognitionFailed)??;
                if cancel.load(Ordering::Acquire) {
                    return Err(OcrError::Cancelled);
                }
                validate_result(&result)?;
                return Ok(result);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_precede_decode() {
        assert_eq!(validate_dimensions(8193, 1), Err(OcrError::ResourceLimit));
        assert_eq!(
            validate_dimensions(6000, 6000),
            Err(OcrError::ResourceLimit)
        );
        assert_eq!(validate_png(b"not png"), Err(OcrError::InvalidInput));
    }
    #[test]
    fn result_geometry_is_bounded() {
        let mut result = OcrPageResult {
            width: 100,
            height: 100,
            warnings: vec![],
            lines: vec![OcrLine {
                text: "private canary".into(),
                bounds: OcrRect {
                    x: 0.0,
                    y: 0.0,
                    width: 100.0,
                    height: 20.0,
                },
                confidence: 0.9,
            }],
        };
        assert!(validate_result(&result).is_ok());
        result.lines[0].bounds.y = f64::NAN;
        assert_eq!(validate_result(&result), Err(OcrError::RecognitionFailed));
    }
    #[test]
    fn result_limits_and_serialization_match_consumers() {
        let mut result = OcrPageResult {
            width: 100,
            height: 100,
            warnings: vec!["lowConfidence".into()],
            lines: vec![OcrLine {
                text: "synthetic".into(),
                bounds: OcrRect {
                    x: 0.0,
                    y: 0.0,
                    width: 10.0,
                    height: 10.0,
                },
                confidence: 0.5,
            }],
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["lines"][0]["bounds"]["width"], 10.0);
        assert_eq!(json["lines"][0]["confidence"], 0.5);
        assert_eq!(json["warnings"][0], "lowConfidence");
        let capability = serde_json::to_value(OcrCapability {
            available: false,
            languages: vec![],
            reason: Some("unsupportedPlatform".into()),
        })
        .unwrap();
        assert_eq!(capability["available"], false);
        assert_eq!(capability["reason"], "unsupportedPlatform");
        assert_eq!(
            serde_json::to_value(OcrError::ResourceLimit).unwrap(),
            "resourceLimit"
        );
        result.lines[0].text = "x".repeat(1024 * 1024 + 1);
        assert_eq!(validate_result(&result), Err(OcrError::ResourceLimit));
        result.lines = vec![
            OcrLine {
                text: String::new(),
                bounds: OcrRect {
                    x: 0.0,
                    y: 0.0,
                    width: 1.0,
                    height: 1.0
                },
                confidence: 1.0
            };
            10_001
        ];
        assert_eq!(validate_result(&result), Err(OcrError::ResourceLimit));
    }
}

#[cfg(test)]
mod scheduling_tests {
    use super::*;
    fn bytes() -> Vec<u8> {
        include_bytes!("../../../../tests/fixtures/ocr/blank.png").to_vec()
    }
    fn empty(dimensions: (u32, u32)) -> OcrPageResult {
        OcrPageResult {
            width: dimensions.0,
            height: dimensions.1,
            lines: vec![],
            warnings: vec![],
        }
    }
    #[test]
    fn timeout_keeps_native_slot_and_queue_is_bounded() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        runtime.block_on(async {
            let state = Arc::new(OcrState::default());
            let first = state.clone();
            let work = tokio::spawn(async move {
                first
                    .recognize_with(
                        bytes(),
                        vec![],
                        Arc::new(AtomicBool::new(false)),
                        Instant::now() + Duration::from_millis(40),
                        |_, _, dimensions| {
                            std::thread::sleep(Duration::from_millis(250));
                            Ok(empty(dimensions))
                        },
                    )
                    .await
            });
            while state.worker.available_permits() != 0 {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
            let result = work.await.unwrap();
            assert!(matches!(result, Err(OcrError::Timeout)));
            assert_eq!(state.worker.available_permits(), 0);
            let second = state.clone();
            let third = state.clone();
            let queued = tokio::spawn(async move {
                second
                    .recognize_with(
                        bytes(),
                        vec![],
                        Arc::new(AtomicBool::new(false)),
                        Instant::now() + Duration::from_millis(60),
                        |_, _, d| Ok(empty(d)),
                    )
                    .await
            });
            let queued2 = tokio::spawn(async move {
                third
                    .recognize_with(
                        bytes(),
                        vec![],
                        Arc::new(AtomicBool::new(false)),
                        Instant::now() + Duration::from_millis(60),
                        |_, _, d| Ok(empty(d)),
                    )
                    .await
            });
            while state.admission.available_permits() != 0 {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
            assert!(matches!(
                state
                    .recognize_with(
                        bytes(),
                        vec![],
                        Arc::new(AtomicBool::new(false)),
                        Instant::now() + Duration::from_secs(1),
                        |_, _, d| Ok(empty(d))
                    )
                    .await,
                Err(OcrError::Busy)
            ));
            assert!(matches!(queued.await.unwrap(), Err(OcrError::Timeout)));
            assert!(matches!(queued2.await.unwrap(), Err(OcrError::Timeout)));
            while state.worker.available_permits() != 1 {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            assert_eq!(state.admission.available_permits(), 3);
        });
    }
    #[test]
    fn cancelled_or_expired_request_never_enters_provider() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        runtime.block_on(async {
            let state=OcrState::default();
            for (cancel,deadline,expected) in [(true,Instant::now()+Duration::from_secs(1),OcrError::Cancelled),(false,Instant::now()-Duration::from_secs(1),OcrError::Timeout)] {
                assert!(matches!(state.recognize_with(bytes(),vec![],Arc::new(AtomicBool::new(cancel)),deadline,|_,_,_|panic!("provider must not run")).await,Err(error) if error==expected));
            }
            assert_eq!(state.admission.available_permits(),3);
        });
    }
}
