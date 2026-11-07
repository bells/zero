# Native print, font and quality implementation evidence

Date: 2026-11-04. This records source/contract verification. The maintainer explicitly reserved native/device verification ("先实现，后面我来验证"). No native UI, Windows device, installed WebView2 runtime, compatible editor or signed package was exercised in this work. Tasks 1.3, 4.1–4.3 and 6.1–6.4 retain their manual acceptance dependencies; their checkboxes are not a substitute for the evidence below.

## Source now present

- The isolated engine uses protocol 3 / candidate 1.3.0. Rust and TypeScript agree on `FilePageOcrInput` (run token, job/version, page dimensions and typed region id/bounds/page size), `FileFontInspection`, quality issue fields and optional native-print `qualityIssues`. OCR still requires an active authorized PDF→DOCX session, bounded crop geometry, same-page geometry consistency, one-use expiring leases, cumulative page pixel/document-byte budgets and the original run deadline.
- Font preflight bounds DOCX ZIP/XML expansion and family counts. It resolves theme references, gives a theme attribute precedence over an unused explicit family, strips PDF subset prefixes, and treats CSS generic aliases as inspection incomplete rather than a literal missing installed family. macOS uses CoreText exact family/full/PostScript-name comparison; Windows uses DirectWrite family lookup through the existing `windows` 0.52 binding. An embedded declaration is a candidate, not proof of availability; the renderer reports loaded faces after the font-ready barrier. Missing/unloaded embedded faces remain missing/incomplete. These checks do not establish full glyph coverage or an external provider's actual substitution.
- DOCX external non-hyperlink relationships, altChunk/subDoc/OLE/chart content are rejected by preflight rather than fetched or silently discarded. Image decode failure and resource/deadline failure stop rendering before printing. Font and image readiness are separate barriers.
- Each DOCX render gets its own child container. `docx-preview` has no abortable render operation, so cleanup detaches that container: an old render settling after cancellation cannot mutate the next job's root. Image decoding remains bounded to four workers.
- macOS measures unscaled CSS-pixel geometry, then applies its existing wrapper zoom and converts captured page rectangles to PDF points once (`72/96`). Windows keeps CSS pixels, zoom 1, explicit paper dimensions, zero native/browser margins, scale 1, backgrounds on and browser headers/footers off. Document headers/footers and notes remain owned by `docx-preview`. Windows mixed page geometry currently fails `unsupportedInput` before printing; there is no global Letter fallback or added merger dependency.
- Windows obtains the print interfaces and print settings on the WebView UI callback, starts `PrintToPdf` asynchronously, and writes only to a random reserved file in the private job directory. Bounded output validation precedes non-overwriting private publication; existing final-output validation/commit remains authoritative. A per-run lease rejects duplicate print starts and revoked/late completion. The UI callback also checks authority before starting; cancellation/timeout retires the engine instance and late callbacks remove their private staging output. Callback completion is polled off the UI thread with bounded waits.
- Quality reports aggregate stable codes, bounded page/section/font details, occurrence totals and truncation independently of body text. Unknown codes become a generic issue. TS and Rust both reject control characters/private path forms in font names. Legacy `warningKeys` remain projected. Known font/layout facts now accompany the native print measurement, so Rust can retain them when a print error tears down the engine before JavaScript can submit its failure. Native `unsupportedInput`/`invalidInput` remain typed and nonretryable; timeout/interface failures retain distinct codes.

## Current checks

| Check | Result | Boundary |
| --- | --- | --- |
| `pnpm exec tsc --noEmit` | Passed | TypeScript contracts/source only. |
| Isolated TypeScript compile plus `docxResources.test.mjs`, `qualityReport.test.mjs`, `nativePrintLayout.test.mjs` | 12 passed | Real layout/aggregation functions; DOM and docx-preview are controlled test doubles for async/resource cases. No WebView/PDF output claim. |
| `python3 openspec/changes/refine-file-conversion-quality/evidence/native-binding-probe.py --font-tests` | 16 passed, including the repeated `--locked` run | Includes current production contracts, fonts and quality modules. CoreText synthetic lookup ran on this host; it is not a document/device acceptance run. |
| `python3 openspec/changes/refine-file-conversion-quality/evidence/native-binding-probe.py` | Passed for `x86_64-pc-windows-msvc`, including `--locked` repeat | Compiles the actual production font/native-print modules with exact locked Windows/WebView2 dependencies and a compile-only Tauri scheduling shim. It proves COM/DirectWrite binding compatibility, not the full application target or runtime behavior. |
| `git diff --check` | Passed at this checkpoint | Root integration verification is recorded separately. |

The regression cases first reproduced cancelled-render contamination, false missing-font reports for generic aliases/overridden theme families, and the TS/Rust control-character mismatch. They passed after bounded fixes. New Rust bridge tests also cover print-error metadata retention/typed reasons and optional/legacy measurement metadata; the root full Cargo run is the authoritative host integration result.

The small probe is retained in [native-binding-probe.py](native-binding-probe.py). It creates an isolated temporary crate/target, pins direct versions to the repository lock and copies that lock before resolving the reduced probe. The Windows branch uses the actual adapter functions; only Tauri's window/scheduling surface is a compile-only shim. A standalone ZIP harness initially required an explicit flate2 backend because it lacks the application's feature unification; the probe enables the already locked backend instead of changing production dependencies. An earlier full Windows cross-build was reported blocked by missing AWS SDK build headers; it was not repeatedly attempted here and is not reported as a successful application cross-build.

## Ready prototype path for maintainer validation

macOS source fallback:

```sh
ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev
```

Windows PowerShell, from the repository with the normal development prerequisites and system WebView2 runtime available:

```powershell
$env:ZERO_FILE_ENGINE_DEV_ASSETS = "1"
$env:ZERO_FILE_WINDOWS_PRINT_PROTOTYPE = "1"
pnpm tauri dev
```

The second variable is honored **only in Windows debug builds**. With it absent, and in every release build, the unqualified Windows built-in DOCX→PDF provider remains unavailable. No policy digest/approval or signed package status is changed. Use the main File direction selector to choose the built-in Windows provider for the debug prototype; do not validate via an implicit Word/LibreOffice fallback.

Pending manual work remains [acceptance.md](../acceptance.md) N01/N02/N03/N04/N05 and D01–D04/F01–F04 as applicable: real hidden-window resource loading, A4/Letter searchable output and dimensions, long tables, document headers/footnotes/endnotes, explicit mixed-paper rejection, cold first start, malformed/image/font failures, cancel/timeout then next job, installed-runtime interface absence, existing-output preservation, language switching and compatible-editor glyph/readability inspection. Measure real PDF text/pages/visual clipping, WebView2 version and cancellation timings; source checks do not close these gates. Signed/offline artifacts and release budgets remain [R01](release-evidence.md).
