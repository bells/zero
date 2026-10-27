## Context

The maintainer approved Q1–Q10 of the 2026-10-25 grilling interview, including implementation after this proposal. See proposal.md. The working directory was clean on main before planning. The maintainer later explicitly requested a scoped local commit; do not push. Existing active Snap/OCR/preferences deltas remain unarchived.

Snap's popup calls NSMenu directly at a cell-local origin, unlike other native menus. Global shortcuts have only fixed capture/Launch actions and a read-only UI. Non-Launch events currently fall through to capture, so OCR requires explicit dispatch. Capture prepares targets before pixels and creates a hidden WebView for each session. xcap 0.9.8 reads the entire window list repeatedly per property. Hidden image decoding and AppKit event scheduling are hypotheses requiring runtime measurement, not proven root causes.

## Goals / Non-Goals

**Goals:** transactional bindings, bounded privacy-safe measurements, input-independent reveal, and a Windows OCR-only local capture/provider implementation that reuses existing limits and result UI.

**Non-Goals:** configurable Launch, Windows normal-capture editor parity, cloud recognition, background screen caching, automatic clipboard overwrite, File release approval, cross-screen selection, spec archive/sync or publishing.

## Decisions

### 1. Shared shortcut authority

Rust owns a versioned Snap shortcut preference file under canonical app data, normalized accelerator parsing, registration and dispatch. Preserve Launch's reservation. Introduce `snapOcr` beside `snapCapture`; `null`/unassigned is distinct from disabled, conflict and unsupported. Register a replacement before retiring the old binding; persistence failure rolls registration back. Save only after successful validation/registration. When disabled, persist valid preferences without registering; enabling must report conflicts without crashing startup. Serialize updates and hold no mutex while waiting on the AppKit thread.

Use a symmetric camelCase `SetSnapShortcutInput { id, accelerator: string | null }` and typed error response. Snapshot both actions, and derive menus/main labels from them. Reuse existing global-shortcut plugin and keyboard events rather than adding a second registry. UI records a modifier+non-modifier combination, suppresses browser shortcuts while recording, allows cancel, and exposes clear/reset; asynchronous status lives in the shared hook/service. Launch stays read-only. Update relevant preferences navigation and same-plugin multiple-action handling.

### 2. Native menu placement

Retain NSMenu and grouped cell hit-testing, but anchor using the status-button/cell's real geometry and the screen's visible frame. Keep the menu top below the menu bar, clamp horizontally, and preserve menu keyboard handling/highlight cleanup. Do not apply overlay full-screen geometry to a popup or replace native menus with WebViews. On Windows preserve native system-tray placement.

### 3. Measure before optimizing capture

Record fixed stage names and duration/counts only: trigger, menu dismissal, display/targets, capture, PNG encoding/write, WebView creation, frontend media read/decode, reveal queue/execute and ready. Do not record titles, screen pixels, tokens, paths or OCR text. Capture current behavior before fixes using pnpm tauri dev and stationary-pointer/menu/shortcut/main comparisons where automation permissions permit. Keep unavailable native checks explicit.

Replace proven repeated macOS window-list reads with one CoreGraphics snapshot using existing bindings, preserving filtering/order/coordinate contracts. Validate hidden WKWebView scheduling separately before altering throttling. Keep reveal gated on a decoded frozen image and committed DOM. No early screen capture or reuse of previous pixels. Prewarm only if measured necessary; no assumed permanent resource increase. Timeouts remain bounded and failures restore a usable state.

#### Measured startup follow-up (2026-10-27/28)

The maintainer confirmed the slow path is `pnpm tauri dev`. Native tracing observed a 2858 ms shortcut-to-show sample: PNG write 1882 ms, native capture 337 ms, and WebView build-start to frontend initialization 438 ms. Optimize only the pixel/PNG dependency packages in the Cargo dev profile (`xcap`, `image`, `png`, `fdeflate`, `simd-adler32`, `crc32fast`); leave application code debuggable and release settings unchanged. Preserve the existing lossless adaptive PNG encoder: the synthetic alternative-filter experiment increased transfer size substantially.

Stop disposed frontend initialization after each IPC boundary so React StrictMode replay does not read/decode a second full screenshot. Keep StrictMode enabled. Because capture remains hidden until its image is ready, resolve its existing plugin surface loader before mounting React instead of committing a Suspense loading fallback and paying the retry throttle on every newly created WebView. Keep the diagnostic error boundary for failed imports; other surfaces keep their lazy loading. This adds no persistent hidden window, background capture, or stale-pixel cache.

For macOS menu actions, explicitly clear the grouped tray's retained menu on the main thread. The pinned Tauri/tray-icon/muda chain releases the menu and ends tracking without animation; each subsequent grouped click already creates its menu afresh. Keep the former 100 ms wait only when explicit teardown cannot complete. Measure the menu entry before dispatching the worker. Native visual acceptance must still check no menu pixels remain in the capture and consecutive menu opens work; source review is not compositor evidence. See [startup evidence](evidence/startup-performance-2026-10-28.md).

### 4. Windows OCR-only capture

Ordinary capture continues `ms-screenclip:`/SnippingTool. OCR uses a frozen single-display bitmap, native monitor bounds/DPI and a hidden-until-ready selection WebView. The clicked tray screen or current cursor screen determines the target. Use existing raw-media/session/one-use authority and revision/generation cleanup. Windows only exposes selection/recognize/cancel controls; it does not advertise unsupported annotations/copy-image/pin actions. Enter confirms OCR and Esc cancels. Media is the original frozen image and OCR receives only its validated crop. Negative origins and 1x/1.25x/1.5x/2x displays require Windows evidence.

### 5. Bundled CPU OCR provider

Keep Apple Vision on macOS. On Windows reuse `OcrState` admission, bytes/pixel limits, cancellation/deadline and result validation with a CPU native inference adapter and printed Chinese/English PaddleOCR-family models. First validate maintained native wrappers and model licensing before choosing the locked dependency. RapidOCR is a reference pipeline, not a Rust dependency; no Python installation is introduced. Windows.Media.Ocr's identity/language-pack prerequisites conflict with the approved self-contained experience; Tesseract is a comparison candidate if it meets small-text quality with a smaller measured footprint.

Ship required model/dictionary/runtime resources via Tauri resources with pinned source/version/license/digest records, deterministic build preparation and validation. No runtime downloads or arbitrary executable/model paths from WebViews. Package preparation must fail if required Windows resources are missing or invalid; a source stub must never advertise provider availability. Reuse initialized model sessions safely; no OCR model work on the native UI thread. Report final binary/resource size separately from model upstream size. Shared provider improvements must not silently approve or change File engine packaging.

Implementation selection: `paddle-ocr-rs =0.6.1` with `ort =2.0.0-rc.10`, CPU ONNX Runtime 1.22.0 and PP-OCRv4 model/dictionary assets. Download/copy defaults of the inference crates are disabled. Verified app-local Microsoft CRT dependencies are bundled beside ONNX Runtime; telemetry is explicitly disabled. Generated resources live under the build cache and use their own pinned manifest; the File engine allowlist/auditor is unchanged. Resource checks measured 29,454,481 bytes, independently of installer size. This is a builder decision within the approved self-contained CPU/model approach, not an assertion of Windows quality/device acceptance.

## Risks / Trade-offs

- [Windows cannot run on this macOS host] → cross-compile/source validation plus explicit pending Windows device/offline package acceptance; never mark those tasks complete from compilation.
- [Native inference dependency/model size] → compare supported native wrappers, pin dependencies and measured resources, retain attribution, keep provider behind platform/feature gates.
- [Shortcut register/persist failure] → serialized transaction with rollback tests; startup remains usable with a visible conflict state.
- [Menu tracking or hidden WebView timing] → measure stages and minimal controlled changes; stationary-pointer acceptance stays mandatory.

## Migration Plan

No custom Snap bindings existed. Missing preferences use Alt+A capture and null OCR. Existing Launch and unrelated preferences remain unchanged. Corrupt data has a safe diagnostic/default path. Plugin disable unregisters both Snap actions, cancels OCR/capture and releases owned resources. Rollback may ignore the new versioned binding file without deleting it. Evidence and task completion distinguish source, automated, native and packaged behavior.
