# Implementation and verification — 2026-10-11

## Technical decisions and sources

This change keeps Rust's authoritative queue/files/leases and the isolated File WebView. The host passes a frontend-only tray/main surface through the lazy panel boundary. Bundled status-bar entries require an explicit contribution; installed extensions retain the generic compatibility entry. File navigation/search remain available.

Reviewed the pinned dependencies, installed typings/source and these upstream references on 2026-10-11:

- [PDF.js](https://github.com/mozilla/pdf.js), [API](https://mozilla.github.io/pdf.js/api/draft/api.js.html): `getTextContent`, `getOperatorList`, page cleanup, image objects, password and loading-task destruction. Retain 6.2.108, Apache-2.0. Use its same-version legacy worker to supply maintained compatibility polyfills; prepared assets grew by 50,054 bytes installed and 15,652 bytes gzip.
- [docx](https://github.com/dolanmiu/docx): use the installed 9.7.1 typed `Document`, `Paragraph`, `TextRun`, `ImageRun` and `Packer` APIs, MIT. A remote TextRun documentation request failed; installed typings/source and real output tests provide the implementation evidence.
- `quick-xml` 0.39.2 was already resolved transitively in Cargo.lock; it is now a pinned direct dependency for bounded, namespace-aware OOXML parsing. Rust's check is a minimum visible-body-text gate, not a complete Word style/layout validator or proof of source text coverage.
- WPS references and product/version distinctions are recorded in [design.md](design.md). Its public extraction/OCR/structure/re-layout architecture informs this work, but proprietary algorithms are not available to integrate and equivalent accuracy is not claimed.

The editable model reconstructs reliable lines, paragraphs and columns, restores English spacing/CJK joins, retains page sections and places supported individual figures after text. Tables/graphics may be simplified and produce warnings. Raster-only/mixed scan pages fail `ocrRequired`; empty documents, broken mapping, overlapping or rotated text/page metadata fail `unsupportedInput`. No whole-page image fallback remains. Unsupported image masks/repeat operations fail explicitly. Cancellation, deadlines and packaging errors propagate without committing output.

Version 1.1.0 is aligned across frontend, native host, plugin metadata, preparation/packaging and policy. Old engines are unavailable/rejected; old stored `layoutPreserving` results remain displayable. Candidate approval, archive digest and device/release evidence flags remain unchanged and unapproved.

Final review moved the old-version check before registry lease acquisition, preventing rejected engines from retaining a lease. The complete Rust suite and check were rerun after this adjustment. Native conversion/editor evidence was collected before this isolated rejection-path adjustment; the compatible-engine conversion path did not change.

## Automated results

Node 24.20.0 / pnpm 10.33.0, local macOS:

| Gate | Result / local evidence |
| --- | --- |
| `pnpm test` | 356 passed, 0 failed; `/tmp/zero-file-tests-final.log` |
| Real PDF parser → real DOCX writer | 11 success/error cases plus injected packaging failure, cancellation, expired deadline and password; `/tmp/zero-file-pdf-corpus-final.log` |
| Corpus validator | 18 fixture hashes/structural expectations passed; original PDF/DOCX bytes unchanged, eight generated editable PDF additions |
| DOCX result assertions | All visible text characters compared against independently extracted synthetic source text; ordered anchors, page sections, image relationships, warnings and no hidden runs checked |
| `pnpm build` / debug bundle build | Passed; `/tmp/zero-file-build.log`, `/tmp/zero-file-debug-bundle.log`; existing large-chunk advisory remains |
| `cargo fmt … --check` / `cargo check … --locked` | Passed; `/tmp/zero-file-cargo-final.log` |
| `cargo test … --locked -- --test-threads=1` | 352 passed, 2 existing ignored across unit/integration suites; `/tmp/zero-file-rust-final.log` |
| Build graph budget | Passed; `/tmp/zero-file-build-graph.json`, no eager conversion import; new snapshot kept outside historical evidence |
| Packaging policy | Passed; 4,830,937 prepared installed bytes / 2,474,519 per-file gzip bytes, no approval granted |
| `openspec validate --all --strict` | 25 passed, 0 failed; `/tmp/zero-file-openspec.log` |
| `git diff --check` | Passed |

First full Rust run caught the new test's incorrect assumption that Windows fallback has five native cells, and two stale 1.0.0 version fixtures after the metadata bump. Those fixtures were corrected. The native private-pasteboard test failed inside the sandbox with system pasteboard unavailable; its targeted unsandboxed rerun and final full same-environment run passed. The first failure logs remain in `/tmp/zero-file-rust-all.log` and `/tmp/zero-file-rust-all-second.log`.

Node PDF.js emits a Node-build advisory and standard-font file-URL loading warnings in the test harness. It uses the real upstream parser, legacy worker handler and real `@napi-rs/canvas`; text and image output assertions pass. These harness results are distinct from the native WebView evidence below.

## Native macOS and editor evidence

`ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev` initially failed to bind localhost inside the sandbox. Its permitted rerun started, but the hidden source engine timed out waiting for readiness (`/tmp/zero-file-native-rerun.log`). This launch path remains unresolved; it was not relabeled as passing.

Built a local debug bundle using `/private/tmp/zero-file-smoke.config.json`, which retains the hidden tray and adds a visible 920×660 main window. Tracked startup/configuration and capabilities were not changed. Ran the bundle with the same debug-only fallback flag and the existing File smoke hook, using only a generated PDF. `WKWebView` completed real table-text/figure conversion; Rust validated and committed `/private/tmp/zero-file-native-bundle/editable-table-image-converted.docx` with `EditableReconstruction` (`/tmp/zero-file-native-bundle.log`). This is not a signed release package.

Observed through native desktop automation:

- Main File displays drag-or-choose copy and the editable/OCR explanation. Status-bar settings list Awake, Paper, Launch, Snap; File's normal navigation is available.
- Native picker cancel/Escape adds no task or error; chooser becomes available again. Tab focus plus Enter and Space open the picker. Canceling a busy native picker returns focus to the document root, requiring refocusing the chooser.
- Two generated PDFs were multi-selected from `/private/tmp/zero-file-intake-check`, added as queued jobs without auto-start, then explicitly started. Scan fails with the localized OCR message and commits no `a-scan-converted.docx`; following text/CJK PDF completes successfully.
- Leaving File for Awake and remounting File retains all three jobs and terminal states. This does not establish tray/main reopening or drag-listener lifecycle conformance.
- WPS Office for macOS 6.13.2 (build 8918) opens the native table/figure result. Replaced its first paragraph with `Edited`, saved, closed and reopened it. The saved OOXML contains the changed visible text; remaining text and the independent blue figure remain present. The English/CJK output opens with three pages as expected, including its intermediate blank-page section.
- WPS's own File→Open dialog could not open the same synthetic PDF path, reporting file not found. Therefore WPS conversion accuracy/OCR/structure comparison was not measured. Editing Zero's result in WPS is not evidence of WPS's conversion algorithm.

The initial Pages launch timed out; the visible Zero bundle and WPS path subsequently worked. The SystemUIServer automation target timed out, so actual menu-bar grouped icons, neighboring click targets, collapse and tray activation/blur were not accepted. Main drag/drop, delayed listener cleanup and tray DialogGuard focus behavior also remain device checks. Windows and exact signed candidate/offline install gates are unavailable and unchecked.

## Remaining acceptance and hygiene

Tasks 3.2, 3.3, 6.2, 6.3 and 6.4 remain unchecked where their complete acceptance exceeds the evidence above: tray surface/keyboard and drag lifecycle; cross-window picker/queue; full native menu/tray flow; complete editor/competitor comparison; Windows and exact signed package. Their implemented portions and partial native evidence are recorded here. No missing device check is counted as passed.

All conversion inputs were generated corpus documents or their temporary copies. No private user document was opened for conversion or modified. No document was uploaded for benchmarking. The debug app and test document tabs were closed; WPS was left running. Temporary generated outputs remain outside the repository for inspection. No `dist`, prepared engine assets, targets, caches or historical evidence are included in the change. The implementation phase performed no commit, push, spec sync, archive or approval. Current maintenance docs supersede old facsimile behavior; future spec sync must reconcile `add-file-plugin` and `bundle-zero-file-offline-engines` first, then apply this replacement.

## Local commit revalidation — 2026-10-11

On the user's explicit local commit request, reran `pnpm test` (356 passed), `pnpm build`, Rust fmt/check, the real PDF conversion corpus (11 cases plus packaging/cancel/deadline/password checks), all 18 fixture validations, packaging policy, build graph and strict OpenSpec validation (25 passed). Logs use `/tmp/zero-file-commit-*`; generated build/engine assets remain excluded.

The first two full serial Rust attempts hit the existing one-second subprocess-test deadline in `direct_runner_preserves_argument_boundaries_and_bounds_output`; logs remain in `/tmp/zero-file-commit-rust-tests.log` and `/tmp/zero-file-commit-rust-rerun.log`. The unchanged test passed in isolation, followed by a complete serial rerun with 352 passed and 2 existing ignored (`/tmp/zero-file-commit-rust-final.log`). No timeout or assertion was relaxed. Native/manual acceptance was not repeated for this commit; the five pending task checkboxes and the evidence limits above remain unchanged. This local commit does not authorize push, archive or engine approval.

The staged whitespace audit initially classified the blank PDF fixture as text and flagged PDF cross-reference padding. Scoped `.gitattributes` marks conversion corpus PDFs/DOCX files as binary to preserve their original bytes; no PDF whitespace or fixture hash was changed. The final staged whitespace audit passed.
