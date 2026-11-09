## Context

The confirmed menu structure is recorded in proposal.md. Tauri 2.11 supplies default macOS menus, while Zero already owns revisioned main navigation, a resolved-language IPC channel, plugin registry notifications and application-wide shutdown cleanup. Snap uses a React annotation history alongside native text editing.

## Goals / Non-Goals

Implement the confirmed application menu through a Rust host coordinator with existing Tauri menu/opener dependencies. Preserve plugin ownership, window routing, caller checks, saved preferences and background lifecycles. Windows retains its current navigation surfaces.

## Decisions

- Add a macOS-only native adapter with a testable menu model. Build menus on the event thread and cache their language/tool signature. Registry notifications and the existing language command request refreshes, reading current state when each queued refresh executes. This prevents worker-thread UI work and stale queued snapshots.
- Tools use enabled Ready/Active registry records and display names. Revalidate availability on activation. Existing open_main_tool handles creation and retained navigation. A requested hidden tool is temporarily available in the main window without changing saved visibility.
- Expose a native preferences helper alongside the existing command. About, settings, main and quit menu actions call existing host entry points. Centralize the existing public support URLs for About and Help.
- Use native predefined cut/copy/paste/select-all and window/hide/services actions. Custom undo/redo items emit a typed action only to the focused first-party window. The host frontend offers the action to the current editor, then falls back to browser text undo/redo. Snap consumes actions when its canvas owns focus, preserving its own busy/composition guards.
- Undo/redo use a narrow synchronous AppKit target so they execute during native modal loops. Each menu item retains its target through representedObject. The target opts into worksWhenModal and routes native dialogs directly through the responder chain before querying Tauri windows. Window and Help submenus use Tauri's reserved IDs. System-added items follow the operating system's own language.
- Keep the existing language IPC command and its String argument. The new Rust-to-TS editing payload is `{ action: "undo" | "redo" }`. Register listeners outside the isolated File engine and dispose them on unload.
- Use the OpenSpec tasks as the implementation plan, following the repository's SDD convention. Implement inline on codex/refine-native-app-menu, with no additional approval round because the maintainer has approved the design and requested implementation.

## Risks / Trade-offs

- Native menu focus and WebKit text history require real macOS acceptance. Run the app and check text inputs, Snap, settings, window actions and background residency.
- Plugin changes may arrive from workers. Queue refreshes on the event thread, compare current signatures there, and report failures through existing diagnostics with fixed metadata.
- Initial language is resolved by the existing shell preference load. Repeated identical language updates and tool-state changes must avoid rebuilding unchanged menus.
- macOS may add system-managed Help search and window entries. Preserve native submenu registration.
- Windows source/profile checks and actual Windows device acceptance are recorded separately.

## Migration Plan

No data migration or dependency installation is required. The host installs the custom menu during macOS setup. Rollback removes menu registration and restores Tauri's default behavior.
