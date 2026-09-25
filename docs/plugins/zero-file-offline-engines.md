# Zero File offline engines

The signed first-party `zero.file` package is designed to install its conversion assets at the same time. Its built-in conversion implementations are local and do not require Python, LibreOffice, Microsoft Word, Chromium, an account, a cloud service, or a runtime download. Release approval remains pending as described below.

## Current checkout and source development

Verified on 2026-09-25 at source revision `3120f5d`: `src-tauri/file-engine-policy.json` has an empty `approvedEnginePackages` list, and candidate `1.0.0` has `approved: false` and no package digest. Bundled tool registration and successful asset preparation do not establish that an approved engine is installed.

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
| PDF to DOCX | PDF.js 6.2.108 plus `docx` 9.7.1 | macOS and Windows desktop WebViews | `editableReconstruction` for simple ordered text; otherwise `layoutPreserving` |
| DOCX to PDF | `docx-preview` 0.4.0, bounded `WKWebView.createPDF`, and PDFKit merge | macOS 11+ | `webRenderedPdf` |

`layoutPreserving` puts each rendered PDF page into a matching DOCX page. It preserves visible layout but its text is not editable and no OCR is claimed. `webRenderedPdf` is not a promise of exact proprietary Word pagination. LibreOffice and Microsoft Word remain optional compatibility providers; neither is required for the built-in path. Windows DOCX-to-PDF remains unavailable until a separately tested WebView2 exporter is approved.

## Installation, integrity, and repair

The host grants `document.convert` only to a package whose identity is exactly `zero.file`, whose archive digest is explicitly approved by the embedded release policy, whose Ed25519 manifest signature verifies with Zero's pinned release key, and whose declared engine files, sizes, media types, notices, and SHA-256 digests all match. The host rechecks policy approval and installed assets before issuing a job lease. A generic plugin cannot obtain this trust by copying manifest fields.

Install and update use a versioned staging directory and an atomic registry switch. A failed activation retains the prior version. Running jobs hold their engine version; update cleanup retains leased assets, and uninstall is rejected until active jobs finish. Integrity or startup failures appear as a Zero File repair/reinstall error rather than instructions to install an office suite.

The engine runs in the hidden `zero-file-engine` WebView. Its read-only custom protocol rejects traversal, encoded paths, symlinks, unsupported media types, other WebView callers, and inactive versions. Document bytes use Zero-owned staging plus bounded raw IPC; the engine never receives the final user destination. Rust owns input validation, queueing, cancellation, output validation, collision-safe commit, open, and reveal.

## Size and licenses

The current candidate contains about 4.78 MiB of prepared PDF assets (2.46 MiB total per-file gzip measurement) plus about 1.2 MiB of engine harness code. Release limits are 20 MiB compressed and 45 MiB installed.

- PDF.js 6.2.108 — Apache-2.0
- `docx` 9.7.1 — MIT
- `docx-preview` 0.4.0 — Apache-2.0
- WebKit and PDFKit — macOS system frameworks, not redistributed

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

The private key must come from the release secret store and must never be committed or written into generated metadata. Packaging refuses a missing key or a key that does not match the pinned public key. It builds an independent engine entrypoint, generates the signed manifest and per-file digests, includes notices, and emits `build/zero-file-1.0.0.zplugin` plus its reported SHA-256.

Keep `src-tauri/file-engine-policy.json` unapproved until the signed package passes the complete corpus, size/readiness/memory/cancellation measurements, clean-profile offline install, macOS packaged smoke, signing/notarization, rollback, repair, and platform gates. Record the final package digest and only the directions/platforms actually tested.
