# Preferences interface verification

Date: 2026-11-11. The maintainer requested committing and pushing the verified changes after the density and naming follow-up. Deployment, spec synchronization and archive remain outside this change.

## Follow-up feedback

The maintainer supplied the current native screenshot and a ChatGPT settings reference. Desktop navigation was further reduced from 36px plus 2px gaps to 30px with zero internal gaps, group spacing from 16px to 12px, and outer/header/content padding was tightened. The complete Zero-prefixed names were restored. Frontend tests, build, build-graph checks and Chromium/WebKit/coarse-pointer browser verification were rerun for this follow-up. Native Rust checks below belong to the initial pass, not a new Rust regression run.

## Implemented

- Application settings and tool settings groups, a distinct tools overview, and standalone extension management.
- Complete tool names are shown in navigation and detail headers in both languages. Function-specific suffixes and the preferencesLabel indirection from the first pass were removed after maintainer feedback, so future tool functionality can expand without renaming navigation. Plugin-owned search descriptors still receive the full owning-tool title without changing focus targets.
- Settings-scoped typography, neutral surfaces, compact toolbar/header, 30px desktop navigation with zero group-internal gap and 12px group separation and 44px coarse-pointer navigation. Common controls, metadata, statuses and wrapped actions share readable sizes.
- Single-section headings no longer repeat page titles; tool availability/display and status-bar icon display receive meaningful headings.
- Shared input/select rows have associated visible labels and descriptions. Existing IDs are retained and generated IDs cover otherwise unnamed controls. Existing native handlers, storage and immediate feedback remain intact.

## Automated checks

- `pnpm test`: 487 passed, 0 failed.
- `pnpm build`: passed, full profile with five tools.
- `node scripts/performance/build-graph.mjs --check --output /tmp/zero-preferences-build-graph.json`: passed, no findings or forbidden eager imports.
- Initial pass (unchanged native source): `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- Initial pass (unchanged native source): `cargo check --manifest-path src-tauri/Cargo.toml --locked`: passed.
- First sandboxed `cargo test --manifest-path src-tauri/Cargo.toml --locked`: library run had 344 passed, 3 failed and 2 ignored. Failures were native Vision recognition, a private test pasteboard and a timed subprocess. This first result was preserved at `/tmp/zero-preferences-cargo-test.log`.
- Unsandboxed serial rerun `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1`: 459 passed across library/integration suites, 0 failed, 3 ignored. Full output: `/tmp/zero-preferences-cargo-test-native.log`. No tests were weakened or modified to accommodate these environment failures.
- `openspec validate --all --strict`: 44 items passed, 0 failed.
- `git diff --check`: passed.

## Rendered browser verification

Browser plugin unavailable; used an already cached local Playwright installation, without adding dependencies. CLI bootstrap could not reach npm inside the sandbox, and the first sandboxed Chromium launch failed at macOS Mach-port creation. The permitted local browser run used `http://localhost:1420/` and the actual main application with synthetic IPC responses in an isolated browser context. It did not read or change native user preferences or install extensions.

The temporary script `/tmp/zero-preferences-browser.mjs` exercised Chromium, WebKit, and Chromium coarse-pointer/touch emulation:

- All ten existing preferences destinations, including lazy Awake and Paper settings.
- Chinese and English, 920×660 normal layout, 760×520 minimum main-window layout, and 600×650 single-pane flow.
- Page identity, meaningful content, no framework overlay, screenshots and no console/page errors in all three final runs.
- Distinct groups and complete tool names; full-name search including plugin-specific battery settings, search-result focus, no-results state and Escape clearing.
- Switching language, returning to tools, reopening preferences and retaining the selected page/search context.
- Named common switches/selects, long third-party fallback labels, navigation wrapping/search and desktop/coarse-pointer minimum target sizes.
- No horizontal overflow in any of the ten normal-width content panes. Minimum-width shortcut controls and extension actions were inspected in screenshots.

Results: `/tmp/zero-preferences-density-qa/results-chromium.json`, `results-webkit.json`, and `/tmp/zero-preferences-density-qa-touch/results-chromium.json`. Screenshots are in the corresponding directories. These are browser layout/interaction checks with mocked IPC, not native command or device acceptance.

The initial read-only independent review identified the plugin-specific search alias omission. Full owning-tool names remain indexed with a regression test after the follow-up naming rollback; the short-name-specific test was removed. The prior review found no other actionable issues.

## Native and device acceptance

`pnpm tauri dev` initially failed because the sandbox prohibited listening on localhost:1420. The permitted rerun successfully started Vite and `target/debug/zero`. The desktop UI connection failed with timeouts and was then unavailable in the session, so the real WKWebView layout, focus, scroll and settings interactions were not observed. Native command side effects such as autostart, actual global shortcut registration, extension lifecycle and status-bar changes were not reaccepted for this UI change.

The follow-up `pnpm tauri dev` attempt found port 1420 already occupied; browser checks reused the existing localhost development service without stopping it. The maintainer’s supplied native screenshot records the earlier state, not acceptance of the latest density correction.

Real macOS preferences acceptance, Windows acceptance and real touch-device testing remain pending. Playwright WebKit and coarse-pointer emulation do not close those gates.
