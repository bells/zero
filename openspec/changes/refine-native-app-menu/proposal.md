## Why

macOS currently exposes Tauri's default English application menus, including redundant File/View groups and an empty Help group. The maintainer confirmed a compact native menu structure and platform-specific Windows behavior in the 2026-11-09 grilling discussion.

## What Changes

- Provide macOS Zero, Tools, Edit, Window and Help menus localized with Zero's resolved language.
- Reuse the main-window navigation, preferences, About and application shutdown flows. Tools list enabled, available plugins and open their main-window pages.
- Preserve native editing and focused-window actions, Cmd+Comma settings, Cmd+W close and Cmd+Q quit. Closing a window preserves background operation.
- Windows continues using its existing in-window navigation and tray entry points.

## Capabilities

### New Capabilities

- `native-app-menu`: Localized macOS application menus, live tool availability, native focus behavior and platform boundaries.

### Modified Capabilities

None.

## Impact

Rust host menu coordination, app-window navigation helpers, registry change publication and native language synchronization. Existing IPC names and wire formats are retained. Uses Tauri 2 menu APIs and existing opener support without new dependencies. Overlaps with navigation/preferences/About changes only through their existing entry points, leaving their historical acceptance records intact.
