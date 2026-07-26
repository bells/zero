## Context

The product currently uses `ZTool` as both a visible brand and a technical namespace. The name appears in React translations and plugin labels, Tauri window/tray metadata, npm and Cargo packages, the Rust library crate, first-party plugin and contribution IDs, extension compatibility fields, persistent paths under `~/.ztool`, the `ztool.preferences.v1` local-storage key, generated filenames, tests, and documentation.

The four bundled tools already have clean domain boundaries: `quickLauncher`, `screenshot`, `caffeine`, and `bingWallpaper` on the frontend, with corresponding Rust commands and services. Their behavior does not need to change for the rebrand. The design therefore separates mutable brand identity from domain implementation names and from the one immutable OS identity that must remain stable for upgrades.

## Goals / Non-Goals

**Goals:**

- Present **Zero** as the only current product brand in end-user surfaces.
- Present the bundled tools consistently as **Zero Launch**, **Zero Snap**, **Zero Awake**, and **Zero Paper**.
- Rename mutable build/package metadata and first-party technical namespaces to `zero`.
- Preserve existing preferences, plugin state, installed extensions, wallpaper data, launcher usage/index data, autostart behavior, and OS permissions during an upgrade.
- Keep Rust/TypeScript contracts symmetrical while supporting a bounded legacy-read compatibility path.
- Make the rename verifiable with focused migration tests, existing automated checks, and native UI smoke checks.

**Non-Goals:**

- Redesigning the Zero logo, color system, layouts, icons, or interaction model.
- Changing screenshot, keep-awake, wallpaper, quick-launcher, plugin-market, or status-bar behavior.
- Renaming domain-oriented source folders, commands, Rust modules, or types merely because their implementation names differ from their marketed tool names.
- Rewriting archived OpenSpec changes or historical plans whose old names accurately describe history.
- Adding a new migration dependency or a general-purpose migration framework.

## Decisions

### 1. Use one canonical naming matrix

All implementation and review work uses the following matrix:

| Surface | Legacy | Canonical |
| --- | --- | --- |
| Product display name | ZTool / ztool | Zero / zero |
| Quick-launcher display name | Quick Launcher / 快速启动 | Zero Launch |
| Screenshot display name | Screenshot / 截图工具 | Zero Snap |
| Caffeine display name | Caffeine / 咖啡因模式 | Zero Awake |
| Bing wallpaper display name | Bing Wallpaper / Bing 壁纸 | Zero Paper |
| npm/Cargo package | `ztool` | `zero` |
| Rust library crate | `ztool_lib` | `zero_lib` |
| First-party plugin IDs | `ztool.quick-launcher`, `ztool.screenshot`, `ztool.caffeine`, `ztool.bing-wallpaper` | `zero.launch`, `zero.snap`, `zero.awake`, `zero.paper` |
| Extension host key | `engines.ztool` | `engines.zero` |
| App data root | `~/.ztool` | `~/.zero` |
| Frontend preference key | `ztool.preferences.v1` | `zero.preferences.v1` |
| Default screenshot filename | `ztool-capture.png` | `zero-snap.png` |

Contribution IDs derive from the canonical plugin ID, for example `zero.snap.capture`, `zero.awake.toggle`, and `zero.paper.apply`. Internal implementation symbols such as `start_screenshot`, `CaffeineSnapshot`, `bing_wallpaper`, and `quick_launcher` remain domain-oriented.

Rationale: one table prevents partial renames and makes exact contract tests straightforward. Keeping domain implementation names avoids a broad, cosmetic refactor that would make future feature work harder to trace.

Alternative considered: change only visible labels and leave every internal `ztool` string. This minimizes edits but leaves the package, extension protocol, and new project documentation with contradictory identities.

### 2. Retain `com.watson.ztool` as the stable OS upgrade identity

Tauri `productName`, window titles, process/package names, tray tooltip, and visible application strings become Zero, but `tauri.conf.json.identifier` remains `com.watson.ztool`. The retained identifier is documented in developer-facing compatibility notes.

Rationale: bundle identifiers are installation identities, not marketing copy. Changing it can create a second installed application, disconnect WebView local storage, duplicate autostart entries, and force users to grant permissions again. Retaining it lets the Zero build upgrade the existing app in place and lets frontend code read `ztool.preferences.v1` for migration.

Alternative considered: switch immediately to `com.watson.zero`. This is visually pure in metadata but creates disproportionate migration and OS-integration risk. It can be reconsidered only with a dedicated two-release migration plan.

### 3. Canonicalize first-party IDs at registry and UI boundaries

Create a shared legacy-to-canonical first-party ID mapping in both Rust and TypeScript:

- `ztool.quick-launcher` → `zero.launch`
- `ztool.screenshot` → `zero.snap`
- `ztool.caffeine` → `zero.awake`
- `ztool.bing-wallpaper` → `zero.paper`

Rust owns persisted registry and native status-bar normalization. TypeScript owns frontend selection, visibility-preference, bundled-manifest, and event-payload normalization. IPC payload shapes remain unchanged, and both sides use the same exact mapping verified by mirrored contract tests.

Only legacy first-party IDs are aliases. Arbitrary third-party names beginning with `ztool.` are not rewritten.

Rationale: normalization at storage and interaction boundaries prevents old keys from leaking into current state without coupling the UI to Rust filesystem details.

Alternative considered: keep old first-party plugin IDs forever. They are externally stable, but the project is still pre-1.0 and already needs a compatibility layer for its extension host key; establishing the Zero namespace now avoids carrying the old brand indefinitely.

### 4. Perform idempotent, non-destructive data migration

A small Rust migration service runs before the plugin registry, status-bar state, wallpaper service, and quick-launcher cache are initialized. It:

1. Creates `~/.zero` only as needed.
2. Copies a legacy file/directory only when its canonical destination does not exist.
3. Rewrites known first-party IDs inside copied registry and status-bar JSON using typed deserialization and atomic replacement.
4. Preserves unknown fields/files and never deletes `~/.ztool`.
5. Records structured diagnostics and remains safe to run on every startup.

If canonical and legacy values both exist, canonical data wins. If a migration unit fails and no canonical data is usable, that subsystem reads the legacy data without overwriting it and reports a recoverable diagnostic instead of silently resetting state.

The frontend performs the same precedence rule for preferences: read `zero.preferences.v1`; otherwise parse `ztool.preferences.v1`, normalize first-party visibility keys, write the canonical value, and retain the legacy key for rollback.

Rationale: copy-then-normalize supports rollback and makes interrupted migration recoverable. A destructive move would make downgrade and partial-failure recovery unsafe.

Alternative considered: rename the entire directory in one filesystem operation. This fails across volumes/permissions, overwrites less predictably, and does not normalize embedded IDs.

### 5. Evolve the extension manifest contract with a bounded alias

Rust and TypeScript add `engines.zero` as the canonical host-version field and continue accepting `engines.ztool` for Extension API v1 packages. If both are present, `engines.zero` is authoritative. New examples, validation messages, and publishing documentation emit only `engines.zero`.

The compatibility alias remains read-only: installed/serialized canonical metadata uses `zero`, and deprecation is documented without scheduling removal in this change.

Rationale: existing `.zplugin` packages should continue to install, while all newly authored packages use the Zero contract.

Alternative considered: reject `engines.ztool` immediately. That would turn a branding change into an avoidable ecosystem break.

### 6. Centralize visible product/tool names through existing presentation seams

Localized UI strings and bundled manifest display metadata become the authoritative visible names. The exact English brand names remain unchanged in both supported locales; descriptive subtitles and actions stay localized. Tray/window titles, About, preferences, plugin navigation, status-bar tooltips, launcher window, fallback text, and default screenshot filename must all use the Zero names.

Rationale: branded product names should not be translated into alternate names, while surrounding explanatory text should remain localized.

Alternative considered: use Chinese translations such as “零启动”. This weakens the requested unified product family and makes screenshots/documentation inconsistent.

### 7. Update current documentation without rewriting history

README, PRODUCT, `openspec/project.md`, plugin guides, examples, and active OpenSpec changes are updated to describe Zero and the four current tool names. Technical compatibility notes explicitly identify retained legacy aliases and `com.watson.ztool`.

Archived OpenSpec changes and dated historical plans remain unchanged unless a path/link must be repaired. The GitHub repository rename from `bells/ztool` to `bells/zero` and local checkout rename are release operations performed after code validation; redirect behavior and local remote URLs are verified at that time.

Rationale: current documentation must be coherent, while editing archived records would erase useful history and create a large, misleading diff.

## Risks / Trade-offs

- [Risk] Old and new app data diverge after rollback and re-upgrade → Mitigation: canonical data wins, legacy data is never deleted automatically, and migration behavior is documented.
- [Risk] A partial migration silently resets plugin visibility or usage state → Mitigation: migrate per subsystem with typed parsing, atomic writes, diagnostics, legacy read-through, and failure-path tests.
- [Risk] First-party plugin ID changes break selection, status-bar actions, or launcher startup detection → Mitigation: use one explicit mapping on both sides of IPC and test registry, preferences, status-bar, plugin-host, and launcher paths with legacy and canonical IDs.
- [Risk] Third-party packages using `engines.ztool` stop installing → Mitigation: accept the legacy key for Extension API v1 and emit only the canonical key in new documentation.
- [Risk] Retaining `com.watson.ztool` looks like an incomplete rename to developers → Mitigation: document it as a deliberate immutable upgrade identifier and exclude it from user-facing copy.
- [Risk] Renaming npm/Cargo packages creates noisy lockfile and test-import changes → Mitigation: make the mechanical rename in one task, keep domain module names stable, and run the complete frontend/Rust gates.
- [Risk] GitHub/local checkout rename disrupts active branches or tooling → Mitigation: perform it only after implementation is merged, rely on GitHub redirects, update `origin`, and verify fresh clone/build instructions.
- [Trade-off] Historical files retain ZTool terminology → This preserves accurate design history; current docs and active specifications remain the source of truth.

## Migration Plan

1. Add naming constants/mappings and red tests for canonical IDs, legacy aliases, and migration precedence.
2. Implement Rust filesystem/registry/status-bar migration while the stable bundle identifier still exposes existing application storage.
3. Implement frontend local-storage and plugin-ID migration.
4. Rename package/crate/product metadata and visible UI/tool names.
5. Update extension contracts, examples, current docs, tests, and temporary verification paths.
6. Run focused migration/contract tests, full frontend build/tests, Rust checks/tests, and macOS Tauri smoke checks for tray, windows, all four tool panels, shortcuts, autostart, and migrated state.
7. Back up a representative `~/.ztool` fixture, verify first-run migration into `~/.zero`, then verify a second run is a no-op.
8. After merge/release preparation, rename the GitHub repository and local checkout, update `origin`, and validate documented commands from the renamed path.

Rollback keeps `com.watson.ztool` and all legacy data intact. A previous build can therefore continue reading `~/.ztool` and `ztool.preferences.v1`; users may lose changes made only after Zero began writing canonical storage, but the old data is not destroyed.

## Open Questions

- None required for implementation. A future, separate compatibility change may evaluate replacing `com.watson.ztool` after a multi-release migration window, but it is intentionally out of scope here.
