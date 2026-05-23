# ZTool System Section Design

## Goal

Add a third main area to the tray window for system-level actions: Preferences, About, and Exit. Preferences must include real login autostart and per-tool visibility controls.

## Layout

The main shell becomes three parts:

1. Tool list: visible plugins only.
2. Tool display: the selected plugin panel.
3. System strip: compact bottom actions for Preferences, About, and Exit.

Preferences and About render inside the same tray window instead of opening a separate window. This keeps the tray workflow fast and avoids extra desktop clutter.

## Preferences

Preferences include:

- Login at startup: backed by Tauri's real autostart plugin.
- Tool visibility: stored locally and applied to the first section. The app prevents hiding the last visible tool so the main area never becomes empty.

## Native Integration

The app registers `tauri-plugin-autostart` in Rust and exposes the required Tauri capability permissions. Exit is handled with a small native `quit_app` command so the tray app quits completely.

## Testing

The pure preference model is covered by Node's built-in test runner after TypeScript compilation. Full integration is verified with `pnpm build`, `cargo check`, `cargo test`, and `pnpm tauri dev`.
