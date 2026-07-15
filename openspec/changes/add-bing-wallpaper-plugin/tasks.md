## 1. Contracts, fixtures, and dependency gate

- [x] 1.1 Add Bing API success, missing-field, partial-result, invalid-URL, and malformed-response fixtures for Rust parser and cache tests.
- [x] 1.2 Define symmetric Rust and TypeScript contracts for normalized wallpaper items, snapshots, previews, action inputs/results, platform capability, and structured errors using the same camelCase wire fields.
- [x] 1.3 Add Rust/TypeScript contract tests that reject malformed payloads and verify stable serialization for wallpaper IDs, dates, cached state, error codes, and retryability.
- [x] 1.4 Run a focused `wallpaper = "3.2"` compatibility spike against the current Rust toolchain and macOS/Windows targets, record license/maintenance findings, and confirm or replace the adapter dependency before production code depends on it.
- [x] 1.5 Create the `commands/bing_wallpaper.rs`, `services/bing_wallpaper.rs`, `services/wallpaper.rs`, and `src/plugins/bingWallpaper/` module skeletons without mixing UI, IPC, cache, and platform responsibilities.

## 2. Permissioned native resource APIs

- [x] 2.1 Add `system.wallpaper` to Rust and TypeScript permission unions, manifest validators, registry persistence, permission-review UI, fixtures, and developer protocol documentation.
- [x] 2.2 Extend the Extension API request/response types and permission dispatch for `network.fetch`, `storage.writeFile`, and `system.setWallpaper`, preserving plugin identity and enabled-state checks.
- [x] 2.3 Implement a Rust host-network service that allows bounded HTTPS requests only under plugin host policy, enforces method/timeout/redirect/size limits, and rejects loopback, private-network, disallowed-host, and cross-protocol destinations.
- [x] 2.4 Implement plugin-scoped binary storage with normalized relative paths, quota checks, temporary writes, atomic replacement, and protection against absolute paths, traversal, unsafe separators, and symlink escape.
- [x] 2.5 Route `system.setWallpaper` through the wallpaper service only for validated images inside the calling plugin's data root, and return structured unsupported-platform or operation errors.
- [x] 2.6 Add Extension Bridge and Rust tests for allowed calls, undeclared/unapproved permissions, disabled plugins, identity mismatch, malformed payloads, unsafe URLs, oversized responses/writes, and path escape attempts.

## 3. Bing metadata and cache service

- [x] 3.1 Implement pure Bing archive parsing and normalization for `startdate`, `title`, `copyright`, `copyrightlink`, `url`/`urlbase`, and `hsh`, including conservative title fallback without altering original attribution.
- [x] 3.2 Implement the `~/.ztool/data/wallpaper/` resolver and versioned `index.json` loader that accepts only valid relative cache files and skips corrupt entries without failing the whole plugin.
- [x] 3.3 Implement deterministic merge, stable-ID deduplication, newest-first sorting, selection-independent metadata, 10-entry retention, and cleanup that deletes only obsolete index-owned files.
- [x] 3.4 Implement the Bing metadata request for `mkt=zh-CN`, validate trusted HTTPS hosts/paths, and preserve usable cached data with a stale snapshot when refresh fails.
- [x] 3.5 Implement bounded image downloads with selected-item priority, at most two concurrent transfers, `.part` staging, content/decoder validation, atomic activation, and isolated per-item failure reporting.
- [x] 3.6 Coalesce simultaneous refreshes from tray and main windows in `BingWallpaperState` and ensure index writes cannot race or leave a partially written file.
- [x] 3.7 Implement on-demand preview loading that returns only the selected validated image as a bounded data URL instead of embedding all images in the snapshot.
- [x] 3.8 Add temporary-directory and injected-fetcher tests for cache-first load, fewer-than-10 responses, partial downloads, duplicate records, corrupt index recovery, retention cleanup, unknown-file preservation, and concurrent refresh.

## 4. Wallpaper apply and Downloads actions

- [x] 4.1 Define the `WallpaperSetter` adapter and implement the selected crate/platform backend without `unwrap`, shell-string interpolation, or network behavior inside the dependency.
- [x] 4.2 Implement apply-by-wallpaper-ID so a missing cache image is downloaded and validated first, the canonical path remains under the wallpaper root, and backend errors do not produce false success.
- [x] 4.3 Implement platform capability reporting for macOS, Windows, and supported Linux environments, with explicit `platform_unsupported` and `dependency_missing` results where appropriate.
- [x] 4.4 Implement save-to-Downloads using the Tauri path resolver, sanitized date-based filenames, collision-free suffixes, and source validation against the cache index.
- [x] 4.5 Add service tests with fake wallpaper setters and temporary download directories for successful apply/save, missing cache download, path rejection, filename collisions, unavailable destination, unsupported platform, and backend failure.

## 5. Tauri IPC boundary

- [x] 5.1 Add thin commands for cached snapshot, remote refresh, selected preview, save to Downloads, and apply wallpaper, each returning the typed result/error contract.
- [x] 5.2 Register `BingWallpaperState`, commands, service modules, and any required Tauri capabilities in `src-tauri/src/lib.rs` and module exports without exposing internal filesystem commands to plugin WebViews.
- [x] 5.3 Implement `bingWallpaperService.ts` with typed `invoke` wrappers and a single payload-construction boundary for `wallpaperId`.
- [x] 5.4 Add IPC-focused tests that verify command names, input casing, Rust serialization, TypeScript interfaces, structured failures, and no direct WebView access to unrestricted Tauri commands.

## 6. Frontend state and lifecycle

- [x] 6.1 Implement pure `bingWallpaperModel.ts` helpers for newest-first ordering, default selection, stable-ID selection preservation, older/newer boundary navigation, and empty/single-item states.
- [x] 6.2 Add Node tests for every navigation direction and boundary, selection after refresh/reorder/removal, fallback metadata, and action availability from cached state.
- [x] 6.3 Implement `useBingWallpaper` to load cache first, refresh in the background, fetch previews on selection, and expose separate loading/refreshing/preview/saving/applying/error states without nested async control flow.
- [x] 6.4 Guard hook disposal and request replacement so stale completions cannot update an unmounted or newly selected view, and release the prior in-memory preview reference while retaining disk cache.
- [x] 6.5 Add controller-level tests for cache-first sequencing, stale refresh errors, duplicate action prevention, retry, selection changes during preview load, and disposal behavior.

## 7. Plugin registration and card UI

- [x] 7.1 Add the `ztool.bing-wallpaper` bundled manifest with short ID `bing-wallpaper`, author `bells`, `webview` runtime, view/command contributions, desktop platforms, and `network`, `storage.plugin`, `system.wallpaper` permissions.
- [x] 7.2 Seed and restore the Bing record through the Rust registry, add it to the bundled renderer mapping, and preserve generic plugin navigation plus preference visibility/enable behavior.
- [x] 7.3 Implement `BingWallpaperPanel` with header title; separate download, apply, older, and newer actions; 16:9 rounded preview; primary title/location text; and secondary copyright text.
- [x] 7.4 Make thumbnail activation equivalent to apply, add accessible labels/titles, visible focus, disabled/busy states, success/error feedback, and keyboard parity for every action.
- [x] 7.5 Add responsive tray/main-window styles that keep the side-by-side card compact at normal width and reflow without horizontal overflow at narrow widths, including reduced-motion handling.
- [x] 7.6 Add zh-CN and en-US plugin metadata, action, loading, stale, empty, success, platform, network, save, and apply translations with i18n coverage.
- [x] 7.7 Extend bundled-plugin, registry, shell navigation, preference normalization, permission display, and i18n tests for the third bundled tool without regressing screenshot or caffeine.

## 8. Documentation and verification

- [x] 8.1 Update README and plugin developer/protocol documentation with Bing wallpaper behavior, cache location, retention policy, permissions, Bridge methods, platform support, and the decision not to introduce a WASM runtime.
- [x] 8.2 Run focused TypeScript compilation and Node tests for wallpaper contracts/model/service plus plugin-host permission and bridge changes.
- [x] 8.3 Run `node --test tests/*.mjs`, `pnpm build`, `cargo fmt --check`, `cargo check`, `cargo test`, and `git diff --check`, fixing all regressions without staging unrelated status-bar work.
- [x] 8.4 Run or add Windows CI coverage for the selected wallpaper backend, permission contracts, cache service, and compile-time platform branches; document Linux desktop environments that were actually verified.
- [x] 8.5 Run `pnpm tauri dev` and manually verify first load, cache-first reopen, online refresh, offline stale mode, fewer-than-10 behavior, older/newer boundaries, attribution, download collision handling, real wallpaper apply/failure feedback, keyboard focus, and tray/main-window layouts; restore the tester's original wallpaper afterward.
- [x] 8.6 Inspect `~/.ztool/data/wallpaper/` after refresh/restart to verify atomic index persistence, no `.part` leaks, 10-entry retention, and preservation of unknown files.
- [x] 8.7 Run `openspec validate "add-bing-wallpaper-plugin"` and confirm `openspec status --change "add-bing-wallpaper-plugin"` reports all implementation prerequisites complete.
