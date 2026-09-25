# Zero maintainer and agent guide

Read this file, [the project overview](docs/project-overview.md), and [project memory](memory.md) before substantial work. For behavior changes, also read [OpenSpec context](openspec/project.md) and the relevant active change. Source and current verification take precedence over older notes.

## Architecture

- Zero is a tray-first desktop toolbox: React 19 + TypeScript + Vite in `src/`, Tauri 2 + Rust 2021 in `src-tauri/`.
- Five bundled plugins live in `src/plugins/{screenshot,caffeine,bingWallpaper,quickLauncher,file}`. Each owns its descriptor, translations, UI, domain helpers, and typed service boundary.
- Register frontend modules in `src/appShell/bundledPluginModules.ts`; compose native state in `src-tauri/src/bundled_plugins.rs` and command handlers in `src-tauri/src/lib.rs`.
- `src/core/` must not import concrete plugins. Plugins must not import peers. Shared window, shortcut, status-bar, and lifecycle behavior belongs in host coordinators.
- Keep Tauri handlers in `src-tauri/src/commands/` thin; place native business logic in `services/`. `plugins/` owns installed-package contracts, integrity, registry, and runtime.
- Bundled modules are trusted at build time. Third-party `.zplugin` packages use host-approved permissions and isolated runtime surfaces; they cannot dynamically load Rust code.

## Implementation rules

- Prefer small plugin-scoped changes. Reuse maintained libraries for generic capabilities after checking existing dependencies.
- Rust owns system calls, files, processes, permissions, native windows, resource limits, and authoritative job state. React owns presentation and interaction; the isolated File WebView also performs document conversion under Rust-issued leases.
- Explicit Rust/TypeScript IPC contracts must match actual `serde` names. Existing contracts use both snake_case and camelCase; do not apply a blanket naming conversion. No TypeScript `any`.
- Use typed errors and `Result` where failures are possible. Keep expensive blocking work off async/UI threads. Handle timeout, cancellation, permission denial, stale sessions, and worker failure.
- Preserve compatibility: bundle identifier `com.watson.ztool`, canonical `~/.zero` data and `zero.preferences.v1`, legacy reads/migration without deleting the old data.
- Keep window routing, capability files, caller checks, and lifecycle cleanup consistent. The File engine has its own narrow capability file; do not put it in the default window list.
- Zero File release policy must stay tied to signed, measured artifacts. `ZERO_FILE_ENGINE_DEV_ASSETS=1` is a debug source fallback, not release approval.
- Preserve the platform split: macOS custom screenshot editor, Windows system screenshot launcher. Linux/mobile capability must not be inferred from manifests or a successful compile.

## Product and UI

- Keep the tray compact and predictable; use the standalone main window for richer tool content and separate preferences/about surfaces.
- Preserve tool navigation, current tool content, and system actions as distinct areas. Use familiar controls, visible focus, keyboard access, Chinese/English labels, and practical click targets.
- Consider responsive layouts and future touch use without claiming mobile runtime support.

## Verification

Use `pnpm@10.33.0` and a Node runtime compatible with Vite 7 and PDF.js 6 (Node 22.13+ on 22.x or 24+). Run checks relevant to the change; normal implementation gates are:

```bash
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
git diff --check
```

- `pnpm test:unit` and `pnpm test:integration` are focused entry points. Test preparation replaces `/private/tmp/zero-tests`; do not run multiple fixture-preparation commands concurrently.
- After frontend/performance changes, run `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json` after building. The package-script default rewrites tracked historical evidence; keep a new snapshot separate unless intentionally updating it.
- Validate relevant OpenSpec artifacts with `openspec validate --all --strict`. Task checkboxes, spec validity, and real-device evidence are different things. Do not silently archive changes or mark manual tasks complete.
- For changed UI/native flows, run `pnpm tauri dev` and inspect the affected real desktop flow unless the user reserves that verification. Report build/unit/source-contract checks separately from native/manual and Windows-device checks.
- Some Rust tests touch native pasteboards and timed child processes. If sandbox execution fails, preserve the first result and use a permitted targeted or serial rerun to investigate; do not weaken tests to hide environment failures.

## Change hygiene

Preserve unrelated work and private user data. Do not commit generated `dist/`, `build/`, `public/file-engine/`, `node_modules/`, Rust targets, or local caches. Do not read or print secrets to diagnose builds. Commit, push, publish, tag, and archive only within the user's requested scope.

For documentation-only reviews, update the current map and record unresolved risks without expanding into unrelated runtime refactors or release-policy changes.
