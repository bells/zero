## Why

The current `ZTool` name and generic tool labels do not express a cohesive product family, while the same legacy name is embedded across user-facing copy, package metadata, plugin namespaces, and persisted data. Renaming the product to **Zero** and the four bundled tools to a consistent **Zero …** family creates a clearer identity and requires an explicit compatibility plan so existing users do not lose settings, plugin state, or cached data.

## What Changes

- Rename the user-facing application identity from `ZTool`/`ztool` to `Zero`/`zero` across the React UI, native windows and tray, application metadata, package/binary names, documentation, examples, and verification paths.
- Rename the four bundled tools everywhere they are presented to users:
  - Quick Launcher becomes **Zero Launch**.
  - Screenshot becomes **Zero Snap**.
  - Caffeine becomes **Zero Awake**.
  - Bing Wallpaper becomes **Zero Paper**.
- Replace mutable first-party technical namespaces such as `ztool.*`, `ztool_lib`, `~/.ztool`, and `ztool.preferences.v1` with their `zero` equivalents.
- Retain the existing Tauri bundle identifier `com.watson.ztool` as an immutable upgrade identity so operating-system permissions, WebView storage, and installed-app continuity survive the rebrand; this compatibility exception is documented and is not shown as the product name.
- Add a one-time, idempotent migration for existing preferences, plugin registry/status-bar state, wallpaper and launcher data, and installed plugin packages from the legacy `ztool` locations and identifiers.
- Preserve compatibility when reading legacy first-party plugin IDs and legacy extension manifest host declarations, while writing only canonical `zero` identifiers after migration.
- Update product/OpenSpec documentation and active change artifacts that describe the current application, while retaining archived historical change records as historical evidence.
- **BREAKING**: The built application/package name, Rust crate name, canonical plugin namespace, extension host manifest key, and default local data directory change from `ztool` to `zero`; compatibility aliases and data migration soften the runtime impact, but downstream build scripts or integrations that import or match the old identifiers must be updated.

## Capabilities

### New Capabilities

- `zero-brand-identity`: Defines the Zero product identity, canonical names for all four bundled tools, technical namespace migration, legacy compatibility, and persisted-data continuity.

### Modified Capabilities

- `main-window-shell`: Renames the app-shell identity and user-facing shell actions from ZTool to Zero without changing the existing tray, window-routing, preferences, about, or plugin-host behavior.

## Impact

- Frontend: application shell, preferences/about translations, bundled plugin manifests, status-bar model, plugin host validation, local-storage migration, tests, and visual labels.
- Rust/Tauri: Cargo package/library names, Tauri product/window/bundle identifiers, tray IDs and tooltips, first-party plugin registry IDs, local data paths, screenshot filenames, extension contracts, migration logic, and native tests.
- Compatibility: existing `~/.ztool` data, `ztool.preferences.v1`, registry/status-bar records keyed by `ztool.*`, `engines.ztool`, autostart registration, and the intentionally retained `com.watson.ztool` OS identity.
- Documentation: README, product/project context, plugin authoring/publishing guides, examples, and still-active OpenSpec changes; archived plans and archived changes remain unchanged unless a link would otherwise become invalid.
- Dependencies: no new runtime library is expected; migration should use existing filesystem, JSON, and local-storage facilities.
