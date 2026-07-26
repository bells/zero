## 1. Contracts and Models

- [x] 1.1 Define TypeScript status bar contracts for settings snapshots, update inputs, item snapshots, status bar contribution metadata, icon ids, and action types without using `any`.
- [x] 1.2 Define matching Rust structs for status bar settings, update inputs, item snapshots, contribution metadata, icon ids, and action types crossing the Tauri IPC boundary.
- [x] 1.3 Add pure TypeScript status bar model helpers for filtering installed/enabled/visible plugin items, sorting items deterministically, and building the preferences preview model.
- [x] 1.4 Add tests for TypeScript status bar model helpers, including bundled defaults, hidden items, disabled plugins, generic extension items, and stable ordering.

## 2. Rust Native Status Bar Service

- [x] 2.1 Create `src-tauri/src/services/status_bar.rs` with native-readable persisted settings, defaults, validation, app-config path resolution, load/save behavior, and corrupt-file recovery.
- [x] 2.2 Add status bar icon assets or generated images for the primary Zero logo, screenshot item, caffeine empty cup, caffeine full cup, and generic extension fallback.
- [x] 2.3 Implement native status item normalization from plugin registry records plus status bar settings, preserving the primary logo and hiding disabled or preference-hidden plugin items.
- [x] 2.4 Implement macOS multi-item native tray/status-bar refresh and a safe non-macOS fallback model that keeps plugin actions available in the tray quick panel.
- [x] 2.5 Route native status item clicks for primary logo toggle, caffeine toggle, screenshot start, and generic open-plugin behavior without exposing raw native events to plugin code.
- [x] 2.6 Refresh native status item icons after caffeine toggle, caffeine expiry, settings updates, plugin lifecycle changes, and app startup.
- [x] 2.7 Register `StatusBarState`, status bar commands, and any required Tauri permissions/capabilities without breaking existing tray, main, preferences, capture, or pin windows.
- [x] 2.8 Add Rust tests for settings defaults, invalid settings recovery, item filtering/order, action routing decisions, and caffeine icon state mapping.

## 3. Frontend Service, Preferences, and Preview

- [x] 3.1 Add a typed frontend `statusBarService` wrapper around `get_status_bar_settings`, `update_status_bar_settings`, and `get_status_bar_items`.
- [x] 3.2 Add a focused hook/controller for loading status bar settings/items, applying optimistic-safe updates, surfacing errors, and refreshing after plugin lifecycle changes.
- [x] 3.3 Add a preferences status bar section with enable/show controls, Lemon-style compact preview, and per-plugin item checkboxes.
- [x] 3.4 Add a fallback plugin action row in the tray quick panel for platforms where native multi-item status bar rendering is unavailable.
- [x] 3.5 Add zh-CN and en-US i18n strings for status bar settings, item labels, tooltips, errors, and preview content.
- [x] 3.6 Add frontend tests for settings updates, preview filtering, fallback action row rendering, and preferences error states.

## 4. Plugin Adapters and Actions

- [x] 4.1 Extend plugin contribution contracts and bundled plugin manifests with status bar item metadata for screenshot and caffeine.
- [x] 4.2 Implement the caffeine status bar adapter so inactive state uses an empty cup, active state uses a full cup, click enables with the configured/default duration, click while active disables, and failed enable does not show active state.
- [x] 4.3 Implement the screenshot status bar adapter so clicking the icon starts the screenshot flow with the same default behavior as the global shortcut and preserves existing platform errors.
- [x] 4.4 Implement generic plugin status item behavior that opens a Zero surface with the plugin selected when no approved native action exists.
- [x] 4.5 Ensure plugin disable/uninstall/restore-defaults updates native status items and preferences preview consistently.

## 5. Verification and Documentation

- [x] 5.1 Run `openspec validate "optimize-status-bar"` and fix any proposal/spec/task structure issues.
- [x] 5.2 Run focused TypeScript compile/tests for the new status bar model and preferences helpers.
- [x] 5.3 Run `node --test tests/*.mjs`.
- [x] 5.4 Run `pnpm build`.
- [x] 5.5 Run `cd src-tauri && cargo check && cargo test`.
- [x] 5.6 Run `git diff --check`.
- [ ] 5.7 Manually verify in `pnpm tauri dev` on macOS: primary logo toggles tray, plugin icons appear after it, caffeine cup toggles full/empty, screenshot icon starts capture, preferences preview updates native icons, and hidden/disabled plugins disappear.
  - Partial macOS verification: `corepack pnpm tauri dev` launched after sandbox escalation; primary `Z` icon toggled the tray quick panel; native visual order was corrected to `Z` then plugin icons; caffeine click was verified to start `caffeinate` before the final primary icon polish. Remaining screenshot-click and preferences-hide/disable manual checks were interrupted by escalation quota.
- [x] 5.8 Manually verify fallback behavior on non-macOS or document the unverified platform limitation if no target machine is available.
  - Limitation: no Windows/Linux target was available in this session; fallback behavior is covered by `statusBarModel`/`statusBarController` tests and remains manually unverified on non-macOS.
