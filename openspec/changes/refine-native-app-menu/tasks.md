## 1. Native application menu

- [x] 1.1 Add failing menu-model tests covering Chinese/English labels, enabled Ready/Active records, empty/core tool lists and obsolete tool IDs. Implement the Rust menu model and verify with targeted cargo tests.
- [x] 1.2 Install macOS native menus using current-state refreshes and signature caching. Reuse navigation, About, settings, shutdown and support URLs. Verify focused source contracts, cargo check and profile checks.

## 2. Focused frontend behavior

- [x] 2.1 Add failing editing dispatch tests for undo/redo, editor consumption, text fallback, invalid actions and editable focus. Implement the typed Rust/TS event bridge and Snap history integration. Verify targeted tests and TypeScript build.
- [x] 2.2 Make explicitly requested hidden tools accessible without changing saved preferences. Verify focused navigation tests and full frontend tests.

## 3. Verification and evidence

- [x] 3.1 Run pnpm test/build, cargo fmt/check/test --locked, build graph check, strict OpenSpec validation and git diff --check. Record actual results and any environment failures in evidence/implementation.md.
- [ ] 3.2 Run pnpm tauri dev and inspect macOS menus, language switching, settings/About/tool navigation, text and Snap undo/redo, window close/reopen, Awake residency and Quit. Record each observed acceptance boundary.
- [ ] 3.3 Validate Windows behavior on a Windows device, including absent native application menus and existing tray/window navigation. Record separate device evidence.
