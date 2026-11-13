# Shortcut capture preserves the visible desktop

Date: 2026-11-13. Local macOS source and native window checks; no package/release or Windows device acceptance.

## Behavior and implementation

The maintainer reported that Option+A hides the open Zero tray/main window before capture, and requested a shortcut capture of the desktop as it stands. Previously all entry points called the same unconditional shell-window hiding function before acquiring pixels.

- Global Snap capture and OCR dispatch now call `start_shortcut_screenshot`, carrying an internal entry enum through the existing single-flight lifecycle.
- Shortcut preparation preserves visible shell windows and their geometry, recording the original window interaction for terminal restoration. Main/tray buttons and native menus retain their existing hide-before-capture path and monitor selection.
- A visible tray uses the host's existing `DialogGuard` to prevent capture-focus blur from dismissing it. Session clones share one lease until cleanup/restoration completes; preparation failure releases it by scope. A hidden tray receives no lease and is not opened on completion.
- No IPC or TypeScript contract changes, new dependencies, permissions, background captures, cached pixels, or shortcut binding changes were introduced.

## Verification

- Red/green policy test: shortcut preservation failed against the previous unconditional-hide policy, then passed with explicit entry selection. Interface dismissal remains covered. Initial failure log: `/tmp/zero-snap-preserve-red.log`.
- Opt-in native regression: `ZERO_NATIVE_SNAP_ENTRY_TEST=1 cargo test --manifest-path src-tauri/Cargo.toml --test snap_entry_native --locked` passed outside the sandbox. It compiles the production preparation module into a standalone main-thread executable, using blank Tauri windows and real AppKit focus/visibility behavior. It captures no desktop pixels or private content.
- Native checks cover tray + main visibility, capture-focus blur protection, focus restoration, later normal blur dismissal, main-only preparation with unchanged position/size, a hidden tray remaining hidden, and existing interface-entry dismissal. Log: `/tmp/zero-snap-entry-native-final.log`.
- `pnpm test`: 492 passed.
- `pnpm build`: passed, full profile.
- Rust full serial regression outside the sandbox: 466 passed, 3 ignored. The opt-in native executable is skipped in this normal suite and was run separately as above. Log: `/tmp/zero-snap-preserve-cargo-test.log`.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, full/core `cargo check --locked`, strict OpenSpec validation (45 items), and `git diff --check` passed.

## Remaining device acceptance

`pnpm tauri dev` compiled and attempted startup from the final source. The installed `/Applications/Zero.app` instance was already running. Computer-use selection of Zero timed out, so no actual Option+A dispatch, frozen screenshot, real capture cancellation/export, or external-window focus sequence was inspected. The native regression verifies preparation and host dismissal protection; it does not replace screenshot pixel/physical-key acceptance. Tasks 2.4 and 5.2 remain open. Windows device behavior remains unverified.
