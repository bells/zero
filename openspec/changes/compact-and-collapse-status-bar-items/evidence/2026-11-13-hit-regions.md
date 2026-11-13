# macOS status-bar mouse-region regression

Date: 2026-11-13. Scope: restore mouse targeting after resizing the existing grouped native status item. No IPC, frontend, or non-macOS behavior changes.

## Reproduction and cause

The opt-in `status_bar_native` test runs Tauri/AppKit on the process main thread with its own temporary registry/settings and no webview windows. It uses the production settings and collapse-toggle services, then asks AppKit which view receives points near each cell's left edge, center, and right edge.

Before the fix, the collapsed button measured 22 × 22pt. After expansion it measured 110 × 22pt, but tray-icon's `TaoTrayTarget` mouse receiver still measured 22 × 22pt. The test failed on the second cell: AppKit returned `NSStatusBarButton` instead of `TaoTrayTarget`. The same receiver dispatches both left and right mouse events. This demonstrates the stale target region; it does not establish that every cell was inaccessible in the user's session.

`tray-icon` 0.23.1 updates the receiver while setting the image, before Zero applies its final status-item length and 22pt image geometry. Zero now sets its button child views to the final button bounds and enables width/height autoresizing so later AppKit layout updates preserve that coverage. Both the mouse receiver and the drawing-only highlight overlay fill that button.

## Verification

- Red/green native regression: the pre-fix test failed after expansion; the fix passed three expand/collapse cycles. Each expanded state contains four tool cells plus the primary cell, and all three points in each cell resolve to the actual tray event receiver.
- Run explicitly in a macOS desktop session with `ZERO_NATIVE_STATUS_BAR_TEST=1 cargo test --manifest-path src-tauri/Cargo.toml --test status_bar_native --locked`. Normal `cargo test` skips this desktop-only executable unless opted in.
- `pnpm test`: 492 passed.
- `pnpm build`: passed, full profile.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked`: passed.
- Full serial Rust regression outside the sandbox: 464 passed, 3 ignored. The native hit-region executable was run separately with the opt-in flag.
- The first sandboxed Rust run had three failures: `direct_runner_preserves_argument_boundaries_and_bounds_output` (provider deadline), `vision_recognizes_synthetic_bilingual_edges_and_blank` (Vision unavailable), and `native_png_clipboard_round_trips_on_private_pasteboard` (pasteboard unavailable). All passed in the full serial rerun outside the sandbox. Logs: `/tmp/zero-status-bar-cargo-test.log` and `/tmp/zero-status-bar-cargo-test-native.log`.
- Build graph check passed with no budget findings or forbidden eager imports; snapshot: `/tmp/zero-build-graph-status-bar.json`.
- `openspec validate --all --strict`: 45 items passed. `git diff --check`: passed.

## Remaining device acceptance

`pnpm tauri dev` built and launched the current version outside the sandbox. Computer-use desktop discovery timed out twice, so no actual pointer-driven primary-menu expansion or individual tool/menu action was inspected. The native regression verifies real AppKit hit routing through production resize services; it does not replace the full actions/menu/focus acceptance in task 5.5. That task remains open. Windows device validation was not performed for this macOS-only change.
