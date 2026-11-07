# Zero File offline engines

The signed first-party `zero.file` package is designed to install its conversion assets at the same time. Conversion runs locally through platform WebViews and native adapters, without Python, an office suite, an account or a cloud conversion service. File does not bundle a standalone Chromium browser or implicitly download a conversion runtime; the staged Windows adapter uses the installed system WebView2 runtime. Shared Windows OCR requires its separately prepared local model/DLL assets. Release approval remains pending as described below.

## Current checkout and source development

Current source candidate on 2026-11-04 is `1.3.0`, using host run protocol `3`: `src-tauri/file-engine-policy.json` has an empty `approvedEnginePackages` list, `approved: false` and no package digest. Bundled tool registration and successful asset preparation do not establish that an approved engine is installed.

For local source development on a supported platform:

```bash
pnpm install --frozen-lockfile
ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev
```

`predev` prepares the worker, fonts, CMaps, WASM, notices, and asset manifest. `development_assets_enabled()` in `engine_bridge.rs` requires both a debug build and the environment variable exactly equal to `1`. When acquiring an installed engine fails, this permits the app-owned source engine fallback. Release builds still require the approved installed package.

For the “内置 PDF 引擎未能加载；请修复或重新安装 Zero File 插件。” message, trace capability/provider diagnostics, installed package identity/version, policy and signature/digest checks, then hidden-WebView creation and readiness. Do not infer the failure stage from this generic message alone. Source startup without the development flag is a diagnostic lead, not proof of the cause of a previous user session. This review did not reproduce that session.

## Supported directions

| Direction | Built-in implementation | Platform boundary | Result profile |
| --- | --- | --- | --- |
| PDF to DOCX | PDF.js 6.2.108 plus `docx` 9.7.1 | macOS and Windows desktop WebViews; Windows device acceptance pending | `editableReconstruction` only |
| DOCX to PDF | `docx-preview` 0.4.0, bounded `WKWebView.createPDF`, and PDFKit merge | macOS 11+; Windows WebView2 adapter source is staged but qualification is false and capability remains unavailable | `webRenderedPdf` |

The `1.3.0` source models page content as ordered paragraph, table and figure blocks. It reconstructs editable English/CJK text, heading/alignment/indentation hints, reliable two-column reading order, and straight ruled grids with supported horizontal/vertical cell merges. The DOCX writer emits real table OOXML, keeps supported local images in content order, and retains blank page sections. These are bounded heuristics, not a general document-layout recognizer; ambiguous grids, overlapping content, unreliable reading order or unrecoverable required content must fail rather than silently omit content.

Local vector formulas/charts can be preserved as bounded raster crops with their labels and a non-editable-graphic warning; they are not editable OMML, chart objects or recovered data. Whole-page image fallback and hidden-text output remain prohibited. Borderless tables may be fully reflowed with a table-simplified warning only when content order remains recoverable. Supported page rotations use explicit coordinate mapping. Passing representative synthetic output checks does not establish every P-case, Word/LibreOffice editability, or native layout acceptance; see [quality input contracts](../../openspec/changes/refine-file-conversion-quality/evidence/fixture-contracts.md) and the change's implementation evidence.

Required scan content uses the shared host OCR provider, including bounded same-page regions alongside reliable digital text. The source masks reliable text, deduplicates recognized content, and preserves separately identified local figures; image-backed scans with a reliable text layer should not be re-OCRed. macOS uses Apple Vision. The shared Windows PaddleOCR adapter and File bridge also exist, subject to actual local model/DLL assets and runtime qualification; this change does not claim Windows recognition or installed offline acceptance was tested. Linux has no qualified provider. OCR readiness is separate from engine readiness; absent OCR or failed recognition of a required region fails the whole job with no partial final DOCX.

Image-only composite scans with supported rectangular clipping are recognized from the rendered visible page. Small independently placed color photos can be retained while OCR body remains editable. Residual glyphs receive bounded contextual recognition, and unresolved coverage fails the job. Thin rules and flat colored heading decoration may simplify during reflow. A one-page scan can therefore occupy multiple editable pages. The macOS follow-up and WPS reference comparison are recorded in [composite scan verification](../../openspec/changes/refine-file-conversion-quality/evidence/composite-scan-support.md).

For reliably separated local columns in composite scans, borderless layout containers now keep editable fields and a portrait alongside one another. This is layout recovery, not native scanned data-table recognition. CJK line advances help estimate body font size independently of OCR box padding; measured spacing and sampled heading colors improve the result without applying a Word theme's default blue. Source font identity remains unknown, so font-inspection and layout warnings remain. See [scan layout follow-up](../../openspec/changes/refine-file-conversion-quality/evidence/scan-layout-follow-up.md) for the actual one-page result and remaining fidelity limits.

OCR rasterization is sequential at up to 200 DPI, bounded by 24 million pixels and an 8192-pixel edge. PNG input remains limited to 32 MiB. Protocol 3 adds a run/page/version/region-bound one-use lease with explicit page geometry, a 16-region/page bound, cumulative pixel/upload limits, and the original document deadline. Recognition output remains bounded, and cancellation revokes submission; unfinished native work must retain its execution slot until safe teardown. Canvas/PNG resources are released per region/page. Source contracts and deterministic tests do not substitute for recognition quality or cancellation timing measured on a device.

Old `layoutPreserving` results remain readable; candidate `1.3.0` advertises `editableReconstruction` for PDF-to-DOCX and `webRenderedPdf` for DOCX-to-PDF. Older engine packages cannot present themselves as protocol 3. The browser-rendered PDF profile remains best effort. Fonts are inspected against bounded local platform probes, with missing/substituted/incomplete-inspection issues and up to 100 quality details/locations; an embedded-font declaration alone does not prove the route can use it. No missing font is downloaded automatically, and a font warning cannot excuse missing or unreadable required content.

## Explicit engine selection

The main File page offers an engine selection per direction; the tray shows a concise selection summary and configuration entry. Rust persists only the direction/provider preferences and revision, not document paths or queue contents. New preferences default to the built-in provider even if a compatibility application is installed or the built-in provider is unavailable. Users may explicitly select an installed LibreOffice or Microsoft Word adapter for DOCX-to-PDF; PDF-to-DOCX remains built-in.

Starting a batch freezes the selected provider for each included job, including jobs waiting behind the first. Later preference changes affect future batches. An unavailable selected provider reports its reason; the app does not silently run another engine. Ordinary retry keeps the job's provider, while an explicit change-engine retry validates and binds the new selection. Preference write errors and cross-window revisions are reported rather than pretending a failed save was remembered. Native main/tray, restart, permission/activation and external-provider flows remain separate acceptance checks.

The Windows printing adapter source uses WebView2 PrintToPdf with explicit paper size, zero browser margins, scale 1 and staging-only output. Runtime interface checks, resource readiness and generation-scoped callbacks are required. Its qualification flag remains false: **Windows built-in DOCX-to-PDF is unavailable pending N02/N03**. Mixed paper sizes currently reject explicitly in the Windows layout path; the source does not promise mixed-section printing or Word-equivalent pagination. The maintainer has reserved the native/device checks.

The File tray page offers native file selection; the main page additionally accepts drag/drop. Bundled tools require an explicit status-bar contribution, so File retains normal tool/search navigation without an undeclared native icon.

## Installation, integrity, and repair

The host grants `document.convert` only to a package whose identity is exactly `zero.file`, whose archive digest is explicitly approved by the embedded release policy, whose Ed25519 manifest signature verifies with Zero's pinned release key, and whose declared engine files, sizes, media types, notices, and SHA-256 digests all match. The host rechecks policy approval and installed assets before issuing a job lease. A generic plugin cannot obtain this trust by copying manifest fields.

Install and update use a versioned staging directory and an atomic registry switch. A failed activation retains the prior version. Running jobs hold their engine version; update cleanup retains leased assets, and uninstall is rejected until active jobs finish. Integrity or startup failures appear as a Zero File repair/reinstall error rather than instructions to install an office suite.

The engine runs in the hidden `zero-file-engine` WebView. Its read-only custom protocol rejects traversal, encoded paths, symlinks, unsupported media types, other WebView callers, and inactive versions. Document bytes use Zero-owned staging plus bounded raw IPC; the engine never receives the final user destination. Rust owns input validation, queueing, cancellation, output validation, collision-safe commit, open, and reveal.

## Size and licenses

The historical 1.2.0 prepared PDF assets measured 4,830,937 bytes installed and 2,474,519 bytes total per-file gzip; these are not fresh 1.3.0 or signed-package measurements. The same PDF.js version's legacy worker supplies upstream compatibility polyfills for older WebViews. Harness/package measurements remain release gates; the policy's harness estimate is not an exact signed-package measurement. Release limits are 20 MiB compressed and 45 MiB installed.

- PDF.js 6.2.108 — Apache-2.0
- `docx` 9.7.1 — MIT
- `docx-preview` 0.4.0 — Apache-2.0
- WebKit and PDFKit — macOS system frameworks, not redistributed
- Apple Vision — macOS system framework, not redistributed; text recognition requires the runtime class added in macOS 10.15, with languages probed from the current accurate request revision
- `objc2-vision` 0.3.2 — Zlib OR Apache-2.0 OR MIT; minimal features, host dependency rather than a File asset/runtime download
- CoreText/CoreFoundation and DirectWrite — system font APIs; no system fonts are redistributed
- `webview2-com` 0.38.2 — MIT; existing locked Windows host binding, not a bundled WebView2 runtime; `windows` 0.52.0 / 0.61.3 — MIT OR Apache-2.0 in their respective direct/COM paths
- Windows OCR reuses the shared host provider and its separately prepared/noticed model/DLL assets; this change adds no recognition model

The package includes the direct license texts and `THIRD_PARTY_NOTICES.md`. Python, PyMuPDF, OpenCV, LibreOffice, ONLYOFFICE, Chromium, and Office binaries are not redistributed.

## Maintainer release workflow

Prepare and test the reproducible assets:

```bash
pnpm file-engine:build
node scripts/verify-file-engine-packaging.mjs
pnpm test
pnpm build
```

Create the release package only in the protected release environment:

```bash
export ZERO_FILE_ENGINE_SIGNING_KEY='<base64 Ed25519 32-byte release seed>'
pnpm file-engine:package
```

The private key must come from the release secret store and must never be committed or written into generated metadata. Packaging refuses a missing key or a key that does not match the pinned public key. It builds an independent engine entrypoint, generates the signed manifest and per-file digests, includes notices, and emits `build/zero-file-1.3.0.zplugin` plus its reported SHA-256.

Keep `src-tauri/file-engine-policy.json` unapproved until the signed package passes the complete corpus, size/readiness/memory/cancellation measurements, clean-profile offline install, macOS packaged smoke, signing/notarization, rollback, repair, and platform gates. Record the final package digest and only the directions/platforms actually tested.

Historical 1.2.0 editable conversion decisions and validation are in `openspec/changes/refine-zero-file-editable-conversion/verification.md`; shared OCR evidence is in [the Snap/File OCR verification record](../../openspec/changes/enhance-snap-and-share-offline-ocr/evidence/verification.md). That earlier macOS debug smoke converted the synthetic mixed PDF through the native provider; TextEdit opened, edited, saved and reopened a copy with Chinese/English text intact. TextEdit collapsed the four original sections into one, so this proves text editability, not layout fidelity. Word/LibreOffice, Windows and signed-package acceptance remain unverified. The earlier `add-file-plugin` and `bundle-zero-file-offline-engines` artifacts retain historical facsimile/fallback requirements; a future explicitly requested spec sync must reconcile those requirements in dependency order before applying editable conversion and this conditional scan extension. This change does not archive, sync or approve an engine.


For this refinement, [R01 inventory](../../openspec/changes/refine-file-conversion-quality/evidence/release-evidence.md) separates source checks from the still-pending exact signed digest, offline install, size/RSS/ready/cancellation, Windows runtime, rollback and repair evidence. No fixture, protocol bump or source check approves the package or completes N01–N05/R01.

The current automated results, actual local-graphic media and remaining manual gates are in [the implementation record](../../openspec/changes/refine-file-conversion-quality/evidence/implementation.md). Windows debug-only prototype instructions are in [the native record](../../openspec/changes/refine-file-conversion-quality/evidence/native-implementation.md); release capability remains unqualified.
