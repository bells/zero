# Local development conversion timeout investigation

Date: 2026-11-04. The maintainer authorized local testing with a supplied PDF and stopped their Zero instance so an isolated reproduction could run. Only a neutral temporary copy and temporary output directory were used. No document body, OCR text, source filename/path, thumbnail or resulting private document is included in this repository evidence.

## Observed failure and cause

The existing safe diagnostics showed engine readiness completing in about 0.53s, followed by `execute.timeout` approximately 120s later. This was an execution deadline, not the engine's two-second readiness deadline. Switching the main tool page does not own/cancel the Rust conversion queue.

Native reproduction exposed a broken development dependency lifecycle:

1. Vite's default HTML entry discovery scanned the independent website's generated Emscripten/toolchain HTML. It encountered an unresolved `loader.mjs` import and skipped its dependency scan/prebundling.
2. Lazy runtime dependencies were consequently discovered after conversion or tool loading had already begun. The logs showed `new dependencies optimized: pdfjs-dist`, later `docx`, and later `lucide-react`, each followed by `optimized dependencies changed. reloading`.
3. A hidden engine's active JavaScript context can disappear on that full reload. Previously only window destruction invalidated native sessions, so a page reload could leave Rust waiting for a completion callback until the 120s deadline. Some reload timings instead caused an immediate dynamic-module import failure.

An independent hidden WKWebView synthetic-PDF probe reached packaging and failed when importing the lazily discovered DOCX writer. After dependency preparation, the same hidden probe completed a one-page editable DOCX in about 0.55s. This also showed that globally disabling background throttling was not needed for this reproduced failure; no such change was made.

## Fix

- Desktop dependency scan entries are explicitly `index.html`; independent website/toolchain HTML is excluded from this desktop workflow.
- Runtime libraries used by the application/lazy surfaces are explicitly prebundled, including the Tauri API subpaths, React runtimes, Lucide and semver subpaths. File's PDF.js/docx/docx-preview entries are included only for the profile that contains File. This changes dev optimization, not production eager-loading or package profiles.
- `PageLoadEvent::Started` on the isolated engine revokes active sessions and readiness through the existing failure path. A reloaded context now fails a running job promptly instead of leaving an orphaned wait. Cancellation/print-lease cleanup remains authoritative in Rust.
- Input read progress is reported at parsing 0/1 before/after the IPC read. The existing debug smoke output includes bounded stage/percent only, without file or OCR contents.

## Actual supplied-file outcome

The authorized input is 1,078,134 bytes, one page, zero PDF text items and eight image-paint operations. It also contains clipping operators. With the current conservative drawing/visibility classifier, it returns `unsupportedInput`; it has **not** been successfully converted by this fix. Supporting this class of clipped, image-backed scans remains separate conversion work. The output directory contained no partial final document.

With a new temporary Vite cache and a fresh native Zero instance, elapsed times were:

| Milestone | From process start |
| --- | ---: |
| Parsing 0 | 1.540s |
| Rust input read completed | 1.542s |
| Parsing 1 | 1.544s |
| Converter parsing 2 | 1.688s |
| Typed `unsupportedInput` terminal result | **2.127s** |

The cold dev-server run did not log late dependency discoveries or optimizer reloads. This verifies the execution path through the original problematic boundaries on the actual file while accurately preserving the current format-support limit. Picker/drop, a live main→Awake UI switch, editor operations and Windows acceptance were not exercised by the smoke path; the UI automation connection itself timed out.

## Regression checks

- `fileEngineDevDependencies.test.mjs`: first reproduced missing prebundling and missing reload revocation, then passed full/core profile configuration and callback-wiring checks.
- `pnpm test`: **465 passed, 0 failed**.
- `pnpm build`: passed, full profile, 99 plugin modules, 6,517,863 frontend bytes.
- Build graph check using `/tmp/zero-file-timeout-build-graph.json`: passed, existing budgets unchanged.
- Cargo fmt/check `--locked`: passed.
- `cargo test --locked services::file::engine_bridge -- --test-threads=1`: **14 passed**; other targets were filtered for this focused rerun. The preceding implementation checkpoint's full 451-test host regression remains separately recorded in [implementation.md](implementation.md).
- Strict OpenSpec validation and whitespace checks: passed.

The user's source was preserved. The native smoke instance terminated after its terminal result; the investigation's temporary developer server was also stopped. No package was signed/approved, no private fixture was added, and no unrelated task was archived or committed.


## Scan-support follow-up on 2026-11-05

The subsequently requested composite-scan support exposed a second timeout after long native OCR waits. A native result returned successfully after about 22 seconds while the hidden page did not continue until the document deadline failed. The File engine now disables inactive background scheduling on supported WebKit versions, in addition to the earlier dependency/reload fixes. A 40-second delayed-result fault test completed in 45.256 seconds. The supplied scan now has an editable DOCX path with a separate photo, simplified decoration and explicit reflow/OCR warnings. Current output, cold-run observations and validation boundaries are recorded in [composite scan verification](composite-scan-support.md).
