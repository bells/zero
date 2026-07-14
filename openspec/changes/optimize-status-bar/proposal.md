## Why

ZTool is becoming a plugin-based desktop toolbox, but the native status bar still behaves like a single app icon that only opens the tray panel. Users should be able to see the enabled tools directly in the status bar and trigger the most common plugin actions without opening the full panel.

## What Changes

- Add a Lemon-inspired status bar layout: a primary ZTool logo followed by compact icons for installed, enabled, and status-bar-visible tool plugins.
- Keep the primary ZTool logo as the app entry point that opens or toggles the tray quick panel.
- Add bundled status bar actions for:
  - Caffeine: a coffee-cup icon that is empty when inactive and full when active; clicking toggles caffeine mode using the user's configured/default duration.
  - Screenshot: a compact capture icon; clicking starts the screenshot flow directly.
- Add a status bar preferences section with an enable switch, startup/show behavior, a live arrangement preview, and per-plugin visibility controls similar to the reference settings screenshot.
- Extend plugin metadata/contributions so bundled plugins can declare status bar icons and actions now, while installed plugins can use the same contract later.
- Preserve existing screenshot, caffeine duration, tray panel, standalone main window, preferences/about, and plugin lifecycle behavior.
- Treat Lemon-style system metrics such as memory, SSD, sensor temperature, fan speed, network speed, CPU, and GPU as future plugin opportunities, not part of this change.

## Capabilities

### New Capabilities

- `status-bar-plugin-icons`: Defines the primary status bar logo, enabled plugin icon ordering, per-plugin status bar actions, stateful caffeine cup icon behavior, screenshot direct-capture behavior, and status bar display preferences.

### Modified Capabilities

- `main-window-shell`: Clarifies that the primary status bar logo continues to toggle the tray quick panel while plugin sub-icons perform direct plugin actions, and that preferences expose status bar visibility controls without breaking the existing tray/main/preferences/about surfaces.

## Impact

- Frontend plugin host contracts: plugin contribution metadata for status bar actions, icon identity, ordering, enabled/visible filtering, and action dispatch.
- Frontend UI: tray quick panel header/action area, preferences status bar section, preview component, i18n strings, and tests for status bar visibility normalization.
- Caffeine plugin: status bar controller/adapter that maps current backend state to empty/full cup icon state and calls the existing `toggle_keep_awake` command.
- Screenshot plugin: status bar controller/adapter that calls the existing `start_screenshot` command with the same default capture behavior as the global shortcut.
- Rust/Tauri shell: native tray/status-item setup, icon asset loading or generated tray images, event routing for primary logo and plugin icons, and cross-platform fallback behavior where multiple status items are not practical.
- Tauri capabilities/config: keep window labels and native commands aligned with tray, main, preferences, capture, and pin windows.
- Verification: OpenSpec validation, focused TypeScript tests for preferences/plugin metadata, Rust tests for tray action routing where practical, full build/check commands, and manual `pnpm tauri dev` inspection of the real status bar flow.
