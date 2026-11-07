use std::path::Path;
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};
use std::time::Duration;

#[derive(Default)]
pub struct NativePrintLease(AtomicU8);
impl NativePrintLease {
    pub fn start(&self) -> Result<(), String> {
        self.0
            .compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| ())
            .map_err(|_| "A native export has already been started for this engine run.".into())
    }
    pub fn is_active(&self) -> bool {
        self.0.load(Ordering::Acquire) == 1
    }
    pub fn finish(&self) -> Result<(), String> {
        self.0
            .compare_exchange(1, 2, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| ())
            .map_err(|_| "The native export authority has been revoked.".into())
    }
    pub fn revoke(&self) {
        self.0.store(3, Ordering::Release);
    }
    pub fn is_finished(&self) -> bool {
        self.0.load(Ordering::Acquire) == 2
    }
}

const MAX_CAPTURED_PAGE_BYTES: usize = 32 * 1024 * 1024;
const MAX_CAPTURED_DOCUMENT_BYTES: usize = 128 * 1024 * 1024;

struct CapturedDocument {
    pages: Vec<Option<Vec<u8>>>,
    total_bytes: usize,
}

fn native_pdf_export_supported(
    supported_os: bool,
    supports_webkit_capture: bool,
    pdfkit_available: bool,
) -> bool {
    supported_os && supports_webkit_capture && pdfkit_available
}

impl CapturedDocument {
    fn new(page_count: usize) -> Result<Self, String> {
        if page_count == 0 || page_count > 512 {
            return Err("The rendered document page count is outside the approved limit.".into());
        }
        Ok(Self {
            pages: vec![None; page_count],
            total_bytes: 0,
        })
    }

    fn accept(&mut self, index: usize, bytes: Vec<u8>) -> Result<(), String> {
        self.accept_with_limits(
            index,
            bytes,
            MAX_CAPTURED_PAGE_BYTES,
            MAX_CAPTURED_DOCUMENT_BYTES,
        )
    }

    fn accept_with_limits(
        &mut self,
        index: usize,
        bytes: Vec<u8>,
        page_byte_limit: usize,
        document_byte_limit: usize,
    ) -> Result<(), String> {
        if index >= self.pages.len() || self.pages[index].is_some() {
            return Err("WebKit returned duplicate or out-of-range PDF page data.".into());
        }
        if bytes.len() < 8 || bytes.len() > page_byte_limit || !bytes.starts_with(b"%PDF-") {
            return Err("WebKit returned an invalid or oversized PDF page.".into());
        }
        self.total_bytes = self.total_bytes.saturating_add(bytes.len());
        if self.total_bytes > document_byte_limit {
            return Err("The captured PDF document exceeded the approved byte limit.".into());
        }
        self.pages[index] = Some(bytes);
        Ok(())
    }

    fn finish(self) -> Result<Vec<Vec<u8>>, String> {
        self.pages
            .into_iter()
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| "WebKit did not return every rendered PDF page.".to_string())
    }
}

#[cfg(target_os = "macos")]
#[link(name = "PDFKit", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
pub fn native_pdf_export_available() -> bool {
    use objc::runtime::Class;
    use objc::{msg_send, sel, sel_impl};

    #[repr(C)]
    struct OperatingSystemVersion {
        major: isize,
        minor: isize,
        patch: isize,
    }

    let Some(process_info_class) = Class::get("NSProcessInfo") else {
        return false;
    };
    let Some(webview_class) = Class::get("WKWebView") else {
        return false;
    };
    let pdfkit_available = Class::get("PDFDocument").is_some();
    unsafe {
        let process_info: *mut objc::runtime::Object = msg_send![process_info_class, processInfo];
        let supported_os: bool = msg_send![process_info,
            isOperatingSystemAtLeastVersion: OperatingSystemVersion {
                major: 11,
                minor: 0,
                patch: 0,
            }
        ];
        let supports_capture: bool = msg_send![webview_class,
            instancesRespondToSelector: sel!(createPDFWithConfiguration:completionHandler:)
        ];
        native_pdf_export_supported(supported_os, supports_capture, pdfkit_available)
    }
}

#[cfg(not(target_os = "macos"))]
pub fn native_pdf_export_available() -> bool {
    false
}

#[cfg(target_os = "macos")]
pub fn print_engine_webview_to_pdf(
    app: &tauri::AppHandle,
    output_path: &Path,
    page_rects: &[super::engine_bridge::FileEnginePageRect],
    timeout: Duration,
    lease: Arc<NativePrintLease>,
) -> Result<(), String> {
    use std::sync::mpsc;
    use std::time::Instant;

    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSData, NSError};
    use objc2_web_kit::{WKPDFConfiguration, WKWebView};
    use tauri::Manager;

    let window = app
        .get_webview_window(super::engine_bridge::FILE_ENGINE_LABEL)
        .ok_or_else(|| "The Zero File engine WebView is unavailable.".to_string())?;
    if page_rects.is_empty() {
        return Err("The rendered document did not contain capturable pages.".into());
    }
    if !lease.is_active() {
        return Err("cancelled".into());
    }
    let deadline = Instant::now() + timeout;
    let mut pages = CapturedDocument::new(page_rects.len())?;
    for (index, rect) in page_rects.iter().cloned().enumerate() {
        if !lease.is_active() {
            return Err("cancelled".into());
        }
        let (sender, receiver) = mpsc::channel::<Result<Vec<u8>, String>>();
        let capture_lease = Arc::clone(&lease);
        window
            .with_webview(move |platform| {
                let Some(marker) = MainThreadMarker::new() else {
                    let _ = sender.send(Err("The PDF capture requires the UI thread.".into()));
                    return;
                };
                if !capture_lease.is_active() {
                    let _ = sender.send(Err("cancelled".into()));
                    return;
                }
                let webview: &WKWebView = unsafe { &*platform.inner().cast() };
                let configuration = unsafe { WKPDFConfiguration::new(marker) };
                unsafe {
                    configuration.setRect(CGRect::new(
                        CGPoint::new(rect.x, rect.y),
                        CGSize::new(rect.width, rect.height),
                    ));
                }
                let completed = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
                    let result = unsafe {
                        if !capture_lease.is_active() {
                            Err("cancelled".into())
                        } else if !error.is_null() {
                            Err("WebKit could not capture a PDF page.".into())
                        } else if data.is_null() {
                            Err("WebKit returned no PDF page.".into())
                        } else if (&*data).length() > MAX_CAPTURED_PAGE_BYTES {
                            Err("The captured page exceeded its byte limit.".into())
                        } else {
                            Ok((&*data).to_vec())
                        }
                    };
                    let _ = sender.send(result);
                });
                unsafe {
                    webview.createPDFWithConfiguration_completionHandler(
                        Some(&configuration),
                        &completed,
                    );
                }
            })
            .map_err(|_| "The WebKit PDF capture could not start.")?;
        loop {
            if !lease.is_active() {
                return Err("cancelled".into());
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                lease.revoke();
                return Err("timeout".into());
            }
            match receiver.recv_timeout(remaining.min(Duration::from_millis(50))) {
                Ok(result) => {
                    pages.accept(index, result?)?;
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => return Err("The WebKit PDF capture stopped.".into()),
            }
        }
    }
    let pages = pages.finish()?;
    if !lease.is_active() {
        return Err("cancelled".into());
    }
    merge_pdf_pages(&pages, output_path)?;
    if !lease.is_active() {
        let _ = std::fs::remove_file(output_path);
        return Err("cancelled".into());
    }
    validate_printed_pdf(output_path)
}

#[cfg(target_os = "macos")]
fn merge_pdf_pages(pages: &[Vec<u8>], output_path: &Path) -> Result<(), String> {
    use std::ffi::CString;

    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    let path = CString::new(output_path.to_string_lossy().as_bytes())
        .map_err(|_| "The native PDF output path is invalid.".to_string())?;
    unsafe {
        let pdf_document = Class::get("PDFDocument").ok_or("PDFKit is unavailable.")?;
        let ns_data = Class::get("NSData").ok_or("NSData is unavailable.")?;
        let ns_string = Class::get("NSString").ok_or("NSString is unavailable.")?;
        let ns_url = Class::get("NSURL").ok_or("NSURL is unavailable.")?;
        let merged: *mut Object = msg_send![pdf_document, new];
        if merged.is_null() {
            return Err("PDFKit could not create the output document.".into());
        }
        for (index, bytes) in pages.iter().enumerate() {
            let data: *mut Object = msg_send![ns_data,
                dataWithBytes: bytes.as_ptr()
                length: bytes.len()
            ];
            let part_alloc: *mut Object = msg_send![pdf_document, alloc];
            let part: *mut Object = msg_send![part_alloc, initWithData: data];
            if part.is_null() {
                let _: () = msg_send![merged, release];
                return Err("PDFKit could not read a captured page.".into());
            }
            let page: *mut Object = msg_send![part, pageAtIndex: 0usize];
            if page.is_null() {
                let _: () = msg_send![part, release];
                let _: () = msg_send![merged, release];
                return Err("PDFKit found no page in a WebKit capture.".into());
            }
            let page_copy: *mut Object = msg_send![page, copy];
            let _: () = msg_send![merged, insertPage: page_copy atIndex: index];
            let _: () = msg_send![page_copy, release];
            let _: () = msg_send![part, release];
        }
        let path_string: *mut Object = msg_send![ns_string, stringWithUTF8String: path.as_ptr()];
        let output_url: *mut Object = msg_send![ns_url, fileURLWithPath: path_string];
        let written: bool = msg_send![merged, writeToURL: output_url];
        let _: () = msg_send![merged, release];
        if !written {
            return Err("PDFKit could not write the merged PDF document.".into());
        }
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn print_engine_webview_to_pdf(
    _app: &tauri::AppHandle,
    _output_path: &Path,
    _page_rects: &[super::engine_bridge::FileEnginePageRect],
    _timeout: Duration,
    _lease: Arc<NativePrintLease>,
) -> Result<(), String> {
    Err("The built-in DOCX-to-PDF adapter requires macOS 11 or newer.".into())
}

fn validate_printed_pdf(path: &Path) -> Result<(), String> {
    let size = std::fs::metadata(path)
        .map_err(|_| "The native PDF output is missing.")?
        .len();
    if size > MAX_CAPTURED_DOCUMENT_BYTES as u64 {
        return Err("The native PDF output exceeded its byte limit.".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "The native PDF output is missing.".to_string())?;
    if bytes.len() < 8
        || !bytes.starts_with(b"%PDF-")
        || !bytes.windows(5).any(|value| value == b"/Page")
    {
        return Err("The native PDF output is not a valid paginated PDF.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn native_print_lease_rejects_duplicate_start_and_late_completion() {
        let lease = NativePrintLease::default();
        lease.start().unwrap();
        assert!(lease.start().is_err());
        lease.revoke();
        assert!(!lease.is_active());
        assert!(lease.finish().is_err());
        assert!(!lease.is_finished());
    }

    fn pdf_bytes(size: usize) -> Vec<u8> {
        let mut bytes = b"%PDF-1.3\n/Page\n".to_vec();
        bytes.resize(size.max(bytes.len()), b'0');
        bytes
    }

    #[test]
    fn captured_pages_accept_out_of_order_results_and_restore_order() {
        let mut document = CapturedDocument::new(2).unwrap();
        document.accept(1, pdf_bytes(32)).unwrap();
        document.accept(0, pdf_bytes(24)).unwrap();
        let pages = document.finish().unwrap();
        assert_eq!(pages[0].len(), 24);
        assert_eq!(pages[1].len(), 32);
    }

    #[test]
    fn captured_pages_reject_invalid_counts_duplicates_indices_and_missing_results() {
        assert!(CapturedDocument::new(0).is_err());
        assert!(CapturedDocument::new(513).is_err());

        let mut duplicate = CapturedDocument::new(1).unwrap();
        duplicate.accept(0, pdf_bytes(24)).unwrap();
        assert!(duplicate.accept(0, pdf_bytes(24)).is_err());

        let mut out_of_range = CapturedDocument::new(1).unwrap();
        assert!(out_of_range.accept(1, pdf_bytes(24)).is_err());
        assert!(CapturedDocument::new(2).unwrap().finish().is_err());
    }

    #[test]
    fn captured_pages_reject_invalid_page_and_document_byte_bounds() {
        let mut invalid = CapturedDocument::new(1).unwrap();
        assert!(invalid.accept(0, b"not-pdf".to_vec()).is_err());

        let mut oversized_page = CapturedDocument::new(1).unwrap();
        assert!(oversized_page
            .accept_with_limits(0, pdf_bytes(33), 32, 128)
            .is_err());

        let mut oversized_document = CapturedDocument::new(5).unwrap();
        for index in 0..4 {
            oversized_document
                .accept_with_limits(index, pdf_bytes(32), 32, 128)
                .unwrap();
        }
        assert!(oversized_document
            .accept_with_limits(4, pdf_bytes(16), 32, 128)
            .is_err());
    }

    #[test]
    fn native_export_requires_supported_macos_webkit_capture_and_pdfkit() {
        assert!(native_pdf_export_supported(true, true, true));
        assert!(!native_pdf_export_supported(false, true, true));
        assert!(!native_pdf_export_supported(true, false, true));
        assert!(!native_pdf_export_supported(true, true, false));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pdfkit_merge_preserves_requested_page_count() {
        use std::ffi::CString;
        use std::time::{SystemTime, UNIX_EPOCH};

        use objc::runtime::{Class, Object};
        use objc::{msg_send, sel, sel_impl};

        let fixture =
            include_bytes!("../../../../tests/fixtures/fileConversion/large-structured.pdf");
        let output = std::env::temp_dir().join(format!(
            "zero-pdfkit-merge-{}.pdf",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        merge_pdf_pages(&[fixture.to_vec(), fixture.to_vec()], &output).unwrap();
        unsafe {
            let path = CString::new(output.to_string_lossy().as_bytes()).unwrap();
            let ns_string = Class::get("NSString").unwrap();
            let ns_url = Class::get("NSURL").unwrap();
            let path_string: *mut Object =
                msg_send![ns_string, stringWithUTF8String: path.as_ptr()];
            let url: *mut Object = msg_send![ns_url, fileURLWithPath: path_string];
            let pdf_document = Class::get("PDFDocument").unwrap();
            let document: *mut Object = msg_send![pdf_document, alloc];
            let document: *mut Object = msg_send![document, initWithURL: url];
            let page_count: usize = msg_send![document, pageCount];
            let _: () = msg_send![document, release];
            assert_eq!(page_count, 2);
        }
        fs::remove_file(output).unwrap();
    }
}

// Kept unavailable by capability gating until the Windows corpus is qualified on-device.
#[cfg(target_os = "windows")]
pub fn print_engine_webview_to_pdf(
    app: &tauri::AppHandle,
    output_path: &Path,
    page_rects: &[super::engine_bridge::FileEnginePageRect],
    timeout: Duration,
    lease: Arc<NativePrintLease>,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use std::sync::mpsc;
    use std::time::Instant;
    use tauri::Manager;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE,
            COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
        },
        PrintToPdfCompletedHandler,
    };
    use windows_core_webview::{Interface, PCWSTR};
    let first = page_rects.first().ok_or("unsupportedInput")?;
    if page_rects.iter().any(|page| {
        (page.width - first.width).abs() > 1.0 || (page.height - first.height).abs() > 1.0
    }) {
        return Err("unsupportedInput".into());
    }
    let (paper_width, paper_height) = (first.width / 96.0, first.height / 96.0);
    if !(1.0..=100.0).contains(&paper_width) || !(1.0..=100.0).contains(&paper_height) {
        return Err("unsupportedInput".into());
    }
    let mut random = [0u8; 16];
    getrandom::fill(&mut random)
        .map_err(|_| "The native export staging token could not be generated.")?;
    let name: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let staging = output_path.with_file_name(format!("native-{name}.pdf"));
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)
        .map_err(|_| "The private native PDF staging file could not be reserved.")?;
    let result = (|| {
        let window = app
            .get_webview_window(super::engine_bridge::FILE_ENGINE_LABEL)
            .ok_or("The File engine WebView is unavailable.")?;
        let path: Vec<u16> = staging.as_os_str().encode_wide().chain(Some(0)).collect();
        let callback_path = staging.clone();
        let callback_lease = Arc::clone(&lease);
        let (sender, receiver) = mpsc::channel::<Result<(), String>>();
        window
            .with_webview(move |platform| {
                if !callback_lease.is_active() {
                    let _ = sender.send(Err("cancelled".into()));
                    return;
                }
                let started = (|| -> windows_core_webview::Result<()> {
                    unsafe {
                        let webview = platform
                            .controller()
                            .CoreWebView2()?
                            .cast::<ICoreWebView2_7>()?;
                        let environment =
                            platform.environment().cast::<ICoreWebView2Environment6>()?;
                        let settings = environment.CreatePrintSettings()?;
                        settings.SetOrientation(if paper_width > paper_height {
                            COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
                        } else {
                            COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
                        })?;
                        settings.SetPageWidth(paper_width.min(paper_height))?;
                        settings.SetPageHeight(paper_width.max(paper_height))?;
                        settings.SetScaleFactor(1.0)?;
                        settings.SetMarginTop(0.0)?;
                        settings.SetMarginBottom(0.0)?;
                        settings.SetMarginLeft(0.0)?;
                        settings.SetMarginRight(0.0)?;
                        settings.SetShouldPrintBackgrounds(true)?;
                        settings.SetShouldPrintSelectionOnly(false)?;
                        settings.SetShouldPrintHeaderAndFooter(false)?;
                        let completed_sender = sender.clone();
                        let callback =
                            PrintToPdfCompletedHandler::create(Box::new(move |status, success| {
                                let result = if !callback_lease.is_active() {
                                    let _ = std::fs::remove_file(&callback_path);
                                    Err("cancelled".into())
                                } else if status.is_err() || !success {
                                    Err("WebView2 native PDF export failed.".into())
                                } else {
                                    Ok(())
                                };
                                let _ = completed_sender.send(result);
                                Ok(())
                            }));
                        webview.PrintToPdf(PCWSTR(path.as_ptr()), &settings, &callback)?;
                        Ok(())
                    }
                })();
                if started.is_err() {
                    let _ = sender.send(Err("engineUnavailable".into()));
                }
            })
            .map_err(|_| "The WebView2 PDF export could not be scheduled.")?;
        let deadline = Instant::now() + timeout;
        loop {
            if !lease.is_active() {
                return Err("cancelled".into());
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                lease.revoke();
                return Err("timeout".into());
            }
            match receiver.recv_timeout(remaining.min(Duration::from_millis(50))) {
                Ok(result) => {
                    result?;
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => return Err("The WebView2 native export callback was lost.".into()),
            }
        }
        if !lease.is_active() {
            return Err("cancelled".into());
        }
        validate_printed_pdf(&staging)?;
        // hard_link preserves an existing destination and stays inside this job's private directory.
        std::fs::hard_link(&staging, output_path).map_err(|_| {
            "The native staging result could not be published to its private job output."
        })?;
        if !lease.is_active() {
            let _ = std::fs::remove_file(output_path);
            return Err("cancelled".into());
        }
        Ok(())
    })();
    let _ = std::fs::remove_file(&staging);
    result
}

pub fn windows_print_prototype_enabled() -> bool {
    cfg!(all(target_os = "windows", debug_assertions))
        && std::env::var("ZERO_FILE_WINDOWS_PRINT_PROTOTYPE")
            .ok()
            .as_deref()
            == Some("1")
}
