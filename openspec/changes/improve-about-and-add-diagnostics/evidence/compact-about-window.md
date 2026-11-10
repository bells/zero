# About compact layout verification

Date 2026-11-10. The maintainer approved a compact single view, default 500 × 560, resizable to a minimum 420 × 360, with scrolling permitted after expanding details.

## Implementation

- Removed the duplicate outer heading and consolidated identity, version and description.
- Replaced two-line project cards with compact links and arranged the three support actions horizontally.
- Moved technical architecture copy into Tools & runtime and kept both details closed initially.
- Applied border-box sizing and disabled content-section flex shrinking inside the scrollable panel. Targets remain at least 40 CSS pixels high.
- Enabled native resizing and updated the existing window configuration test to pin default and minimum dimensions.

## Fresh automated checks

- `pnpm test` passed 485 tests with no failures.
- `pnpm build` and `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `cargo check --manifest-path src-tauri/Cargo.toml --locked` passed.
- The updated window test first failed against the old nonresizable configuration, then passed with resizing enabled.
- The first sandboxed Rust suite passed 345 unit tests with two ignored and two failures in system Vision OCR and native pasteboard access. The permitted sandbox-external serial rerun passed 347 unit tests with two ignored and all integration suites. Existing ignored tests retain their prior status.
- `openspec validate --all --strict` passed 43 items. It also emitted existing informational archive compatibility notes for unrelated changes.
- `git diff --check` passed. A separate read-only code review reported no findings.

## Rendered browser checks

Used the real `/src/main.tsx` About entry with synthetic IPC responses in a temporary Playwright harness at `http://127.0.0.1:1431`. Browser checks use Chromium. Test scripts, logs and screenshots are outside the repository under `/tmp/zero-about-*`.

- Chinese and English both fit a 500 × 532 content viewport, reserving 28 pixels of the requested window height for native chrome. In each case the panel client height and scroll height were both 494 pixels, with all five primary actions and both detail entries visible.
- Primary buttons and detail summaries measured 40 pixels high. Tab order and keyboard activation, visible focus, default collapsed state and technical-copy disclosure passed.
- First Copy Diagnostics generated a preview without a clipboard command. Explicit reviewed copy passed the displayed synthetic preview ID to the existing service.
- Localized opener failure feedback remained visible without overflowing the default viewport.
- Expanded details at 420 × 332, including a CSS 20-pixel text enlargement check, remained reachable by internal scrolling with no horizontal overflow. This is browser reflow evidence only.
- No page exceptions occurred. The screenshots show a synthetic empty registry, so the tool count is zero.

## Native and device limits

`pnpm tauri dev` built and launched using an independent local port after the sandbox blocked the first default server start. Desktop automation timed out twice while acquiring application state. The actual native About window, drag resizing, system text/display scaling and Windows behavior remain pending manual acceptance. A supplementary WebKit attempt stalled during startup and was stopped without a validation result.

The broader existing tasks 4.2, 7.3, 7.4 and 7.5 retain their pending acceptance scope.
