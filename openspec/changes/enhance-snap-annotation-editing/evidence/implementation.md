# Snap annotation editing implementation — 2026-10-18 to 2026-10-19

## Scope and baseline

Existing scene: `captureTypes.ts`, `captureCanvas.ts`, `captureReducer.ts`; UI orchestrator: `CaptureApp.tsx`. Crop coordinates, move/resize, source↔viewport conversion and nudge: `captureSelectionModel.ts` / `captureGeometryModel.ts`. Shared PNG composition: `captureExport.ts`. Raw prepare/upload payload: `captureSerialize.ts`; Rust `commands/screenshot.rs` and `services/screenshot.rs` remain authoritative. OCR sends only session ID, original selection and languages to `start_snap_ocr`; it does not use the annotated canvas.

Overlap review (old task files are unchanged):

- `optimize-screenshot-toolbar`: localized icon toolbar, multiline input and crop-following placement retained; real macOS task 5.3 remains open.
- `enhance-snap-and-share-offline-ocr`: annotation hit priority / crop grab movement retained; object-first selection extended with transactions. Its 2.2/2.4/2.5, 3.2/3.5, 4.5, 5.2–5.4, 6.3/6.5 and 7.2–7.5 gates remain open, including lifecycle failures, multi-display, native OCR and Windows/package evidence.
- `enhance-zero-snap-smart-selection`: targeting, crop dimensions/radius, first-frame reveal retained; 7.1–7.5/7.7 remain open.
- `systematic-performance-and-code-optimization`: raw media tokens, one-use upload leases and terminal resource release retained; outstanding runtime/performance/multi-display/Windows gates remain open.

Escape baseline previously rolled back drawing/crop or cancelled the session; this change inserts selected-object deselection and transactional rollback. Crop and object transforms stay independent. Explicit Cancel remains a session action.

## Dependency decision

Read existing package manifest: React 19, Canvas 2D and lucide-react already support the required controls and scene. Read-only npm registry queries on 2026-10-18 (via configured proxy; initial sandbox EPERM retained in session) returned:

| Candidate | License | Current version / modified | Unpacked package size | Decision |
| --- | --- | --- | --- | --- |
| `@radix-ui/react-slider` | MIT | 1.6.1 / 2026-10-14 | 187,895 B | Native range/number already cover one-value keyboard/pointer input; no missing generic slider capability. |
| `konva` | MIT | 10.9.0 / 2026-10-15 | 1,900,536 B | Maintained scene engine, but migrating existing crop/mosaic/raw export paths adds unrelated behavior and bundle cost. |
| `fabric` | MIT | 7.4.0 / 2026-05-18 | 22,222,881 B | Maintained general editor, broader document/layer surface than this scope. |

Registry package sizes are unpacked distributions, not browser bundle measurements. No new runtime dependency or lockfile change. Reuse native range, number, color, checkbox, select and buttons; domain geometry/transactions remain small Snap-specific modules.

## Automated evidence and remaining acceptance

Results are appended as each gate runs. Unit/model/renderer/browser evidence is separate from real macOS capture and does not close older device tasks.

- Model red→green: 10 tests pass, including no-op/invalid-target history, continuous-drawing selection, normalization, bounded numeric inputs, field allowlists, defaults privacy/failure, one-commit transactions with late/stale target rejection, shape/pen/endpoint transforms and text/handle layout.


## Implemented modules

- Six tool-specific canonical styles/objects, bounded source-pixel properties and field/color allowlists; Pin remains an immediate region action outside drawing defaults. Rectangle radius is constrained on the object without changing requested defaults.
- Shared measured text/bounds, source-space object transforms and degenerate-axis projection; object controls remain independent of crop controls and output pixels.
- A single-object controller owns original/preview snapshots and rejects stale/closed callbacks; reducer guards no-op/missing targets and preserves redo until a real commit. Continuous drawing does not select its new object.
- The presentational panel distinguishes defaults/selected objects. Text create/edit shares its domain with property controls, keeps a fixed source baseline, and defers to composition. Explicit Cancel exits; Escape rolls back one layer.
- Whole-object opacity composites a bounded reusable temporary canvas once. Mosaic samples the rebuilt preceding scene at full coverage. Canvas/context failure propagates instead of silently losing an object; session owners release resources. Existing PNG crop mask and original-pixel OCR remain separate.
- Versioned allowlisted storage is independent of global preferences. Save failure keeps current defaults usable and shows a dismissible localized notice. Capture-only labels are lazy, preserving the initial bundle budget.

## Review and regressions

A fresh read-only reviewer identified three P2 issues, all reproduced and fixed:

1. Valid numeric preview → invalid final text → Tab/another control could commit the last valid preview. Invalid text now restores the initial preview, preserves invalid feedback, and releases local input ownership on completion; a new interaction cannot smuggle the prior preview into history. Browser regression verifies original opacity and redo preservation.
2. Changing text size kept the textarea's old top while export used a fixed source baseline. Editor positioning now derives from the current annotation baseline, font size and contained-image projection. Browser regression checks the 24→32 px top change before commit.
3. A zero-extent Pen axis ignored resize movement. It now translates/clamps that axis while keeping its zero extent and stroke width. Unit fixtures cover horizontal and vertical paths.

An earlier browser check exposed missing horizontal-arrow controls: crop projection intentionally rejects zero-area rectangles, so object projection now preserves degenerate axes. A lost-capture assertion was also checked against actual pointer event metadata; rollback was already correct, and the test now waits for React to render the rollback rather than reading the prior preview immediately. No speculative event-order workaround remains.

Reviewer exclusions (not waived): real macOS native color/Chinese IME, Retina/multiple displays, native output actions, application-restart persistence and high-resolution memory settle. Those remain in section 9 of tasks.

## Production bundle comparison

A separate temporary export of HEAD `e6d23a2b1702f39a8db7b6ec58516f33c6adeb98` was built with the same dependencies and production command. No checkout/worktree/index was reset. Both reports use independent `/tmp` paths; historical tracked build-graph evidence is unchanged.

| Metric | HEAD baseline bytes / gzip | Final bytes / gzip | Delta bytes / gzip |
| --- | --- | --- | --- |
| Initial JS graph | 282,451 / 86,996 | 282,459 / 87,004 | +8 / +8 |
| CaptureApp lazy chunk | 28,444 / 9,002 | 46,587 / 14,474 | +18,143 / +5,472 |
| Shared captureExport lazy chunk | 5,040 / 1,966 | 10,927 / 4,111 | +5,887 / +2,145 |
| Largest chunk (PDF conversion) | 800,861 / 235,668 | 800,861 / 235,668 | 0 / 0 |

The first new build put property strings in the eager Snap dictionary and failed the existing initial-JS budget (`285,078 > 285,000`). Moving the new strings into capture-local `i18n.ts` fixed the graph; budgets were not raised. These are deterministic build sizes, not runtime latency/RSS evidence.

## Native attempt and acceptance boundary

`pnpm tauri dev` compiled and ran the actual macOS debug executable. The default hidden process was not directly selectable by desktop automation; a temporary development-only visible-main configuration and a temporary `.app` wrapper enabled real UI access. Neither tracked Tauri configuration nor the installed application was modified.

On the current verification window, Snap navigation and the localized capture/OCR controls loaded. Clicking **截图并复制** restored the shell with **Zero Snap 打开失败: [object Object]**, without reaching the capture editor. The underlying structured error was not exposed by that existing UI path, so this run does not attribute it to a particular permission or native cause. No new system permission was granted or bypassed. The temporary application was then quit; app inventory confirmed Zero was not running.

Tasks 9.1–9.6 remain unchecked: native six-tool interactions, IME/color chooser, Retina/corners/multiple displays, actual Copy/Save/Pin/OCR, app restart/default restoration and high-resolution memory recovery were not completed. Synthetic browser storage reload is not native app-restart proof. This change does not close any older manual/lifecycle/package gates.

## Final verification — 2026-10-19

| Gate | Actual result |
| --- | --- |
| `pnpm test` | 376 passed, 0 failed. Includes 13 annotation model/resource regressions plus existing scene, crop, media, localization and source-boundary checks. |
| `pnpm build` | Exit 0, full profile verified. |
| `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json` | Exit 0; no budget findings or forbidden eager imports. Final size comparison above. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Exit 0. |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | Exit 0. |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | First sandbox run: 253 passed, 3 failed, 1 ignored in the unit binary; suite stopped there. Failures listed below. |
| Same Rust test command with `-- --test-threads=1`, outside sandbox | Exit 0: aggregate 368 passed, 0 failed, 2 ignored across unit/integration/doc binaries. No Rust code or test was weakened or skipped for the rerun. |
| `openspec validate --all --strict` | 33 passed, 0 failed. Existing informational archive dependency for `refine-zero-icon-family` remains; no spec was synced or archived. |
| `git diff --check` | Exit 0. New untracked source/artifacts were also audited for whitespace. |

First Rust failures retained: `services::file::process::tests::direct_runner_preserves_argument_boundaries_and_bounds_output`, `services::ocr::macos::tests::vision_recognizes_synthetic_bilingual_edges_and_blank`, `services::screenshot::tests::native_png_clipboard_round_trips_on_private_pasteboard`. The successful serial rerun distinguishes these sandbox/native/timing-sensitive results from the actual native application acceptance described above.

Real Chrome synthetic interaction runner (`tests/browser/snap-annotation.mjs`): **13 groups passed**, covering blank crop move/click, continuous drawing/default context, object movement/resize without crop movement, invalid numeric rollback/redo, selected-vs-default isolation, one-history slider changes, pointer cancellation/lost capture, layered Esc, multiline/bold create/re-edit/empty delete/undo/composition events, per-tool controls, numeric bounds, arrow endpoints, style-only persistence/reload/reset, nonblocking failed storage, Copy/Save/Pin PNG/raw lease headers, and bounded panel placement at 360×300 / 720×480 / 1440×900.

Real Chrome pixel runner (`tests/browser/snap-annotation-pixels.mjs`): **7 groups passed**. Checks actual Canvas alpha/color data and a decoded PNG: rounded solid at 40%, arrow shaft/head overlap at 50%, 1%/100% opacity with a thick clipped pen, bold multiline Chinese/English text, full-coverage/reversible Mosaic after a translucent shape, preview/final-scene equivalence, and transparent rounded crop corners. These are not just Canvas call counts.

Browser runs used the bundled Playwright installation through `SNAP_PLAYWRIGHT_MODULE` and local Chrome through `SNAP_CHROME_PATH`, with Vite bound to 127.0.0.1:1420. Native IPC alone is synthetic; browser event handling, storage, rendering and PNG encoding are real. No screenshots, private content or runtime tokens were committed. The browser reload/default recovery check is deliberately not task 9.5 app-restart evidence.

Final implementation scope: no Rust/IPC/capability change, no new runtime dependency/lockfile edit, no generated build/cache/media output staged. The implementation phase did not commit/push/tag/deploy/sync/archive. Progress: **30/36 tasks complete**; all six native acceptance tasks remain open.


## Local commit handoff — 2026-10-19

The user subsequently requested a local commit ("先提交代码"). Before staging, `pnpm test` (376/376), `pnpm build`, the independent build-graph budget, change-specific strict OpenSpec validation and whitespace checks were rerun. Only the reviewed Snap source, synthetic tests, maintenance map and this OpenSpec change are included. No native acceptance checkbox changed; the screenshot-start failure remains unresolved. This authorization excludes push, release, spec sync and archive. The resulting commit identity is recorded in Git history and the conversation.
