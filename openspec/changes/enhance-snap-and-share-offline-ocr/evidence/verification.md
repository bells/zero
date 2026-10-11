# Snap / shared offline OCR verification — 2026-10-11

## Scope and implementation

This is an implementation and validation record for `enhance-snap-and-share-offline-ocr`, on macOS 26.6.2 arm64, Node 24.20.0, pnpm 10.33.0 and Cargo 1.95.0. The apply baseline is in [baseline.md](baseline.md). No commit, push, spec sync, archive, release or engine approval was performed. Historical evidence and task lists in other changes were not changed.

- Snap uses the host's native menu mechanism for left/right clicks, with Screenshot, capability-gated Screenshot OCR, registered screenshot accelerator, separator and the existing application quit action. Typed dispatch rejects peer-tool actions. The retired `snap-menu` route/CSS/capability/service has been removed; its compatibility command fails closed.
- Capture starts share one flight; active editing is reused without changing intent/display. The fixed label is destroyed and its registry removal awaited on a background thread before rebuilding. Destruction/reveal callbacks are generation-scoped. A single host maintenance loop expires capture/OCR state and File leases.
- The selected xcap monitor, frozen image, native full-screen frame and window candidates use one `CaptureDisplaySnapshot`. AppKit conversion uses global logical coordinates; Tauri physical bounds are read from the actual window. This is a source/model correction, not proof that all reported dual-screen problems are fixed.
- Selection interior drag uses absolute source-pixel delta with clamping, preserves dimensions/radius and annotation source coordinates/history, and adds grab/grabbing, draft and rollback behavior.
- Shared host OCR accepts bounded owned PNGs, probes macOS Vision accurate languages, returns top-left pixel bounds/confidence, and has one native worker plus two FIFO waiting admissions. Windows/Linux expose unavailable capability. Thin commands delegate to separate Snap and File adapters; no arbitrary-path OCR command was added.
- Snap crops the original frozen pixels, not annotations, tears down capture and presents one short-lived main-window result for editing/cancel/clear/explicit copy. Async read/copy revisions reject old updates, and cancel/clear failures have typed feedback.
- File protocol 2 / candidate 1.2.0 issues one-use run/page/version/deadline-scoped upload leases. Reliable text pages retain direct extraction; nonempty pages without text use host OCR; ordinary/image-backed blank pages retain sections. OCR text enters the existing reading-order/paragraph/DOCX writer. Critical page failure yields no final partial DOCX.

## Dependency and limits

`objc2-vision = 0.3.2` is locked, with only std, request/handler/recognize-text/observation/types and the required CoreFoundation/CoreGraphics/ImageIO features. It uses the existing objc2 0.6.4 / framework 0.3.2 family. Upstream crate metadata declares `Zlib OR Apache-2.0 OR MIT` and Rust 1.71. Vision is a system framework, with no bundled OCR model or runtime download. Text recognition was introduced in macOS 10.15; the runtime class is checked before constructing a request. The application's existing deployment configuration was not raised. Only this macOS runtime was tested; its real probe/recognition test verified `en-US` and `zh-Hans`. Recognition uses the current default request revision rather than forcing a newer one. Umi-OCR research and the platform/provider decision remain in design.md; Umi binaries were not integrated.

PNG limit is 32 MiB, 24 MP and 8192 pixels per edge. Results are limited to 10,000 lines / 1 MiB UTF-8. Page recognition has a 30-second limit from admission and inherits the parent deadline; the File document deadline stays 120 seconds. File rasterizes sequentially at up to 200 DPI and warns when downsampling. Upload leases last at most five seconds and never outlive the parent run; returned expiry reflects that bound. Snap snapshots retain only the latest job for ten minutes, with replacement/clear/stop/exit revocation.

Implementation limitations are explicit:

- Native cancellation currently revokes result publication and keeps unfinished Vision work occupying both permits. It does not invoke `VNRequest.cancel`; cancellation is not evidence of immediate native resource release.
- Snap bounds/decode-checks the full source screenshot before cropping. A source above 24 MP or 8192 per edge is refused even for a small selected crop.
- Menu handoff waits 100 ms for native menu/compositor dismissal. Actual menu-frame absence and exactly-once native dispatch remain unverified.
- OCR reconstructs printed text, not original font/layout, real table cells, formulas or handwriting. Same-page text plus local scanned regions are not automatically merged. Existing unsupported rotation/ambiguous-order limits remain.

## Automated results

| Gate | Final result / scope |
| --- | --- |
| `pnpm test` | 362/362 passed. Includes unit, integration and source contracts; no complete native GUI suite. |
| `pnpm build` | TypeScript and Vite production build passed; existing large lazy PDF chunk warning remains. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Passed. |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | Passed. |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1` | Permitted execution outside the sandbox: 365 passed, 0 failed, 2 pre-existing ignored. Includes real Vision bilingual/edge/blank/unsupported-language checks. |
| OCR intent normalization follow-up | Additional assertions preserve `ocr` as a start intent and refuse it on the PNG commit path; focused test passed after the full suite. |
| Build graph | Passed; entry 282,116 bytes / gzip 86,874 bytes, largest lazy chunk 800,861 bytes. No forbidden eager imports or budget findings. Snapshot at `/tmp/zero-snap-ocr-build-graph.json`, not historical tracked evidence. |
| File packaging verifier | Passed policy/source contracts. Candidate remains unapproved; no release signing key or package was generated. |
| Synthetic generator | Regeneration preserved all nine PNG/PDF hashes in expected.json. README is excluded from the manifest. Corpus is literal generated text/shapes/images, with no user screenshot/document input. |
| `openspec validate --all --strict` | 26/26 passed. Existing unrelated icon-spec archive prerequisite remains an informational warning. |
| `git diff --check` | Passed. Generated dist/build/public/file-engine/targets/caches are not part of the source changes. |

Tests exercise concurrent capture flight sharing and old completion, native origin/serialization, selection translation/clamp/hit priority, bounded OCR queue/deadlines/late results, result limits, crop input validation and Snap state expiry, File lease replay/expiry/cross-job/version/direction/revocation, real PDF.js mixed-page parsing with injected OCR, actual DOCX XML/section output, failure without partial output, and hidden-raster cleanup. Positive File native IPC is covered by the debug conversion below; negative lease/caller evidence is helper/source-contract testing, not a comprehensive live IPC attack suite.

Preserved environment failures and investigation:

1. First sandbox Rust suite: 245 passed, 3 failed (real Vision provider, private native pasteboard, one-second child process), 1 ignored in the first failing lib suite. A first permitted serial run still hit the timed child-process test while other builds were running. The targeted process rerun and later isolated complete serial suites passed; test limits were not weakened.
2. Final focused sandbox OCR run: 5 passed, real Vision returned `recognitionFailed`. The subsequent permitted full serial run passed all tests, including Vision. Sandbox success is not claimed.
3. `pnpm tauri dev` first failed binding `::1:1420` with EPERM in the sandbox; permitted development startup succeeded. Raw development app observation was insufficient for UI acceptance, so a packaged debug app with a temporary visible-main configuration was used.
4. Initial native scan conversion timed out in the hidden engine: PDF.js display intent waited for animation frames. Using print intent fixed the real conversion; a regression test checks the intent and cleanup. This did not extend the document timeout.

Local logs are `/private/tmp/zero-snap-ocr-tests-verified.log`, `zero-snap-ocr-build-verified.log`, `zero-snap-ocr-check-complete.log`, `zero-snap-ocr-rust-first.log`, `zero-snap-ocr-focused-final.log`, `zero-snap-ocr-rust-last-serial.log`, `zero-snap-ocr-intent-final.log`, and `zero-snap-ocr-spec-final.log` in the same directory. They are ephemeral, not committed evidence artifacts.

## Real macOS debug evidence

`pnpm tauri build --debug --bundles app --config /private/tmp/zero-ocr-smoke-config.json` produced a local debug Zero.app. The temporary config makes main visible for testing; normal project configuration was not changed. `ZERO_FILE_ENGINE_DEV_ASSETS=1` is the debug source fallback, not proof of an installed approved engine. Native evidence predates the final small async-error/expiry/OS-availability hardening; source tests/build and the real provider tests cover the final code.

CUA observed main Snap showing the available offline OCR capability, an enabled Screenshot OCR action, a real capture window after clicking it, and recovery to main Snap after Escape. Capture uses the pre-existing `NSWindowSharingType::None`; automation screenshots of that protected layer are blank although its accessibility nodes are present. It cannot verify selected pixels, pointer drag/cursor, export or complete Snap OCR edit/copy. Protection was not disabled to obtain evidence. Native status-menu observation through SystemUIServer timed out, so its visuals/keyboard/click behavior remain open.

The actual hidden engine + Rust OCR lease + Vision path converted synthetic `mixed.pdf` (text page, bilingual scan, ordinary blank, white image-backed blank). The original output is `/private/tmp/zero-snap-ocr-native-print/mixed-converted.docx`, SHA-256 `f71dd4e73ae0921205a683cee914b98dde460cfda3ffef0b13857d11136ec024`. It contains four sections, zero page images, visible text in this order:

```text
Original text layer first
Zero OCR synthetic page
中文测试内容
Editable text from offline OCR
Bottom edge text 2026
```

This fixture's expected printed text was present. It is not a general OCR accuracy metric, and native low-resolution/column/table accuracy has not been measured. Phase-only debug smoke output is in `/private/tmp/zero-snap-ocr-native-print.log`; user documents and attachments were not used as corpus or copied into evidence.

TextEdit opened a separate copy, replaced the OCR line with `Edited OCR text saved and reopened`, saved, closed and reopened it. CUA and the saved OOXML both confirmed the edited marker and the original Chinese/English lines. Copy path: `/private/tmp/zero-snap-ocr-native-print/edit-save-reopen.docx`, SHA-256 `1993665e928078f7d28344f7ced1e9cc8c63cfa7f00b7ac306b34eaab5024149`. TextEdit warned of potential formatting loss and collapsed four sections into one on save. This establishes text editability/save/reopen in TextEdit; it does not establish pagination fidelity, Word or LibreOffice acceptance.

## Outstanding acceptance

Task checkboxes certify each task's stated scope, not merely that its code exists. Implementation/automated progress is 19/34; these remain open:

| Tasks | Remaining evidence |
| --- | --- |
| 2.2 / 2.5 | Full native teardown failure/timeout, hotplug/permission/reveal injection and recovery coverage. Generation/expiry helpers pass, but do not cover every native failure. |
| 2.4 | Actual frozen-image/overlay/first-frame/export consistency; geometry and source/reveal contracts pass. |
| 3.2 | Actual menu cancellation, failure, rapid clicks, exactly-once action and absent menu frame. |
| 3.5 | Pointer/keyboard interaction across drag/resize/annotations/export/toolbar, including rollback; pure models pass. |
| 4.5 | Dedicated OCR canary text/token diagnostic and complete dispose integration audit; no content logging/history was added and state revocation helpers pass. |
| 5.2 | Complete native crop/handoff/annotation/caller failure acceptance; crop validation and frozen-media source boundaries pass. |
| 5.3 / 5.4 | Hook StrictMode/late IPC/close-reopen races and complete bilingual keyboard/edit-copy/failure interaction tests. Backend state tests and revision guards do not replace these. |
| 6.3 | Broader cropBox/resource/downsampling/deadline raster injection coverage; coordinate, low-confidence, cancellation and cleanup tests plus native print raster conversion pass. |
| 6.5 | Complete native queue failure/recovery and no-partial-output integration coverage for every OCR error. Injected converter failure and bounded worker tests pass. |
| 7.2 | Menu visuals, light/dark/keyboard/highlight/outside dismissal, denied-permission recovery and full repeated-start evidence. |
| 7.3 | Real left/right and above/below screens, negative origin, Retina+1x, glyph/main/shortcut, immediate restart, drag, Copy/Save/Pin and hotplug matrix. No layout is marked accepted from pure models. |
| 7.4 | Complete Snap bilingual crop/empty/edit-copy/cancel/main-close flow; File mixed/scan/blank and TextEdit edit-save-reopen subset has real evidence. |
| 7.5 | Windows device launcher/text conversion/unavailable OCR, and exact signed File package offline installation/readiness/conversion/old-version/resource/privacy gates. |

`approvedEnginePackages` stays empty, candidate `approved` is false and `packageSha256` is null. No signed-package, Windows/Linux, release, notarization, performance-memory or complete dual-display acceptance is inferred from the debug app or successful build. The change remains unarchived; future requested spec sync must reconcile prior Snap card/interior-create and File scan/facsimile rules in dependency order.

## Local commit verification (2026-10-11)

The requested local commit reran frontend tests (362/362), production build, Rust format/check, build-graph budgets, File packaging verification, change-specific strict validation, all-spec strict validation (26/26), and whitespace checks. All passed. No manual acceptance checkbox or engine approval was changed.

Two permitted complete serial Rust attempts each stopped in the lib suite at the unchanged one-second `direct_runner_preserves_argument_boundaries_and_bounds_output` test: 255 passed, 1 failed with `Timeout`, 1 ignored. Its individual rerun passed, and a subsequent isolated run of all three process-module tests passed. The remaining complete Rust suite, serially excluding only that separately verified test, passed: 364 passed, 0 failed, 2 ignored. Together these runs cover all 365 non-ignored tests; they do not constitute a single passing complete invocation. The timeout limit and existing test implementation were not modified, and the full-suite timing instability remains unresolved.

Ephemeral commit-check logs are `/private/tmp/zero-snap-ocr-commit-frontend.log`, `zero-snap-ocr-commit-build.log`, `zero-snap-ocr-commit-check.log`, `zero-snap-ocr-commit-performance.log`, `zero-snap-ocr-commit-spec.log`, `zero-snap-ocr-commit-rust.log`, `zero-snap-ocr-commit-rust-rerun.log`, `zero-snap-ocr-commit-process-rerun.log`, `zero-snap-ocr-commit-process-module.log`, and `zero-snap-ocr-commit-rust-isolated.log` in the same directory. The separate performance snapshot is `/tmp/zero-snap-ocr-commit-build-graph.json`.
