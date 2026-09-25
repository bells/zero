# Zero Project Context

Updated: 2026-09-25. Read [AGENTS.md](../AGENTS.md) and [the current project overview](../docs/project-overview.md) before proposing changes. This file describes the live source architecture; existing change artifacts can contain earlier names or superseded designs.

## Product and stack

Zero is a tray-first desktop toolbox with a compact `tray` window, a standalone `main` window, separate `preferences` and `about` windows, and plugin-owned tool surfaces. It is not a web dashboard. The five bundled tools are Zero Snap, Zero Awake, Zero Paper, Zero Launch, and Zero File.

Stack: Tauri 2, Rust 2021, React 19, TypeScript 5.8, Vite 7, pnpm 10.33.0. CI uses Node 24; dependencies require Node 22.13+ on 22.x or 24+. The current package/Tauri/Cargo version is 0.1.0; verify it again for release work. Mobile is a future consideration, not a delivered platform.

## Source ownership

| Concern | Source |
| --- | --- |
| Lazy window routing | `src/main.tsx`, `src/appShell/appSurface.ts` |
| Tray/main/preferences/about shells | `src/App.tsx` |
| Frontend plugin composition | `src/appShell/bundledPluginModules.ts` |
| Host contracts, registry/market UI, Extension Bridge | `src/core/pluginHost/` |
| Preferences, localization, storage | `src/core/preferences/` |
| Surface activity | `src/core/windowing/`, `src-tauri/src/services/surface_activity.rs` |
| Plugin-owned frontend | `src/plugins/{screenshot,caffeine,bingWallpaper,quickLauncher,file}/` |
| Native composition and IPC registration | `src-tauri/src/bundled_plugins.rs`, `src-tauri/src/lib.rs` |
| Thin commands and native services | `src-tauri/src/commands/`, `src-tauri/src/services/` |
| Package security and runtime | `src-tauri/src/plugins/` |

Core cannot import concrete plugins; plugins cannot import peers. Host coordinators own cross-plugin behavior. Bundled plugins are build-time modules; installed third-party packages cannot dynamically load Rust code.

## Window model

- `tray`: initially hidden 400 × 500 quick panel defined in `tauri.conf.json`.
- `main`: 920 × 660 standalone tool home created by `commands/app.rs`.
- `preferences`: 840 × 640 settings center; `about`: 460 × 420 identity surface.
- `capture`, `pin-*`: macOS screenshot editing and pinned results.
- `launcher`, `paper`, `snap-menu`: dedicated tool surfaces.
- `zero-file-engine`: hidden isolated document engine, with separate `file-engine.json` capabilities.
- Unknown frontend labels fall back to the tray surface. `src/main.tsx` handles the File engine label specially.

Keep capabilities and command caller checks aligned with new window labels. Preserve focus/blur, transient-window coordination, and cleanup semantics.

## Native and IPC boundaries

Rust owns system/process/file work, permissions, resource bounds, authoritative state, and native windows. React owns rendering and interactions. File conversion code executes in an isolated WebView using Rust-mediated staging, leases, cancellation, and output validation.

Use explicit symmetric Rust/TypeScript contracts, `serde` serialization, typed `Result` errors, and `unknown` narrowing instead of TypeScript `any`. Preserve each existing wire format: new screenshot session/media/lease structs use `camelCase`; some older capability/start responses use snake_case.

Screenshot media is raw IPC, not Base64 JSON: `init_screenshot_session` returns a media descriptor; `read_screenshot_media` reads authorized bytes; `prepare_screenshot_commit` returns a one-use lease; `upload_screenshot_commit` consumes PNG bytes with lease/session/action headers. Source-of-truth contracts live in `services/screenshot.rs`, `commands/screenshot.rs`, `captureTypes.ts`, and `captureSerialize.ts`.

## Platform and release boundaries

- Snap: macOS custom capture/editor, smart window candidates, free selection, dimensions/radius, annotations and copy/save/pin. Windows remains system-launcher-only; Linux capture is unsupported. Mixed-DPI and window lifecycle still require device evidence.
- Awake: macOS managed `caffeinate -d -i`; Windows `SetThreadExecutionState`; other platforms unsupported.
- Paper: bounded Bing metadata/image fetch and cache; platform wallpaper adapter. Linux depends on the desktop backend and has no current CI/device claim.
- Launch: macOS application bundles and Windows Start Menu entries; indexed IDs mediate launch/focus/settings actions. Linux/mobile unsupported; raw search queries are not persisted.
- File: built-in PDF→DOCX on macOS/Windows; built-in DOCX→PDF on macOS 11+. Optional LibreOffice/Word compatibility providers are separate from the built-in paths. The signed engine candidate is unapproved; source development requires `ZERO_FILE_ENGINE_DEV_ASSETS=1` in a debug build. See the [engine guide](../docs/plugins/zero-file-offline-engines.md).

Preserve `com.watson.ztool` for upgrade compatibility. Canonical storage is `~/.zero` and `zero.preferences.v1`; legacy `.ztool` and `ztool.preferences.v1` remain migration inputs. Preferences retain at least one visible tool, system/Chinese/English language choices, and native autostart behavior.

## Change workflow

For non-trivial behavior changes, produce a proposal with the user problem, scope, non-goals, affected surfaces, platform implications, and verification plan. Describe both Rust and TS sides of IPC changes and split tasks into verifiable plugin-scoped steps. Specifications should express observable behavior.

Check overlapping active changes before proposing new work. Main specs currently cover only the shell and caffeine duration; many implemented capabilities still live in unarchived change deltas. A checked task is not proof of packaged/runtime readiness. Do not archive or sync specs as an incidental part of a review.

For MODIFIED requirements, retain existing scenario identifiers and full scenarios. Branding can change scenario bodies without silently dropping baseline scenarios. Changes depending on a new spec must be synced/archived in dependency order when requested.

## Verification

Follow `AGENTS.md` for normal commands. `pnpm test` compiles fixtures before recursive discovery; do not replace it with raw Node test execution. Run strict OpenSpec validation for artifact changes. UI, shortcuts, screenshot geometry, focus, autostart, native printing, packaged engine install, and resource/performance budgets need separate real-device evidence. Report unavailable platform checks explicitly.
