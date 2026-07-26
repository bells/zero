## Why

Zero already treats screenshot, caffeine, preferences, and about as plugin-shaped tools, but the plugin list is still compile-time and app-owned. To grow into a VS Code/Codex-style toolbox without building a complex marketplace backend too early, Zero should start with a Git-based plugin market: plugin authors publish `.zplugin` packages in GitHub Releases, and Zero reads a hosted `market.json` index to install them.

## What Changes

- Define an MVP plugin package format: a `.zplugin` archive containing a `manifest.json`, compiled plugin assets, and any declared binary/script entrypoint.
- Define the MVP manifest contract around the required fields `name`, `version`, `author`, `main`, and `permissions`, with optional display, compatibility, platform, and contribution metadata for future Extension API growth.
- Add a static Git-based market index: Zero reads a preset `market.json` hosted on the project's GitHub, where each entry points to a plugin repository and GitHub Release asset download URL.
- Add download-and-install lifecycle operations that fetch a `.zplugin` asset, validate checksum/manifest/permissions, and extract it under `~/.zero/plugins/` before registering it.
- Add lifecycle operations for local package install, market install, uninstall, enable, disable, restore bundled defaults, and failed-plugin recovery without breaking the host shell.
- Define an initial Extension API inspired by VS Code/Codex concepts, but keep the MVP runtime permissioned and host-mediated so plugin code cannot directly access unrestricted Tauri APIs.
- Preserve existing screenshot and caffeine behavior by migrating them through the same host-facing plugin contract as bundled plugins before enabling third-party plugins.

## Capabilities

### New Capabilities
- `plugin-extension-api`: Defines the manifest, entrypoint, contribution points, host API contract, permission declarations, compatibility rules, and developer packaging expectations for Zero extensions.
- `plugin-market-index`: Defines the Git-based market model, hosted `market.json` schema, GitHub Release asset metadata, refresh/cache behavior, and market-driven install flow.
- `plugin-lifecycle`: Defines discovery, package validation, install, uninstall, enable, disable, persistence, extraction into `~/.zero/plugins/`, failure isolation, and shell/preference behavior for bundled and user-installed plugins.

### Modified Capabilities
- None.

## Impact

- Frontend plugin model: `src/plugins/types.ts`, `src/App.tsx`, plugin panels/hooks, preferences visibility model, i18n keys, market/install UI, and shell navigation tests.
- New frontend host/runtime layer for market index state, plugin registry state, contribution resolution, view rendering, command dispatch, settings schema, and typed Extension API facade.
- Rust/Tauri boundary: new commands/services for market refresh, package download, checksum verification, archive extraction, manifest validation, install/uninstall file operations, registry persistence, permission checks, and plugin asset loading.
- Dependencies may be needed for HTTP downloads and archive extraction if Tauri/Rust stdlib does not cover the selected implementation cleanly.
- Tauri capabilities and window model may need additional explicit permissions for package import dialogs, market downloads, plugin assets, and any future plugin-owned windows.
- Documentation and examples: `market.json` example, `manifest.json` example, GitHub Release publishing guide, plugin package layout, built-in plugin migration notes, and verification commands.
- Verification expands beyond existing build checks to include manifest validation tests, market index parsing tests, lifecycle tests, download/install tests, migration tests for built-in plugins, and manual market install/uninstall smoke tests.
