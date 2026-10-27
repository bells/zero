# Implementation ledger

Startup follow-up (2026-10-27/28): see [measured findings, fixes and remaining device gates](startup-performance-2026-10-28.md). The maintainer's development-build delay was measured and improved; current menu samples are 515/429/400 ms from trigger to native show. These are development/native observations, not release or full visual acceptance.

Approved scope: Q1–Q10, 2026-10-25. The maintainer subsequently authorized a scoped local commit. Push/release/archive remain unauthorized.

## Baseline

- Working directory clean before planning; Node v24.20.0, pnpm 10.33.0, OpenSpec 1.12.0.
- Findings are source-only until measured: xcap window properties repeat full-window queries; hidden WebView scheduling may contribute to reveal delay.

## Coordination

- Shortcut work owns global shortcut service/commands/lib dispatch/preferences and menu accelerator generation.
- Windows provider owns OCR provider module/dependencies/resources and packaging preparation.
- Windows selection owns capture platform path and OCR-only UI; startup edits follow its integration to avoid concurrent capture-file changes.
- Root owns menu placement, startup measurement/optimization, integration, verification and this ledger.
- Implementation ruling: work in the user-visible checkout without creating a new worktree or unsolicited commits. The later local-commit request is explicit authorization for the scoped commit.

## Verification

### Final automated checks (2026-10-25, uncommitted source)

| Check | Actual result |
| --- | --- |
| `pnpm test` | 395 passed, 0 failed |
| `pnpm build` | passed; full profile includes five tools |
| build-graph `--check --output /tmp/zero-snap-build-graph-final.json` | passed, no findings; historical tracked evidence not overwritten |
| `cargo fmt --check` | passed |
| macOS full `cargo check --locked` | passed |
| macOS core `cargo check --no-default-features --locked` | passed |
| `cargo xwin check --target x86_64-pc-windows-msvc --locked` | passed; platform-specific unused warnings retained, no Windows execution implied |
| Rust full serial test outside sandbox | 398 passed, 0 failed, 3 ignored across test binaries/doc tests |
| strict OpenSpec all | 36 passed, 0 failed |
| `git diff --check` and changed documentation local links | passed |
| Windows OCR resource verification | 14 files, 29,454,481 bytes; all regenerated from pinned cached archives without network |
| OCR-only browser interaction | passed: explicit button/Enter recognition, Esc cancellation, no annotation/image commit actions |
| Existing floating-panel browser regression | 10 interaction groups passed, no console/page errors |

Native/browser logs are under `/tmp/zero-snap-*`; generated binaries, vendor archives and resources are outside tracked paths. The synthetic OCR selection screenshot is `/tmp/zero-snap-ocr-selection-final.png` and was visually inspected. A clipped text label inside the 40px confirm icon button was found and removed; the final screenshot shows two unclipped icon buttons.

### First results and environment limits

- The first normal sandbox Cargo check could not unpack dependencies into the Cargo cache. The same locked dependency check passed after permitted cache access.
- The first sandbox Rust run passed 273, failed two existing native tests (Vision and private pasteboard), and ignored two. A permitted serial native rerun passed; final post-review source passed 398 with three ignored. No test was weakened or removed.
- The window metadata benchmark initially returned no CoreGraphics list inside the sandbox. Its permitted native rerun passed: with three windows, legacy query times were 101824/17405/17271 us versus 595/262/250 us for one snapshot. This is a phase microbenchmark, not end-to-end capture timing.
- The first `pnpm tauri dev` failed to bind localhost in the sandbox. Permitted native development startup compiled and ran. An existing installed Zero instance initially consumed the single-instance activation; it was temporarily exited for validation and restored afterward.
- Native automation could inspect a temporary `.app` using this build. The Snap main page showed Option+A, OCR recording Alt+Shift+O immediately registered, reset returned to unassigned, and recording duplicate Alt+A rejected the change while preserving the old state.
- That temporary application explicitly failed screenshot permission preflight. The source previously rendered the structured error as `[object Object]`; a RED-to-GREEN regression now preserves the actual message, and native UI showed the screen-recording permission instruction. This is a verification-identity limitation, not evidence that the user's normally authorized `pnpm tauri dev` is broken. System permissions were not modified.
- The temporary application and its LaunchServices registration were removed; the local test server was stopped and the original `/Applications/Zero.app` window was restored.
- Windows native execution is unavailable on this macOS host. An optional independent macOS ONNX quality spike could not fetch its vendor runtime through the network; no new OCR-quality or Windows runtime claims are made from that attempt.

### Review and fixes

A separate source reviewer reported three P2 failure paths, all addressed:

1. Windows monitor ordinals could change after hotplug. Internal capture authority now retains the original handle, device identity, physical frame and DPI and validates it before/after capture; three new identity regressions observed RED then GREEN. `GdiFlush` now precedes CPU reads of DIB pixels.
2. Cropping could complete after Esc/disable and publish a stale OCR job. Session removal revokes the same publication authority; publication is mutex-linearized and finalization shares the Snap lifecycle gate with disable. The revoke-before-publication regression observed RED then GREEN, and scoped review found no new lock cycle.
3. Failed unregister/rollback could orphan native shortcut registrations. Per-action owned-binding sets retain residue, edits/disable retry cleanup, and failed updates publish the true snapshot. Disabled edits cannot erase a still-registered old key. Transaction recovery 9/9 and hook recovery 2/2 passed independently, followed by the integrated full tests and scoped review.

### Remaining device gates (tasks intentionally unchecked)

- 2.1: real native menu position at display edges/non-primary screens (geometry/source changes are implemented and model tests pass).
- 2.4: full stationary-pointer reveal and first/repeated menu/shortcut/main end-to-end measurements. The confirmed repeated-query bottleneck is fixed and capture disables hidden WKWebView throttling where supported; the user's complete delay is not claimed fully reproduced or resolved without native capture evidence.
- 4.3: Windows installed first-use offline Chinese/English recognition, actual shortcut/cancel behavior, mixed DPI and hotplug.
- 5.2: complete macOS menu/shortcut/capture acceptance beyond the settings interactions above.

Implementation verification did not perform a commit, push, installer publication, spec sync/archive or File engine approval. The subsequent scoped local commit is separately authorized; the four device gates remain open.


## Scoped local-commit preflight

The maintainer requested a local commit only. Pre-commit checks were rerun on the reviewed source: frontend 395/395, build and build-graph, 14 OCR asset digests, strict OpenSpec 36/36, Rust formatting, macOS full/core checks and Windows x64 cross-check all passed. The first native serial Rust run hit the existing File process runner's one-second timeout; its unchanged test passed alone (0.23 s), then the unchanged full suite passed 398 with 3 ignored. The initial failure and both reruns are preserved under `/tmp/zero-snap-commit-rust-*.log`. No test timeout or product behavior was changed for this preflight.

The staged scope is limited to the 73 reviewed Snap-related source/config/test/documentation/OpenSpec files, including resource manifests and license records. Model/runtime binaries remain in the ignored build cache. The four device gates remain unchecked; there is no push, archive, release or File-engine approval authorization.
