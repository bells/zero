## 1. Contracts, Manifest, and Market Schema

- [x] 1.1 Define TypeScript contracts for `manifest.json`, `market.json`, market entries, plugin permissions, package validation reports, plugin records, lifecycle results, and host API errors.
- [x] 1.2 Define matching Rust structs for the same manifest, market, permission, validation, plugin record, and lifecycle result payloads crossing the Tauri IPC boundary.
- [x] 1.3 Add a manifest validator that checks required `name`, `version`, `author`, `main`, and `permissions` fields, plus id/name format, semantic version format, host/API ranges, entrypoint path safety, supported permissions, platforms, and contribution types.
- [x] 1.4 Add a market index validator that checks `schemaVersion`, plugin metadata, GitHub repository/release/download URLs, `.zplugin` asset shape, optional `sha256`, and permissions.
- [x] 1.5 Add fixture-based tests for valid manifests, missing fields, incompatible API versions, unsafe `main` paths, unsupported permissions, invalid market entries, and missing release asset URLs.
- [x] 1.6 Document the initial Extension API version, MVP permission vocabulary, manifest fields, and market index schema in a developer-facing reference draft.

## 2. Rust Market and Package Services

- [x] 2.1 Create a Rust market service that fetches the preset GitHub-hosted `market.json`, parses it, validates entries, and caches the last valid snapshot.
- [x] 2.2 Add Tauri commands for refreshing the plugin market and listing cached market plugins with installed-version status.
- [x] 2.3 Add a Rust package download service for GitHub Release `.zplugin` assets with timeout, error reporting, optional checksum verification, and staging-file cleanup.
- [x] 2.4 Add archive inspection/extraction utilities that reject absolute paths, parent-directory traversal, unsafe symlinks, and cross-plugin overwrites.
- [x] 2.5 Add Rust tests for successful market refresh, invalid market JSON, network/download failure handling, checksum mismatch, cache fallback, and unsafe archive rejection.

## 3. Rust Plugin Registry and Lifecycle Commands

- [x] 3.1 Create a Rust plugin registry service that resolves `~/.zero/plugins/`, loads/saves registry state, tracks plugin source, and defensively recovers from corrupt registry data.
- [x] 3.2 Seed bundled screenshot and caffeine plugin records on first launch while preserving preferences/about as protected host surfaces.
- [x] 3.3 Add Tauri commands for listing plugins, validating a local package, installing a market plugin, installing a local package, uninstalling a plugin, enabling/disabling a plugin, and restoring bundled defaults.
- [x] 3.4 Implement package extraction under `~/.zero/plugins/<plugin>/<version>/` with path traversal checks, checksum tracking, duplicate-id protection, and rollback on partial install.
- [x] 3.5 Add Rust tests for registry seeding, restart persistence, corrupt registry recovery, install validation failure, duplicate install rejection, market install success, local install success, uninstall behavior, and bundled restore behavior.

## 4. Frontend Market and Plugin Host State

- [x] 4.1 Add a typed `pluginHostService` wrapper around the new market and plugin lifecycle commands without using `any`.
- [x] 4.2 Add a plugin market hook/controller that refreshes `market.json`, exposes cached/stale/error state, and maps market entries to install cards.
- [x] 4.3 Add a plugin host hook/controller that loads registry records, tracks selected plugin, runs lifecycle actions, and surfaces structured errors.
- [x] 4.4 Refactor shell plugin navigation in `src/App.tsx` to render registry-backed plugin records instead of the compile-time `plugins` array.
- [x] 4.5 Refactor preferences visibility/settings logic from `Record<PluginId, boolean>` to dynamic plugin names/ids and plugin-owned settings.
- [x] 4.6 Update the about surface to report bundled, market-installed, local, disabled, failed, and incompatible plugin counts from registry data.
- [x] 4.7 Add frontend tests for market refresh state, plugin selection fallback, empty plugin state, dynamic visibility, disabled plugins, and registry/download error messages.

## 5. Built-in Plugin Migration

- [x] 5.1 Create bundled manifest definitions for screenshot and caffeine with stable names/ids, metadata, views, commands, permissions, platform declarations, and safe `main` values.
- [x] 5.2 Add bundled plugin renderer adapters that map screenshot and caffeine plugin records to their existing React panels.
- [x] 5.3 Preserve screenshot behavior, including platform-specific capture paths, shortcut behavior, capture window routing, copy/save, and pin windows.
- [x] 5.4 Preserve caffeine behavior, including platform-specific native keep-awake behavior, duration state, expiry, and frontend status feedback.
- [x] 5.5 Add preference migration from legacy `screenshot`/`caffeine` visibility keys to the new bundled plugin names/ids.

## 6. User Market and Lifecycle UI

- [x] 6.1 Add plugin market entry points in the main shell or preferences surface with refresh, stale cache, loading, and error states.
- [x] 6.2 Add install actions for market plugins that show release metadata, requested permissions, checksum status, and download/install progress.
- [x] 6.3 Add local `.zplugin` install entry points with package selection and validation preview.
- [x] 6.4 Add permission review UI that clearly shows requested permissions before install and cancels cleanly when permissions are declined.
- [x] 6.5 Add enable, disable, uninstall, retry, and restore-defaults actions for plugin records with status-specific affordances.
- [x] 6.6 Add user-facing diagnostics for market refresh errors, download errors, checksum mismatch, validation errors, incompatible plugins, failed activations, duplicate identities, and registry recovery.
- [x] 6.7 Verify uninstalling the selected plugin selects another plugin or shows the empty plugin state without breaking tray/main/preference navigation.

## 7. Extension Runtime and Host API Bridge

- [x] 7.1 Implement a generic extension surface for third-party plugin web views using an isolated local asset surface with strict CSP and no direct Tauri API access.
- [x] 7.2 Implement a message-based Extension API bridge that validates sender identity, enabled state, activation state, request shape, and approved permissions.
- [x] 7.3 Add initial host APIs for UI messages, plugin-scoped storage, command registration/execution, settings read/write, lifecycle diagnostics, and permission-denied errors.
- [x] 7.4 Add guarded binary/script entrypoint execution only for supported runtimes, using direct process invocation without shell-string interpolation, timeout, cancellation, and structured stdout/stderr/error reporting.
- [x] 7.5 Add failure isolation for plugin view load errors, render errors, bridge errors, activation failures, command failures, and main-entrypoint execution failures.
- [x] 7.6 Add tests or harness fixtures proving undeclared permissions are denied, unsafe `main` paths are rejected, failed plugin views do not crash the host shell, and denied binary/script execution is reported safely.

## 8. Developer Tooling and Documentation

- [x] 8.1 Add developer documentation for `manifest.json` fields, contribution points, permissions, package layout, compatibility rules, lifecycle behavior, and `.zplugin` packaging.
- [x] 8.2 Add documentation for publishing a plugin repository through GitHub Releases and adding it to the hosted `market.json`.
- [x] 8.3 Add a minimal example plugin repository/package that contributes one view, one command, and one setting through the Extension API.
- [x] 8.4 Add a local validation/package script or command path for plugin authors to check packages before release upload.
- [x] 8.5 Update README and project memory/docs to explain the Git-based market MVP, plugin protocol, install/uninstall model, and server-backed marketplace non-goals.

## 9. Verification

- [x] 9.1 Run targeted TypeScript tests for manifest validation, market index parsing, preferences migration, plugin host selection, and lifecycle UI helpers.
- [x] 9.2 Run `node --test tests/*.mjs`.
- [x] 9.3 Run `pnpm build`.
- [x] 9.4 Run `cd src-tauri && cargo check && cargo test`.
- [x] 9.5 Run `git diff --check`.
- [ ] 9.6 Manually verify in `pnpm tauri dev`: built-in plugins render, market refresh works, market install downloads/extracts a `.zplugin`, local plugin validation/install works, permission decline cancels install, checksum mismatch blocks install, disabled plugins stay inactive, failed plugin view is isolated, restore-defaults recovers bundled plugins, and tray/main/preferences/about remain usable.
