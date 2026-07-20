# Quick Launcher feasibility record

This record fixes the dependency and platform choices made before the fourth bundled plugin is released. The production UI remains a bundled React `webview`; there is no `plugin.wasm` runtime.

## Search and romanization

- Selected adapter: `nucleo-matcher 0.3.1` behind the launcher search module. It is MIT licensed, Unicode-aware, actively used by the Helix/Nucleo ecosystem, and keeps match state reusable across queries.
- Comparison adapter: `fuzzy-matcher 0.3.7` is a dev-only benchmark dependency. It is MIT licensed but has a less active release history and its Skim adapter ranked aliases and mixed Chinese/English fields less consistently without additional score tiers.
- Selected romanizer: `pinyin 0.11.0`, MIT licensed, behind the `Romanizer` trait. Fixtures cover simplified `微信`, traditional characters, ASCII preservation, full spelling, initials, and deterministic first-pronunciation fallback for polyphonic characters. User-defined pronunciation is outside this change.
- Release command: `cargo test --release --test quick_launcher_benchmark -- --ignored --nocapture`.
- The deterministic benchmark contains 10,000 English, Chinese, pinyin, initial, acronym, and alias records. Its output reports p50/p95 for both adapters; the Nucleo p95 assertion is `< 5ms`.
- Reference run (2026-07-20): Apple M2 MacBook Pro, 8 CPU cores, 16 GB memory, release profile. `nucleo-matcher` measured p50 `4.021ms` and p95 `4.479ms`; `fuzzy-matcher` measured p50 `2.585ms` and p95 `3.411ms`. Nucleo satisfies the `< 5ms` gate and remains selected for its Unicode/mixed-field match quality and adapter fit.

## Filesystem and native adapters

- `notify 8.2.0` (CC0-1.0) watches only known macOS and Windows application roots. Missing or denied roots are diagnostics, events are coalesced for about 500ms, refresh is single-flight, and dropping `QuickLauncherState` drops the watcher.
- `plist 1.x` parses macOS `Info.plist`. The narrow AppKit adapter uses the already-present Cocoa/Objective-C bindings for `NSWorkspace` icons/opening and `NSRunningApplication` probing/activation.
- The existing `windows 0.52` dependency provides COM `.lnk` resolution, process/window identity, `SetForegroundWindow`, `ShellExecuteW`, and Shell icon extraction. Windows icon conversion uses the already-resolved `image 0.25` PNG encoder with only its PNG feature.
- All dependencies use licenses compatible with this project (MIT/Apache-2.0/CC0-1.0). Production dependencies are target-scoped where they call platform APIs; `fuzzy-matcher` is dev-only and does not affect the shipped binary.

## Platform verification

- macOS native compilation and automated tests run locally. A 2026-07-20 Tauri dev smoke run indexed 137 applications/settings, rendered native application icons, matched `wx` to WeChat/企业微信, opened the Display settings panel through the catalog URI, focused an already-running ChatGPT instance, cold-launched Calculator, and dismissed the single floating window after activation and `Escape`.
- `x86_64-pc-windows-msvc` is installed and CI runs Windows compilation/tests on a Windows runner. Cross-checking the full Tauri graph from macOS additionally requires Windows SDK headers because the existing `aws-lc-sys` dependency compiles C code; a macOS-only Rust target install is insufficient.
- The remaining macOS matrix (every catalog link, install/uninstall watcher events, deliberate cache corruption, shortcut conflict, plugin-disable behavior) and the equivalent Windows manual checklist remain open in the OpenSpec tasks.
