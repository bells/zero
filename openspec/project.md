# Zero Project Context

Updated: 2026-10-23 (desktop, browser toolbox and feedback map). Read [AGENTS.md](../AGENTS.md), [PRODUCT.md](../PRODUCT.md) and [the current project overview](../docs/project-overview.md) before proposing changes. This file describes the live source architecture; existing change artifacts can contain earlier names or superseded designs.

## Product and stack

Zero is a cross-platform desktop toolbox with independent, pluggable tools accessed from the menu bar / system tray. A compact `tray` window supports quick actions, `main` contains full tool and preferences views, `about` remains separate, and plugins have dedicated surfaces/native menus. The five bundled tools are Zero Snap, Zero Awake, Zero Paper, Zero Launch, and Zero File.

The independent Astro website also provides eight browser-local tools across development, image and text. Optional moderated feedback is a separate Node service. These projects have separate dependencies, lockfiles, verification and delivery; browser tools are not automatically desktop plugins.

Current product priority: the maintainer will review the five desktop tools hands-on and refine them individually. Scope follow-up changes around observed friction, preserving compact tray actions and full main-window workspaces. This direction does not itself define or approve new feature implementations.

Desktop stack: Tauri 2, Rust 2021, React 19, TypeScript 5.8, Vite 7, pnpm 10.33.0. Website: Astro 7 / TypeScript 5.9. Feedback: Hono / pinned Waline / PostgreSQL, with local synthetic PGlite tests. Prefer Node 24+ across all projects; website/feedback require it, while desktop dependencies also allow Node 22.13+ on 22.x. The current package/Tauri/Cargo version is 0.1.0; verify it again for release work. Mobile is a future consideration, not a delivered desktop platform.

## Source ownership

| Concern | Source |
| --- | --- |
| Lazy window routing | `src/main.tsx`, `src/appShell/appSurface.ts` |
| Tray/main (tools/preferences)/about shells | `src/App.tsx` |
| Frontend plugin composition | `src/appShell/bundledPluginModules.ts`, build-selected `bundledPluginCatalog.*.ts` |
| Host contracts, registry/market UI, Extension Bridge | `src/core/pluginHost/` |
| Preferences, localization, storage | `src/core/preferences/` |
| Surface activity | `src/core/windowing/`, `src-tauri/src/services/surface_activity.rs` |
| Plugin-owned frontend | `src/plugins/{screenshot,caffeine,bingWallpaper,quickLauncher,file}/` |
| Native composition and IPC registration | `src-tauri/src/bundled_plugins.rs`, `src-tauri/src/lib.rs` |
| Thin commands and native services | `src-tauri/src/commands/`, `src-tauri/src/services/` |
| Package security and runtime | `src-tauri/src/plugins/` |
| Shared native OCR and diagnostics | `src-tauri/src/services/ocr/`, `src-tauri/src/services/diagnostics/` |
| Website catalog, guides and routes | `website/src/content/`, `website/src/pages/` |
| Browser tool rules and adapters | `website/src/lib/web-tools/`, `website/src/scripts/web-tools/`, `website/src/components/webTools/` |
| Feedback contracts, facade and persistence | `feedback/shared/`, `feedback/server/` |

Core cannot import concrete plugins; plugins cannot import peers. Host coordinators own cross-plugin behavior. Bundled plugins are build-time modules; installed third-party packages cannot dynamically load Rust code.

Full source builds include five tools; standard includes four without File, and core has none. Current trial packaging uses core/standard. Public Web Plugin API v1 runtime remains disabled; macOS debug development overrides and legacy package/process runtime support are separate from public release readiness. See [protocol status](../docs/plugins/protocol-v1.md).

## Window model

- `tray`: initially hidden 400 × 500 quick panel defined in `tauri.conf.json`.
- `main`: 920 × 660 (minimum 760 × 520) tool home/settings view created by `commands/app.rs`; `show_preferences_window` redirects here through retained revisioned navigation.
- `about`: 500 × 560 (minimum 420 × 360) identity surface.
- `capture`, `pin-*`: macOS screenshot editing and pinned results.
- `launcher`, `paper`: dedicated tool surfaces. Snap/Awake use native menus; the old `snap-menu` WebView is removed.
- `zero-file-engine`: hidden isolated document engine, with separate `file-engine.json` capabilities.
- Unknown frontend labels fall back to the tray surface. `src/main.tsx` handles the File engine label specially.

Keep capabilities and command caller checks aligned with new window labels. Preserve focus/blur, transient-window coordination, and cleanup semantics.

## Native and IPC boundaries

Rust owns system/process/file work, permissions, resource bounds, authoritative state, and native windows. React owns rendering and interactions. File conversion code executes in an isolated WebView using Rust-mediated staging, leases, cancellation, and output validation.

Use explicit symmetric Rust/TypeScript contracts, `serde` serialization, typed `Result` errors, and `unknown` narrowing instead of TypeScript `any`. Preserve each existing wire format: new screenshot session/media/lease structs use `camelCase`; some older capability/start responses use snake_case.

Screenshot media is raw IPC, not Base64 JSON: `init_screenshot_session` returns a media descriptor; `read_screenshot_media` reads authorized bytes; `prepare_screenshot_commit` returns a one-use lease; `upload_screenshot_commit` consumes PNG bytes with lease/session/action headers. Source-of-truth contracts live in `services/screenshot.rs`, `commands/screenshot.rs`, `captureTypes.ts`, and `captureSerialize.ts`.

## Platform and release boundaries

- Snap: macOS custom capture/editor, smart window candidates, free selection, dimensions/radius, editable annotation objects/properties, undo/redo, copy/save/pin and shared Vision OCR. Windows remains system-launcher-only; Linux capture is unsupported. Mixed-DPI and window lifecycle still require device evidence.
- Awake: macOS managed `caffeinate -d -i`; Windows `SetThreadExecutionState`; other platforms unsupported.
- Paper: bounded Bing metadata/image fetch and cache; platform wallpaper adapter. Linux depends on the desktop backend and has no current CI/device claim.
- Launch: macOS application bundles and Windows Start Menu entries; indexed IDs mediate launch/focus/settings actions. Linux/mobile unsupported; raw search queries are not persisted.
- File: built-in PDF→DOCX on macOS/Windows, with scanned-page Vision OCR currently macOS-only; built-in DOCX→PDF on macOS 11+. Editable text is not a promise of original-layout fidelity. Optional LibreOffice/Word compatibility providers are separate. Signed engine candidate 1.2.0 / run protocol 2 remains unapproved; source development requires `ZERO_FILE_ENGINE_DEV_ASSETS=1` in a debug build. See the [engine guide](../docs/plugins/zero-file-offline-engines.md).

Preserve `com.watson.ztool` for upgrade compatibility. Canonical storage is `~/.zero` and `zero.preferences.v1`; legacy `.ztool` and `ztool.preferences.v1` remain migration inputs. Preferences retain at least one visible tool, system/Chinese/English language choices, and native autostart behavior.

## Browser toolbox and feedback

`website/src/content/web-tools.ts` is the catalog: timestamp/json/base64/diff in development, image-converter/image-watermark/image-compressor in image, and markdown in text. Preserve Chinese `/tools/` and English `/en/tools/`, existing desktop guide URLs, explicit categories, shared guides, canonical/hreflang, sitemap/AI indexes and preview/error noindex. Current generation describes 36 indexable pages; verify actual routes when changing the catalog.

Browser domain code has no desktop IPC dependency. Keep input/output local, heavy work in cancellable bounded Workers, revision checks against stale results, and Blob/Worker cleanup. Network loads for site assets/codecs/fonts remain necessary. Markdown has an opt-in single local draft and explicitly authorized external-image requests; do not broaden those exceptions to other tools or claim complete offline operation. PDF export remains searchable text with declared font/resource limits. Image outputs have explicit format/metadata/resource policies; real iPhone and full Safari image acceptance remain separate from Chrome or Markdown Safari checks.

Feedback is disabled by default, click-loaded in a cross-origin iframe, and independent of tool computation. Pass only stable thread/locale context; never attach tool input/results. Nine stable threads cover the directory and eight tools, shared across locales. Anonymous plain-text submissions require moderation; only the owner replies. Preserve the service's GPL-2.0-only boundary and separate deployment, retention, cost/qualification and device gates. See [website maintenance](../docs/website.md) and [feedback maintenance](../feedback/README.md).

## Change workflow

For non-trivial behavior changes, produce a proposal with the user problem, scope, non-goals, affected surfaces, platform implications, and verification plan. Describe both Rust and TS sides of IPC changes and split tasks into verifiable plugin-scoped steps. Specifications should express observable behavior.

Check overlapping active changes before proposing new work. As of 2026-10-23 there are 32 active changes and 158 unchecked tasks; the detailed snapshot is in the project overview. Main specs currently cover only the shell and caffeine duration; many implemented capabilities still live in unarchived change deltas. A checked task is not proof of packaged/runtime readiness. Do not archive or sync specs as an incidental part of a review.

For MODIFIED requirements, retain existing scenario identifiers and full scenarios. Branding can change scenario bodies without silently dropping baseline scenarios. Changes depending on a new spec must be synced/archived in dependency order when requested.

## Verification

Follow `AGENTS.md` for scoped desktop, website and feedback commands. `pnpm test` compiles fixtures before recursive discovery; do not replace it with raw Node test execution. Run fixture-preparing jobs serially and strict OpenSpec validation for context/artifact changes. UI, shortcuts, screenshot geometry, focus, autostart, native printing, packaged engine install, real Safari/iPhone downloads, hosted feedback and resource/performance budgets need separate evidence. Report unavailable checks explicitly; keep documentation-only validation distinct from functional regression.
