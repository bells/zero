# Zero maintainer and agent guide

Read this file, [the project overview](docs/project-overview.md), and [project memory](memory.md) before substantial work. For product/UI decisions, also read [PRODUCT.md](PRODUCT.md). For behavior changes, read [OpenSpec context](openspec/project.md) and the relevant active change. Source and current verification take precedence over older notes.

## Product and repository scope

- Zero is a cross-platform desktop toolbox with independent, pluggable tools accessed quickly from the menu bar / system tray. The website also provides a browser-local online toolbox; it is an implemented product surface, not a future marketing-site proposal.
- Desktop: `src/` + `src-tauri/`. Website: independent Astro project in `website/`. Optional feedback: independent Node service in `feedback/`. Each JavaScript project has its own package manifest and lockfile; root commands do not validate all three.
- Current desktop modules are Snap, Awake, Paper, Launch and File. The browser catalog has nine tools across development, image and text; verify the list in `website/src/content/web-tools.ts` before changing counts.
- Current priority: the maintainer will experience all five desktop tools again and refine them individually. Follow concrete user feedback with bounded plugin-scoped work; do not treat this direction as authorization for a broad redesign or new tools.
- Keep `README.md` complete in both Chinese and English. Product claims must distinguish implemented source, actual package contents, device evidence and deployed behavior.

## Architecture

- Zero is a tray-first desktop toolbox: React 19 + TypeScript + Vite in `src/`, Tauri 2 + Rust 2021 in `src-tauri/`.
- Five bundled plugins live in `src/plugins/{screenshot,caffeine,bingWallpaper,quickLauncher,file}`. Each owns its descriptor, translations, UI, domain helpers, and typed service boundary.
- Register frontend modules through `src/appShell/bundledPluginModules.ts` and the build-selected `bundledPluginCatalog.*.ts`; compose native state in `src-tauri/src/bundled_plugins.rs` and command handlers in `src-tauri/src/lib.rs`.
- `src/core/` must not import concrete plugins. Plugins must not import peers. Shared window, shortcut, status-bar, and lifecycle behavior belongs in host coordinators.
- Keep Tauri handlers in `src-tauri/src/commands/` thin; place native business logic in `services/`. `plugins/` owns installed-package contracts, integrity, registry, and runtime.
- Bundled modules are trusted at build time; full includes five, standard excludes File, and core has none. Check Rust feature gates and frontend catalogs together when changing profiles.
- Third-party `.zplugin` packages use a separate permission/runtime boundary and cannot dynamically load Rust code. Public Web Plugin API v1 runtime remains disabled; isolated WebView/SDK development support is not a released public ecosystem. Consult [protocol status](docs/plugins/protocol-v1.md), and keep legacy process-runtime behavior distinct.

## Website and feedback boundaries

- Read [website maintenance](docs/website.md) for web work and [feedback maintenance](feedback/README.md) for service work. Website code does not import desktop IPC, native providers or the File engine.
- Keep browser domain rules/contracts in `website/src/lib/web-tools/`, DOM/lifecycle/Worker adapters in `website/src/scripts/web-tools/`, and bilingual metadata/guides in `website/src/content/`. Reuse common image and Markdown pipelines rather than duplicating per-page behavior.
- Inputs/results stay local to the browser. Markdown alone offers an opt-in local draft and explicit external-image permission; initial assets, fonts and codecs still need network access. Do not claim complete offline operation or zero network requests.
- Preserve cancellation, time/byte/pixel limits, revision checks, lazy resource loading, Blob/Worker cleanup, bilingual routes, categories, canonical/hreflang and preview/error noindex behavior. Codec/font distribution must retain verified source/license materials.
- Feedback is disabled by default and loads a cross-origin iframe only after a click. Pass only stable thread/locale context, never tool inputs/results. Submitted feedback is a separate network operation with moderation and retention rules; service failure must not block tools.
- `feedback/` conservatively uses GPL-2.0-only for its pinned Waline integration. Keep its dependency tree, deployment, credentials and license scope separate from the website and desktop. Do not enable hosted feedback as part of local validation.

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

- Keep the tray compact and predictable; use the standalone main window for richer tool content and its preferences view, with a separate about window.
- Every plugin's status-bar/tray page should stay concise and focused on quick actions. Its main-window page may use richer controls and visualizations, filling the available workspace instead of inheriting the tray's compact width.
- Preserve tool navigation, current tool content, and system actions as distinct areas. Use familiar controls, visible focus, keyboard access, Chinese/English labels, and practical click targets.
- Consider responsive layouts and future touch use without claiming mobile runtime support.

## Verification

Use `pnpm@10.33.0` and preferably Node 24+ across the repository. Website and feedback require Node 24+; desktop Vite 7/PDF.js 6 also allow Node 22.13+ on 22.x. Run checks relevant to the change; normal desktop implementation gates are:

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

For website changes, run `pnpm --dir website check`, `test`, `build`, `test:seo`, then `test:browser` serially. Use `verify:links` and `verify:performance` for navigation/resource changes; see the website guide for browser setup. For feedback changes run `pnpm --dir feedback check`, `test`, `build`, `verify:client` and the relevant two-origin browser checks. Root/website fixtures and File build assets may be shared; do not run competing preparation/build jobs concurrently.

Documentation-only reviews should check local links, source facts, bilingual consistency, OpenSpec validity when context/artifacts change, and `git diff --check`. Do not report historical test counts as a fresh full regression or launch native flows solely to validate prose.

## Change hygiene

Preserve unrelated work and private user data. Do not commit generated `dist/`, `build/`, `public/file-engine/`, `node_modules/`, Rust targets, or local caches. Do not read or print secrets to diagnose builds. Commit, push, publish, tag, and archive only within the user's requested scope.

For documentation-only reviews, update the current map and record unresolved risks without expanding into unrelated runtime refactors or release-policy changes.
