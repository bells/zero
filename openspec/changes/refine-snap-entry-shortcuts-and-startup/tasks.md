## 1. Shortcut authority and preferences

- [x] 1.1 Add persisted Snap capture/OCR configuration and symmetric command/snapshot contracts; verify defaults, normalization, clearing, duplicate rejection and rollback with Rust/unit tests.
- [x] 1.2 Replace fall-through dispatch with exact action mapping and update registration/disable/startup conflict lifecycle; verify OCR cannot invoke capture and failed replacement retains the old binding.
- [x] 1.3 Add accessible recording/clear/reset controls to global and per-tool settings, localized errors and real menu/main hints; verify TS/unit tests, build and browser interactions.

## 2. Native menu and startup

- [ ] 2.1 Anchor the native Snap menu below the menu bar with display-edge bounds; verify geometry cases and actual macOS menu placement.
- [x] 2.2 Instrument capture preparation, media/frontend and reveal with privacy-safe timings, and record a native baseline where available; verify fixed-field contracts and evidence boundaries.
- [x] 2.3 Remove measured/proven repeated native window-list queries while preserving candidate filtering/coordinates; verify target tests and compare stage timings.
- [ ] 2.4 Diagnose stationary-pointer reveal, apply minimal evidence-backed scheduling/lifecycle fixes and record first/repeated menu/shortcut/main measurements; verify actual macOS flow or explicitly retain an unexecuted device gate.
- [x] 2.5 Follow up the measured development-build bottlenecks: optimize pixel/PNG dependencies, stop disposed frontend initialization, mount the hidden capture route without a Suspense loading fallback, and explicitly release the native menu before capture; verify automated regressions and retain the final native timing/visual matrix under 2.4.

## 3. Windows local OCR provider

- [x] 3.1 Validate a maintained CPU-native Chinese/English OCR integration and pin engine/model/dictionary source, version, license and digests; verify dependency build and a synthetic recognition corpus where runnable.
- [x] 3.2 Implement the Windows provider using shared limits, worker admission/deadlines/cancellation and validated pixel/text output; verify boundary/error tests and Windows cross-compile.
- [x] 3.3 Bundle required Windows models/runtime through deterministic resource preparation and fail closed for missing/invalid assets; verify packaging/resource checks and report measured resource size.

## 4. Windows OCR selection

- [x] 4.1 Add single-display frozen capture and OCR-only overlay using existing session/raw-media authority; verify geometry/scale/negative-origin tests and Windows cross-compile.
- [x] 4.2 Expose selection/confirm/Enter/Esc while withholding unsupported editor actions, reuse result editing/explicit copy; verify frontend interaction/unit tests and normal Windows system-launcher behavior remains intact.
- [ ] 4.3 Exercise real Windows selection, mixed DPI, cancellation, shortcuts and first-use offline Chinese/English OCR from an installation; retain this unchecked until actual Windows evidence exists.

## 5. Integrated verification and documentation

- [x] 5.1 Run pnpm test/build, build-graph with separate /tmp output, Rust fmt/check/test, strict OpenSpec validation and diff checks; preserve initial environmental failures and record exact results.
- [ ] 5.2 Run pnpm tauri dev and inspect affected macOS menu/shortcut/capture flows; separately record unavailable automation/native/Windows acceptance without claiming source checks establish runtime success.
- [x] 5.3 Update bilingual user documentation and implementation evidence including resource sizes, remaining native gates, overlapping deltas and no archive/release approval; verify links and diff whitespace.
