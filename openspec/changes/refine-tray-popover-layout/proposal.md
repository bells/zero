## Why

The tray footer consumes space needed by plugin controls, while popovers and grouped status-bar menus do not consistently identify the icon that opened them. The maintainer approved a compact header, icon-following popover carets and consistent rightward menu placement after reviewing reference screenshots.

## What Changes

- Move Preferences and About into icon buttons beside the tool count, and Open Zero into a separate button at the right end of the tool navigation row.
- Remove the tray footer and its quit entry, giving the recovered height to plugin content within the existing 400 × 500 window.
- Add attached top carets to the macOS Zero and Paper popovers, aligned with their actual triggering cells even when the window is shifted at a screen edge.
- Position every macOS grouped status-bar context menu below its own cell, expanding rightward and adjusting left when necessary to fit the screen.
- Apply the shared header layout on Windows, with platform-native tray menu placement.

## Capabilities

### New Capabilities

- `tray-popover-presentation` defines the compact system-action layout, anchored carets and consistent grouped-menu placement.

### Modified Capabilities

- `main-window-shell` replaces the footer requirement with top actions and routes the quit scenario through the native context menu.

## Impact

React tray shell, Paper wrapper, host window placement and typed placement snapshots, macOS status-bar menus, existing geometry tests and desktop verification. Reuses Lucide and Tauri APIs already installed. Coordinates with the active `open-tool-surfaces-from-status-bar`, `refine-tray-and-workspace-navigation`, and `compact-and-collapse-status-bar-items` changes.
