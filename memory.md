# Zero Memory

Last verified: 2026-09-25, source baseline `3120f5d`. This is a compact working map, not a release certificate. Recheck drift-prone values against source. Full findings and platform evidence are in [docs/project-overview.md](docs/project-overview.md); working rules are in [AGENTS.md](AGENTS.md).

## Stable architecture

- Tray-first desktop toolbox, with separate tray/main/preferences/about and tool-specific windows. React 19 + TypeScript + Vite; Tauri 2 + Rust 2021. Mobile is not currently delivered.
- Five bundled plugins: `zero.snap`, `zero.awake`, `zero.paper`, `zero.launch`, `zero.file` under `src/plugins/{screenshot,caffeine,bingWallpaper,quickLauncher,file}`.
- Frontend composition: `src/appShell/bundledPluginModules.ts`; Rust managed state: `src-tauri/src/bundled_plugins.rs`; command/protocol registration: `src-tauri/src/lib.rs`.
- `src/core/` cannot import concrete plugins; plugins cannot import peers. Host coordinators handle shared window/status-bar/shortcut behavior. Tests enforce these boundaries.
- Installed `.zplugin` packages use manifests, permission approval, isolated surfaces, Extension API, and guarded native host access. They cannot dynamically load Rust code.

## Windows and lifecycle

- `tray` is the hidden 400 × 500 startup window; `main` is a separate 920 × 660 tool home.
- `preferences` and `about` are dedicated windows; `launcher`, `paper`, and `snap-menu` are tool surfaces.
- `capture` and `pin-*` are screenshot surfaces. `zero-file-engine` is hidden with its own narrow capability file.
- `src/main.tsx` lazy-loads surfaces; unknown labels fall back to tray. File engine label handling is special.
- Preserve window label/capability/caller-check symmetry, surface-activity handling, focus behavior, resource cleanup, and transient-window coordination.

## Data and compatibility

- Current root is `~/.zero`, preferences key `zero.preferences.v1`. `~/.ztool` and `ztool.preferences.v1` remain migration inputs, not the primary store.
- Preserve bundle identifier `com.watson.ztool`; it maintains installation, permission, autostart, and WebView compatibility.
- Four legacy first-party IDs map to canonical names; the fifth plugin File has no legacy counterpart.
- Paper data: `~/.zero/data/wallpaper/`; Launch data: `~/.zero/data/quick-launcher/`; plugin packages: `~/.zero/plugins/`; File staging: Tauri app cache `file-conversion`.
- Raw launcher queries are not persisted. Launch actions resolve indexed IDs rather than arbitrary paths/commands. Preserve cache ownership, path containment, and permission restrictions.

## Plugin boundaries to remember

- Snap: macOS custom editor; Windows system launcher only; Linux unsupported. Smart window targeting, free selection, width/height/radius, annotations and copy/save/pin are in source, with manual multi-display/first-frame tasks still open.
- Screenshot media uses raw IPC and opaque tokens; export is prepare lease then raw upload with lease/session/action headers. Old `commit_screenshot` / `png_base64` documentation is obsolete. Check Rust `serde` and TS types individually: newer structs use camelCase, older responses can use snake_case.
- Awake: macOS managed `caffeinate -d -i`, Windows `SetThreadExecutionState`. Do not infer Linux support from its manifest.
- Paper: up to 10 cached Bing entries, Rust-owned bounded fetch/cache, platform wallpaper adapter. Linux apply depends on available desktop backend.
- Launch: macOS application bundles and Windows Start Menu entries; Chinese/pinyin search and indexed launch/focus/settings. Linux/mobile unsupported.
- File: built-in PDF→DOCX implementation on macOS/Windows; built-in DOCX→PDF on macOS 11+. External LibreOffice/Word providers are optional compatibility paths, not prerequisites for built-in conversion. Windows has no built-in DOCX→PDF exporter.

## File startup and release status

- `src-tauri/file-engine-policy.json` currently has no approved engine package; candidate 1.0.0 remains unapproved with no archive digest. Provider-enable constants do not mean package approval.
- Source development: `ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev`. Requires a debug build; release builds cannot use the fallback. `predev/prebuild` prepare engine assets but do not install a trusted package.
- For repair/reinstall messages, inspect capability/provider diagnostics, installed identity/version, policy/signature/assets, and hidden-WebView readiness. The development flag is a lead; the prior user startup error has not been reproduced or assigned a confirmed root cause by this review.
- Signed package, corpus, packaged offline smoke, memory/readiness/cancellation, rollback, and Windows runtime gates remain distinct. Never approve policy to silence an error.

## Toolchain and verification

- Current package/Tauri/Cargo version: 0.1.0. pnpm is pinned to 10.33.0. Node 22.13+ on 22.x or 24+ satisfies current Vite/PDF.js; CI uses Node 22. This review used Node 24.20.0 and Rust 1.95.0.
- `pnpm test` prepares `/private/tmp/zero-tests` then recursively runs tests. Do not concurrently run fixture-preparing scripts. Focused levels: `test:unit` / `test:integration`.
- Current review: 251 frontend tests and production build pass; Rust fmt/check pass; 269 Rust tests pass with 1 ignored on an approved unsandboxed serial rerun. Initial sandbox run failed native pasteboard and one timed subprocess test; retain that distinction.
- OpenSpec 1.12.0 strict validation passes 19/19 after preserving three scenario identifiers in the rename delta. `refine-zero-icon-family` still has a missing-main-spec archive dependency warning.
- Bundle budget passes: 269,252 bytes initial JS, 82,646 gzip; largest lazy chunk 795,338 bytes. This is build evidence, not native latency or RSS evidence.
- File engine build/policy verification and icon/example checks pass; package remains unapproved. Clippy found test-module ordering in screenshot commands; this review moves the test module only; strict Clippy and the affected caller-scope test pass afterward.
- Build-graph script defaults to overwriting tracked historical evidence. Use `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json` for an independent check.

## Remaining work and collaboration

- 17 active OpenSpec changes, 69 unchecked tasks as of this review; many are manual/device gates. Main specs cover only shell and caffeine duration. Do not auto-archive or equate strict validation with completion.
- Release workflow still uses ZTool release text/manual tag naming. No Linux/mobile CI; full frontend suite runs only on macOS. Recheck workflows before expanding claims.
- UI/native workflows, Windows hardware, signed installers, complete File corpus, and matched performance protocols remain separate evidence. Tests and builds do not prove them.
- Diagnose exact observed behavior, implement bounded changes, preserve unrelated/generated/private data, and label evidence precisely. Commit/push/publish/archive only when requested.
- A future product website should be separate from the desktop UI; historical Astro/Vercel discussion is a preference, not an implemented site.
