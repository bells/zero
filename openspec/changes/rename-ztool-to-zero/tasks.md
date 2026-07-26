## 1. Lock Naming and Migration Contracts

- [x] 1.1 Add shared TypeScript naming constants and a first-party ID normalizer for `zero.launch`, `zero.snap`, `zero.awake`, and `zero.paper`, with legacy mappings limited to the four known `ztool.*` IDs.
- [x] 1.2 Add the matching Rust naming constants and first-party ID normalizer, and add mirrored tests that prove the Rust and TypeScript mappings produce the same canonical IDs.
- [x] 1.3 Add frontend RED tests for bundled display names, plugin/contribution IDs, legacy selection and visibility normalization, canonical-write behavior, and preservation of unrelated third-party IDs.
- [x] 1.4 Add Rust RED tests for legacy registry/status-bar normalization, canonical precedence, repeat-run idempotence, malformed migration input, and legacy-source retention.
- [x] 1.5 Add Rust and TypeScript contract tests for canonical `engines.zero`, legacy `engines.ztool`, canonical precedence when both exist, and incompatible version reporting.

## 2. Implement Rust Data and Identity Migration

- [x] 2.1 Add a single-purpose Rust migration service that resolves `~/.ztool` and `~/.zero`, copies missing supported data units non-destructively, writes atomically, and returns structured diagnostics.
- [x] 2.2 Migrate plugin registry records and contribution IDs to canonical first-party IDs without rewriting unknown third-party IDs or fields.
- [x] 2.3 Migrate status-bar settings and other persisted plugin-keyed state to canonical IDs while preserving canonical values when legacy and canonical keys collide.
- [x] 2.4 Migrate installed plugin packages, Zero Paper metadata/images, and Zero Launch index/usage/icon data into `~/.zero`, with a safe legacy read-through path when a unit cannot be migrated.
- [x] 2.5 Run migration before registry, status-bar, wallpaper, and launcher initialization, surface recoverable diagnostics, and verify a second startup performs no destructive work.
- [x] 2.6 Rename bundled Rust registry records, contribution IDs, launcher enablement checks, tray/status-bar IDs and icon enum naming to the canonical Zero namespace while preserving existing command payloads and actions.
- [x] 2.7 Extend Rust extension contracts and package validation with canonical `engines.zero` plus the read-only `engines.ztool` Extension API v1 alias.

## 3. Rename Build and Native Application Metadata

- [x] 3.1 Rename the Cargo package and library crate to `zero` and `zero_lib`, update binary entrypoints, integration-test imports, Cargo lock metadata, and build references.
- [x] 3.2 Rename the npm package to `zero`, refresh lockfile metadata, and update temporary compilation/output paths used by current verification commands.
- [x] 3.3 Set the visible Tauri product/window names, native window titles, tray tooltip, capability descriptions, and user-visible native errors to Zero while retaining `com.watson.ztool` unchanged as the documented upgrade identifier.
- [x] 3.4 Rename default and temporary screenshot artifacts from `ztool-*` to `zero-*`, using `zero-snap.png` as the user-visible default filename.
- [x] 3.5 Audit autostart, window labels, global shortcuts, IPC command names, and platform adapters to verify the rebrand does not change their existing functional contracts.

## 4. Rename Frontend Product and Bundled Tools

- [x] 4.1 Replace bundled frontend manifest metadata and contribution IDs with canonical Zero IDs and the display names Zero Launch, Zero Snap, Zero Awake, and Zero Paper.
- [x] 4.2 Update plugin-host selection, status-bar models/controllers, launcher startup events, accent resolution, and native action routing to consume canonical IDs and accept only the four known legacy aliases.
- [x] 4.3 Add `zero.preferences.v1` preference loading/writing with canonical-first precedence, legacy-key fallback, first-party visibility normalization, and non-deletion of `ztool.preferences.v1`.
- [x] 4.4 Update Chinese and English translations so Zero and all four exact Zero family names appear consistently while subtitles, actions, statuses, and error messages remain localized.
- [x] 4.5 Update tray, main, preferences, about, capture, pin, launcher, plugin-manager, and status-bar UI metadata/tooltips to remove current-brand ZTool and generic bundled-tool titles.
- [x] 4.6 Update affected frontend tests and fixtures to assert canonical names/IDs, legacy compatibility, unchanged typed Tauri invoke payloads, and absence of TypeScript `any`.

## 5. Update Current Documentation and Specifications

- [x] 5.1 Rename current product and tool references in `README.md`, `PRODUCT.md`, and `openspec/project.md`, including new package commands, `~/.zero` paths, `engines.zero`, and the retained bundle-identifier compatibility note.
- [x] 5.2 Update current plugin developer, protocol, publishing, feasibility, and example documentation to use Zero terminology and canonical manifest fields while documenting the bounded legacy aliases.
- [x] 5.3 Update still-active OpenSpec change artifacts whose current requirements, IDs, or remaining tasks would otherwise conflict with Zero; leave archived changes and dated historical plans intact except for broken links.
- [x] 5.4 Add a concise migration/rollback note covering canonical-wins precedence, retained `~/.ztool` and local-storage data, extension compatibility, and recovery from a partial migration.
- [x] 5.5 Run a scoped terminology audit that permits `ZTool`/`ztool` only in archived history, legacy compatibility code/tests/docs, and the retained `com.watson.ztool` identifier.

## 6. Automated and Native Verification

- [x] 6.1 Run focused TypeScript compilation and Node tests for naming, preferences, plugin host, status bar, Zero Launch, Zero Snap, Zero Awake, and Zero Paper helpers using the renamed `/private/tmp/zero-*` outputs.
- [x] 6.2 Run the complete frontend test inventory, `pnpm build`, and `git diff --check`.
- [x] 6.3 Run `cargo fmt --check`, `cargo check`, `cargo test`, and the ignored release quick-launcher benchmark under the renamed crate when performance-sensitive launcher code is touched.
- [x] 6.4 Exercise representative legacy fixtures for preferences, registry/status-bar state, installed plugins, wallpaper cache, and launcher data; verify first-run migration, canonical precedence, malformed-input diagnostics, rollback retention, and second-run no-op behavior.
- [ ] 6.5 Run `pnpm tauri dev` on macOS and smoke-test upgrade startup, tray/main/preferences/about windows, all four branded panels, Zero Launch and Zero Snap shortcuts, Zero Awake status changes, Zero Paper browse/apply entry, status-bar actions, and autostart state.
  - Validation note: `pnpm tauri dev` and a debug `Zero.app` build both launched successfully, but the menu-bar accessory process exposed no enumerable window to the available UI automation, so the full interaction matrix remains pending.
- [x] 6.6 Capture validation limits explicitly: macOS native smoke coverage does not establish Windows/Linux behavior, so record remaining platform checks before release.
  - Coverage limit: automated checks and macOS startup/build success do not establish complete macOS interaction coverage or any Windows/Linux native behavior; all three platform checks remain release gates.

## 7. Repository Rename Release Operations

- [ ] 7.1 After implementation is merged and the working tree is clean, rename the GitHub repository from `bells/ztool` to `bells/zero` and verify the old URL redirects.
- [ ] 7.2 Rename the local checkout directory to `zero`, update and verify the `origin` URL, then run the documented install/build commands from a fresh clone or renamed path.
