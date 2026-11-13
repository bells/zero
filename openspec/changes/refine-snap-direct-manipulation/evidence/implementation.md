# Snap direct manipulation implementation — 2026-11-13

## Scope and implementation

Implemented in branch `codex/snap-direct-manipulation`, managed worktree `/Users/watson/.codex/worktrees/snap-direct-manipulation/zero`, from `3d0222e235dec41d9d8ed5d46540a48efcc412dc`. Implementation was prepared without commits; the maintainer subsequently authorized committing, merging to main and pushing. During implementation, main-checkout runtime source, installed Zero, Rust production code, IPC contracts, capabilities and lockfiles were not changed. Delivery is recorded in Git history; native acceptance below remains open. See [proposal](../proposal.md), [design](../design.md), [spec](../specs/snap-direct-annotation-manipulation/spec.md) and [tasks](../tasks.md).

- Current drawing tool and selected property/geometry target are independent. All six drawing tools and Select can directly edit the topmost matching object. New drawing immediately exposes handles; explicit tool activation clears selection; subsequent drawing uses independent defaults.
- `captureAnnotationGeometry.ts` uses source-space shape distances with display-pixel tolerance: rounded rectangle/ellipse outlines, fills, arrow shaft and both filled heads, Pen paths, measured text layout and Mosaic regions. Pin is excluded from object picking.
- New `captureAnnotationInteraction.ts` gives selected-object handles precedence over crop handles, then body picking and blank actions. Option is sampled at press, bypassing bodies only. Blank drawing starts are constrained to crop, while existing image-space objects remain editable outside crop. OCR-only supplies no annotation candidates and retains crop handles.
- Shape Shift resizing and Pen uniform scaling retain opposite anchors, image bounds, styles and identity. Text uses four corner handles, integer 12–96 font sizing, shared measured layout, fixed opposite corner and unchanged manual lines; anchors stop at image limits. Cross-tool double-click shares the existing multiline/IME edit domain.
- Existing controller/reducer, raw lease output, original-pixel OCR, default-style storage and committed-scene renderer are reused. No new runtime dependency. Compact bilingual modifier hints supplement existing controls.

## Verification environment and reference comparison

Node 24.20.0, pnpm 10.33.0. Browser plugin skill/runtime is absent; used existing local Playwright/Chromium with `SNAP_PLAYWRIGHT_MODULE=/Users/watson/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs`. No browser dependency was installed. The existing main-checkout server on port 1420 was retained; worktree Vite runs at `http://127.0.0.1:1422`, with `SNAP_TEST_ORIGIN` set accordingly. Browser fixtures use synthetic pixels and mock native IPC, while real Canvas, DOM events, storage and PNG encoding execute in Chromium.

| Reference | Implemented evidence or intentional boundary |
| --- | --- |
| iShot objects show resize points and can move after drawing | Eight-point shapes/Pen, arrow endpoints, four text corners; immediate and cross-tool edits in `snap-direct-manipulation.mjs` |
| Color and selection chrome | Zero's existing red drawing defaults, blue object handles, green crop and compact toolbar retained; this is not an iShot skin replacement |
| Screenshot line/sequence/curved-arrow icons | New tools were explicitly excluded; six existing drawing tools only |
| Desktop drag/resize behavior | Browser screenshots and event assertions establish synthetic interaction only; native permission blocked full acceptance below |

Page title/identity, non-empty rendered surface, absence of Vite overlay, no page errors, interaction assertions and screenshots were checked. Desktop is 1000×700; narrow viewport is 360×640, with additional legacy 360×300 / resized panel checks. Temporary screenshots: `/tmp/snap-direct-text.png`, `/tmp/snap-direct-narrow.png`, `/tmp/snap-direct-ocr-only.png`. These are QA artifacts outside the repository.

## Automated results

Final tests were run after both independent-review fixes, not inferred from earlier builds.

| Command / script | Actual result |
| --- | --- |
| Baseline `pnpm test` before edits | 492 passed, 0 failed |
| Final `pnpm test` | 501 passed, 0 failed |
| Final `pnpm build` | Exit 0, full profile and all five tools verified |
| `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph-direct-manipulation.json` | Exit 0; no findings/forbidden eager imports; initial JS 271,177 bytes / gzip 83,703 |
| `node tests/browser/snap-direct-manipulation.mjs` | 9 groups passed, no page errors; six-tool movement/resize, modifiers, cross-type defaults, Text/IME event arbitration, crop overlap/outside handles, cancellation/tool switch, actual uploaded PNG vs preview, OCR-only handle resize and narrow layout |
| `node tests/browser/snap-annotation.mjs` | 17 groups passed; live properties/defaults, transactions, numeric rollback, text, persistence failure and Copy/Save/Pin lease/PNG checks retained |
| `node tests/browser/snap-annotation-pixels.mjs` | 8 pixel groups passed, including moved Mosaic sampling new region and crop-radius alpha |
| `node tests/browser/snap-floating-panels.mjs` | Exit 0; group movement, anchoring, constraints and rollback retained |
| `node tests/browser/snap-properties-layout.mjs` | Exit 0; bilingual six-tool layouts and narrow dimensions, no page errors |
| `node tests/browser/snap-startup.mjs` | Exit 0; StrictMode, production route and failed-import boundary |
| `node tests/browser/snap-windows-ocr-selection.mjs` | Exit 0; restricted OCR selection behavior, explicit confirmation and cancellation |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Exit 0 |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | Exit 0 |
| First `cargo test --manifest-path src-tauri/Cargo.toml --locked` | Failed in `file_process_integration::fake_executable_preserves_arguments_working_directory_and_output_bounds` at `output.success`; first log retained at `/tmp/snap-direct-rust-tests.log` |
| Targeted `cargo test --manifest-path src-tauri/Cargo.toml --locked --test file_process_integration -- --test-threads=1` | Exit 0, 2 passed; no tests or Rust source weakened |
| Full `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1` | Exit 0, aggregate 466 passed / 0 failed / 3 ignored across 20 test-result summaries |

Rust commands used `CARGO_TARGET_DIR=/Users/watson/work/zero/src-tauri/target` to reuse the existing cache. The initial process-test cause was not conclusively determined; serial success is recorded separately rather than erasing the first failure. Final logs are `/tmp/snap-direct-final-tests.log`, `/tmp/snap-direct-final-build.log`, `/tmp/snap-direct-final-*.log` and `/tmp/snap-direct-rust-all-serial.log`. OpenSpec, local-link and whitespace results are recorded at the end after final document checks.

## Red/green and independent review

- First unit RED reproduced old bounding-box hits, scale-dependent tolerance and Pin picking. A new target-module import was initially absent; the first GREEN exposed a missing `.js` suffix in emitted ESM, corrected without changing behavior assertions. Unit shape/ratio/Pen/Text tests then passed.
- First browser RED found zero handles after Rectangle drawing. Direct editing was then connected. A move fixture was corrected because it started exactly on a resize handle; lost-capture checks wait for the actual rollback render instead of reading stale React output.
- Legacy browser fixtures that selected outline interiors now select visible strokes or explicitly solid shapes; intentional overdraw uses Option. Legacy no-aspectRatio source guard now applies to crop controls, permitting the approved annotation feature. Original title labels were kept because the visible hint already explains modifiers.
- One independent whole-change read-only review reported two Important issues: OCR-only crop handles incorrectly excluded, and existing object handles outside crop blocked before arbitration. Both were demonstrated by failing browser assertions, then fixed in a single review-fix pass. The expanded final browser script passes both cases. No Critical findings; reviewer-deferred native/Retina/IME/performance checks remain pending rather than waived.

## Native attempt and remaining acceptance

`pnpm tauri dev` compiled and launched the actual worktree implementation against port 1422 using a temporary `/tmp` config. The default unbundled hidden executable was not selectable in desktop automation. A temporary `/private/tmp/zero-snap-direct-native/Zero.app` wrapper (same bundle identifier `com.watson.ztool`, symlink to the debug executable) and a temporary visible-main config allowed CUA to inspect the real main window and open Zero Snap. No tracked Tauri config or installed application was modified.

Clicking **截图并复制** returned **Zero Snap 打开失败: 请在系统设置中允许 Zero 录制屏幕后重试**. This is evidence that the temporary test-app identity lacked screen-recording authorization; it does not establish a failure in the user's normally authorized development process. No system permission was granted or bypassed. The temporary app was quit through Cmd+Q and app inventory confirmed it stopped.

Tasks 6.1–6.4 remain unchecked: actual native six-tool gestures, physical modifiers, real Chinese IME and native color dialog, Retina/multiple displays, Copy/Save/Pin/OCR, restart/default isolation and high-resolution runtime/resource recovery were not accepted. Browser composition events and synthetic PNG uploads do not replace those checks. Windows device/runtime acceptance and older change gates are unchanged. No source-implementation claim implies package release, deployment, spec sync or archive.

## Final document gates

`openspec validate --all --strict`: 46 passed, 0 failed. The existing `zero-icon-system` archive dependency INFO remains unrelated; no archive was attempted. Local links across 8 Markdown files passed; tracked diff and untracked change-file whitespace passed. OpenSpec apply progress: 16/20 complete; remaining four are native acceptance tasks 6.1–6.4.

## Delivery verification

On maintainer authorization to commit, merge into main and push, `pnpm test` was rerun: 501 passed, 0 failed. The first sandbox attempt failed in `fileEngineDevDependencies.test.mjs` because the reused node_modules symlink points to the main checkout and Vite could not write its `.vite-temp` cache (EPERM). The permitted rerun passed without source/test changes; both logs remain at `/tmp/snap-direct-delivery-tests.log` and `/tmp/snap-direct-delivery-tests-permitted.log`. Strict OpenSpec again passed 46/46. The original untracked main-checkout planning artifacts are backed up before merging; manual acceptance stays open.
