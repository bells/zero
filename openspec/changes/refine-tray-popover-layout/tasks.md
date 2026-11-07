## 1. Host geometry and placement contract

- [x] 1.1 Add `services/popover.rs` with retained per-window `{ revision, anchorX }` snapshots, restricted `get_popover_placement` in `commands/app.rs`, state/handler registration in `lib.rs`, and targeted snapshot/caller/serialization tests. Verify with focused Rust tests.
- [x] 1.2 Extend `tool_windows.rs` anchored placement to return the logical anchor offset and wire primary-cell tray and Paper placement into publication. Verify centered, edge-clamped, negative-origin, invalid and scaled geometry through Rust tests.
- [x] 1.3 Apply the exact-cell native menu path in `status_bar.rs` to all grouped items and extend `menu_position.rs` regression coverage for ordinary rightward placement and both screen edges. Verify Rust tests and macOS compilation.

## 2. Shared frontend presentation

- [x] 2.1 Add typed `PopoverPlacement`, a subscribe-before-snapshot hook and shared `AnchoredPopover` wrapper under `core/windowing/`. Integrate tray and Paper with transparent top inset and connected caret. Verify TypeScript build and stale snapshot/unmount behavior through focused tests or runtime inspection.
- [x] 2.2 Update `App.tsx`, `App.css` and `navigation.css` with Settings/About in the first row, fixed Open Zero beside scrollable tool navigation, and recovered plugin space. Remove footer state/styles. Verify translated accessible names and preserved action/error paths through TypeScript build, existing service tests and source review, with rendered acceptance tracked in 3.2.

## 3. Integration verification

- [x] 3.1 Run `pnpm test`, `pnpm build`, cargo fmt/check/test with `--locked`, build graph check with a separate `/tmp` output, strict OpenSpec validation and `git diff --check`. Record results in change evidence.
- [ ] 3.2 Run `pnpm tauri dev` and inspect macOS primary/Paper carets, header actions, repeated opening/dismissal and per-icon menus. Record observed results and any unavailable edge/multi-display checks.
- [ ] 3.3 Verify the shared layout on a Windows device, recording native tray/menu behavior and keyboard operation separately from macOS evidence.
