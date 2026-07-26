## Context

Zero currently creates one native tray/status item in `src-tauri/src/lib.rs`. Clicking that item toggles the `tray` WebView and the tray panel then renders plugin cards from the registry-backed `usePluginHost()` data. The main window, preferences, about, screenshot capture, pin windows, and caffeine commands are already separated across React surfaces and Rust commands/services.

The requested status bar shape is closer to Lemon/KeepYouAwake: the menu bar itself should show a primary app mark followed by compact tool marks. That crosses the React/Rust boundary. React can render the preferences UI and preview, but Rust must own native status item creation, click events, and startup restoration.

## Goals / Non-Goals

**Goals:**

- Show a primary Zero status item followed by installed, enabled, status-bar-visible plugin items.
- Keep the primary Zero item responsible for toggling the tray quick panel.
- Make caffeine a stateful status item: empty cup when inactive, full cup when active, click to toggle.
- Make screenshot a direct status item: click to enter the screenshot flow.
- Add a Lemon-inspired preferences section with enable/show controls, arrangement preview, and per-plugin visibility.
- Keep Rust/TypeScript contracts explicit and symmetric, with no TypeScript `any`.
- Preserve the existing plugin host, screenshot, caffeine duration, tray/main/preferences/about, and extension lifecycle behavior.

**Non-Goals:**

- Adding Lemon-style hardware/system metrics such as memory, SSD, CPU temperature, fans, network, CPU, or GPU.
- Replacing the tray quick panel or standalone main window.
- Rewriting screenshot capture/editor behavior.
- Rewriting caffeine duration/session behavior beyond the one-click status bar entry point.
- Giving third-party plugins unrestricted native status bar execution.

## Decisions

### Decision 1: Rust owns native status bar items; React owns settings and preview

Add a Rust `status_bar` service that owns the native item model, persisted status bar preferences, item click routing, and icon selection. Add thin Tauri commands under `src-tauri/src/commands/status_bar.rs` for React to read/update preferences and refresh the native layout.

Rust-facing commands:

```rust
#[tauri::command]
pub fn get_status_bar_settings(
    state: tauri::State<'_, StatusBarState>,
) -> Result<StatusBarSettingsSnapshot, String>;

#[tauri::command]
pub fn update_status_bar_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, StatusBarState>,
    input: UpdateStatusBarSettingsInput,
) -> Result<StatusBarSettingsSnapshot, String>;

#[tauri::command]
pub fn get_status_bar_items(
    app: tauri::AppHandle,
    state: tauri::State<'_, StatusBarState>,
) -> Result<Vec<StatusBarItemSnapshot>, String>;
```

Frontend calls go through a typed service:

```ts
export interface StatusBarSettingsSnapshot {
  enabled: boolean;
  showPluginItemsOnLaunch: boolean;
  visiblePluginItems: Record<string, boolean>;
}

export interface UpdateStatusBarSettingsInput {
  enabled?: boolean;
  showPluginItemsOnLaunch?: boolean;
  visiblePluginItems?: Record<string, boolean>;
}

export const statusBarService = {
  getSettings(): Promise<StatusBarSettingsSnapshot> {
    return invoke<StatusBarSettingsSnapshot>("get_status_bar_settings");
  },
  updateSettings(input: UpdateStatusBarSettingsInput) {
    return invoke<StatusBarSettingsSnapshot>("update_status_bar_settings", { input });
  },
};
```

Rationale: status bar layout must be restored before or without a visible WebView. Keeping this preference in frontend `localStorage` would make startup state dependent on React loading.

Alternatives considered:

- Keep all status bar settings in localStorage and let React send updates after startup. This is simpler but causes flicker and stale native layout after launch.
- Render fake icons only inside the tray panel. This would not satisfy the menu-bar/status-bar goal.

### Decision 2: Model status bar items as plugin contributions with bundled native handlers first

Extend plugin contribution metadata with a status bar item contribution:

```ts
export interface PluginContributionStatusBarItem {
  id: string;
  title: string;
  icon: "zero" | "caffeine-empty" | "caffeine-full" | "screenshot" | "extension";
  action: {
    type: "toggle-tray" | "toggle-caffeine" | "start-screenshot" | "open-plugin";
    commandId?: string;
  };
  order?: number;
  visibleByDefault?: boolean;
}
```

The Rust contract mirrors this shape for native item construction. Bundled adapters provide precise actions:

- `zero.awake`: `toggle-caffeine`, icon changes from empty cup to full cup based on `CaffeineSnapshot.enabled`.
- `zero.snap`: `start-screenshot`, using the same default action as the global shortcut.
- Generic enabled plugins: default to `open-plugin`, which opens the tray panel or standalone main window with that plugin selected.

Rationale: every installed/enabled tool can receive a sub-logo, while native-sensitive actions remain host-mediated. Third-party plugins do not get raw tray event access.

Alternatives considered:

- Hard-code only screenshot and caffeine icons. This is fastest but conflicts with the plugin toolbox direction.
- Let each plugin create native tray items directly. This breaks the Tauri security boundary and makes status bar ordering/preferences impossible to control centrally.

### Decision 3: Use a deterministic native layout with a cross-platform fallback

On macOS, create separate status items in this order:

1. Primary Zero logo.
2. Enabled plugin items sorted by status bar order and plugin host order.

When the platform cannot provide a polished multi-item status bar experience, keep the primary tray icon and expose the same plugin actions in the tray quick panel/action row. The user-facing preferences and item model remain the same so Windows/Linux can improve later without a data migration.

Rationale: the reference screenshot is a macOS menu bar pattern. Windows/Linux system tray behavior differs enough that duplicating multiple native icons may be noisy or inconsistent.

Alternatives considered:

- Force multiple tray icons on every desktop platform. This may produce clutter and platform-specific failures.
- Make this macOS-only. That hides useful plugin actions from other platforms and complicates shared settings.

### Decision 4: Persist status bar settings in a small Rust-owned store

Add a `StatusBarSettings` JSON file under the app config directory, separate from current frontend preferences:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusBarSettings {
    pub enabled: bool,
    pub show_plugin_items_on_launch: bool,
    pub visible_plugin_items: std::collections::HashMap<String, bool>,
}
```

Defaults:

- `enabled: true`
- `show_plugin_items_on_launch: true`
- bundled screenshot and caffeine visible by default
- unknown enabled plugins visible by default unless the user hides them

The primary Zero logo remains available while the app is running so users can recover preferences; the `enabled` flag controls plugin sub-items rather than removing every possible app entry point.

Rationale: native startup needs a Rust-readable source of truth. Separating this from existing `visibleTools` avoids a broad preferences migration while still making status bar display configurable.

Alternatives considered:

- Migrate all preferences to Rust now. This is cleaner long-term but too large for this focused change.
- Store status bar settings in the plugin registry. Registry lifecycle and user display preferences have different responsibilities.

### Decision 5: Refresh native icons from backend state changes

The caffeine status item updates after `toggle_keep_awake`, `get_caffeine_state`, expiry, and manual disable paths. The status bar service should expose a small refresh function that recomputes snapshots and updates native icons after actions complete.

Zero Snap click routes directly to `services::screenshot::start_screenshot_session(app, "copy".into())`, matching the current global shortcut default. If the platform returns unsupported or permission errors, the item remains visible and the next tray panel open can show the captured error state.

Rationale: stateful icon accuracy matters for a KeepYouAwake-like caffeine affordance, but the existing native services should stay the source of truth.

Alternatives considered:

- Let React poll and update caffeine icon state. This fails when the panel is closed and duplicates backend session logic.
- Make screenshot status item open the screenshot panel first. The request asks for direct screenshot entry, and the global shortcut already proves the direct path.

## Risks / Trade-offs

- [Risk] Multiple native status items behave differently across desktop platforms -> Mitigation: implement the full multi-item layout for macOS first and provide an action-row fallback elsewhere.
- [Risk] Rust-owned status bar settings drift from frontend visibility settings -> Mitigation: keep the concepts separate in copy and data names: plugin enabled state controls availability, status bar settings control status item display.
- [Risk] Zero Awake icon becomes stale after timer expiry -> Mitigation: refresh status items from `expire_if_current` and after every toggle/state command.
- [Risk] Third-party plugin status items could imply native permissions they do not have -> Mitigation: default generic plugin items open the plugin surface; only host-approved action types run native behavior.
- [Risk] Icon assets look blurry or inconsistent in the menu bar -> Mitigation: use template-friendly monochrome status bar PNGs at appropriate sizes and verify on real macOS menu bar.
- [Risk] Preferences preview diverges from native layout -> Mitigation: generate preview rows from the same normalized item snapshots used by native layout.

## Migration Plan

1. Add shared TypeScript/Rust contracts for status bar settings, item snapshots, status bar contribution metadata, action types, and error states.
2. Add Rust `status_bar` service/state with persisted settings, default migration, item normalization, icon asset loading, and native item refresh.
3. Add native click routing for primary Zero, caffeine toggle, screenshot start, and generic open-plugin behavior.
4. Add typed frontend service/hook for reading/updating status bar settings and item snapshots.
5. Add a preferences status bar section with enable/show switches, arrangement preview, and per-plugin item controls.
6. Update bundled plugin manifests/adapters with status bar item contributions and icon metadata.
7. Add tests for settings normalization, item filtering/order, icon state mapping, and action payload construction.
8. Manually verify real menu bar behavior in `pnpm tauri dev`.

Rollback strategy: if multi-item status bar behavior is unstable, keep the primary Zero tray item and disable plugin sub-items through persisted status bar settings. Existing tray/main/preferences/screenshot/caffeine behavior remains intact.

## Open Questions

- Should the screenshot status item always use the current global-shortcut default action (`copy`), or should preferences later allow defaulting to save/pin?
- Should generic third-party plugin status items open the tray quick panel or the standalone main window by default?
- Should status bar item ordering eventually become user-draggable, or is plugin host order enough for v1?
