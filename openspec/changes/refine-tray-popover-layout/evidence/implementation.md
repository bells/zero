# Implementation and verification

Date 2026-11-07, local macOS development workspace.

## Delivered behavior in source

- Tray header has translated Settings and About icon buttons after the count. Open Zero is fixed at the far right of the existing scrollable tool row. Footer state, markup and styles were removed.
- The 400 × 500 tray and 400 × 360 Paper surfaces share a caret wrapper. An anchored surface reserves 8 logical pixels inside the existing height. Caret and body use matching light surface colors, chosen during implementation to avoid visible seams.
- Rust retains independent revisioned placements and sends updates to the affected label. The frontend subscribes before reading the retained snapshot and disposes late subscriptions safely.
- macOS cell anchors include their native backing scale. Monitor lookup and final movement use global logical coordinates, while edge clamping uses the target monitor's physical work area.
- All grouped macOS menus use the existing per-cell AppKit placement path. Snap capture-display setup, menu tracking and highlight cleanup remain in that path.

## Automated checks

- `pnpm test` passed all 479 tests. Four new cases cover subscription/snapshot ordering, lazy initialization and late callbacks after disposal.
- `pnpm build` passed for the full five-tool profile.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked --no-default-features` passed for the core profile.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1` passed outside the sandbox, with 456 passed and 3 ignored across test binaries. New geometry cases cover both screen edges, negative display origins, and moves between 1× and 2× displays.
- The first sandboxed Rust run reported Vision recognition and private-pasteboard failures. The original output was retained at `/tmp/zero-tray-cargo-tests.log`. The native serial rerun passed those tests, with final output at `/tmp/zero-tray-cargo-tests-final.log`.
- Build graph budget check passed with no findings or forbidden eager imports. Snapshot is `/tmp/zero-build-graph-tray.json`.
- Strict OpenSpec validation and `git diff --check` passed.

## Review

An independent source review found two issues before completion. Placement events were broadcasting across windows, and mixed-DPI positioning used the previous window scale. Both were corrected. Source inspection confirmed the frontend's Window listener matches the explicit label-targeted event. Native delivery still needs real-window acceptance.

## Native acceptance gap

`pnpm tauri dev` built and launched successfully outside the sandbox after the initial sandbox attempt failed to bind port 1420. The installed four-tool Zero instance initially handled activation through single-instance behavior. It was closed through the native UI to allow current-build verification.

Computer-use automation timed out selecting the temporary current-build application, and also timed out attempting to reopen the previously running installed app. No current-build tray, Paper or menu screenshot was obtained. The maintainer was notified that Zero may need to be reopened manually. The temporary Vite service was stopped after the attempt.

The macOS caret attachment, per-icon menu placement, top-action keyboard flow, repeated opening/dismissal, physical mixed-DPI/multiple-display operation, and Windows device behavior remain pending. Automated checks and source review do not close these acceptance tasks.
