# Snap startup follow-up, 2026-10-27/28

Scope: continue the existing change's startup investigation. The maintainer confirmed the slow experience occurs under `pnpm tauri dev`, reported the first optimization felt faster for Option+A but the menu still delayed, and asked to continue. After confirming the final native menu behavior, the maintainer authorized a scoped local commit. Push, archive and release remain outside this request.

## Environment and timing boundaries

- macOS 27.0.1, arm64; Node 24.20.0, pnpm 10.33.0. Native development command: `ZERO_PERFORMANCE_TRACE=1 ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev`. The File flag only enables that unrelated debug engine fallback.
- The maintainer physically triggered captures and explicitly confirmed all three current menu captures revealed with a stationary pointer and contained no residual Snap menu. Exact physical presentation was not independently recorded.
- `entry → show` is `snap_entry:*` through the end of `snap_startup:trigger_to_reveal`. The latter duration alone excludes menu dismissal. `surface_reveal:capture` is the later frontend frame acknowledgment, not a monitor presentation timestamp.
- `webview_build` measures the builder returning; it is not frontend readiness. The gap from its start to `frontend_mount` exposes page/module/React startup. The reported `frontend_mount` duration itself only covers the init IPC.
- Stages overlap and must not be summed. The desktop contents differ across samples, so these small sample sets are diagnostic measurements, not stable percentile or release benchmarks.

## Native measurements

| Source state / entry | Entry → native show | Entry → frame acknowledgment | Native capture | PNG write | WebView start → frontend init | Menu dismissal | Media reads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original source, shortcut (Oct 27) | 2858.30 ms | 2885.85 ms | 336.99 ms | 1882.03 ms | 437.99 ms | — | 2 |
| Four optimized dependencies + disposed guard, first shortcut | 822.26 ms | 858.89 ms | 83.73 ms | 176.79 ms | 450.23 ms | — | 1 |
| Same intermediate source, repeated shortcut | 761.11 ms | 784.10 ms | 67.44 ms | 183.97 ms | 441.93 ms | — | 1 |
| Same intermediate source, menu | 863.24 ms | 889.93 ms | 64.54 ms | 185.46 ms | 439.27 ms | 105.06 ms | 1 |
| Current source, first menu after process restart (Oct 28) | 515.191 ms | 563.006 ms | 86.881 ms | 123.873 ms | 191.740 ms | 3.110 ms | 1 |
| Current source, second menu | 428.638 ms | 463.952 ms | 52.009 ms | 125.010 ms | 151.495 ms | 5.741 ms | 1 |
| Current source, third menu | 400.181 ms | 430.467 ms | 44.137 ms | 129.013 ms | 151.220 ms | 2.793 ms | 1 |

The first four rows were read from live `ZERO_PERF` output on Oct 27 and retained in this conversation; their temporary log files were no longer present on Oct 28. The final three rows and fixed-field events are preserved in [startup-native-2026-10-28.json](startup-native-2026-10-28.json). All three current sessions reached successful native reveal and a frame acknowledgment, and the maintainer could invoke the menu repeatedly. The maintainer separately confirmed stationary-pointer reveal and no residual menu pixels; that is user device evidence, distinct from the logs.

## Findings and implemented changes

1. **Development pixel/PNG work dominated the original delay.** Optimize `xcap`, `image`, `png`, `fdeflate`, `simd-adler32` and `crc32fast` in Cargo's dev profile only. Application code stays unoptimized/debuggable; release profile and feature selection do not change. Keep the existing adaptive lossless PNG path. A 3024×1964 synthetic experiment with three repetitions measured adaptive encoding around 649–653 ms before the first four dependency overrides and 123–125 ms afterward, at exactly 270,666 bytes. Fixed Sub/Up filters increased output to 1,448,369/1,999,865 bytes and were not adopted. A separate checksum probe observed an additional 43–66 ms for Adler32 and 8–9 ms for CRC32 on that 24 MB buffer, motivating the final two overrides. These synthetic figures are not native screenshot timings.
2. **StrictMode replay duplicated full-image work.** Check disposal immediately after init and media-read IPC. Abandoned work no longer reads/decodes another image; already-received bytes still run through `finally` cleanup. StrictMode, media-size validation and the decoded/committed image reveal gate remain enabled.
3. **The hidden capture route paid a Suspense fallback retry delay.** Resolve the existing surface loader before mounting the capture root. React's loading fallback serves no visible purpose for a window that stays hidden until ready. Keep other surfaces lazy and preserve the diagnostic boundary for import failures. The native WebView-to-init gap dropped from roughly 440 ms to 151–192 ms. No permanent warm window or pre-captured image was introduced.
4. **Menu capture always slept for 100 ms.** Clear its retained tray menu synchronously before capture. In the pinned Tauri/tray-icon/muda implementation, this releases the menu and invokes `cancelTrackingWithoutAnimation`. Normal measured dismissal is now 3–6 ms. Keep the old delay if explicit release fails; subsequent grouped clicks recreate their menus. The menu trigger trace now begins before worker dispatch.

Remaining cost is measurable: current repeated captures still spend about 125–129 ms writing PNG, 151 ms loading/mounting the new WebView, 44–52 ms acquiring pixels and 46–47 ms decoding. The result is faster, not instantaneous. Further work should measure release behavior and compare lifetime/resource tradeoffs before introducing prewarming or a different media contract.

## Verification

| Check on current source (Oct 28) | Result |
| --- | --- |
| `pnpm test` | 395 passed, 0 failed |
| `pnpm build` | passed; full profile includes five tools |
| build-graph with separate `/tmp` output | passed; tracked historical evidence unchanged |
| `cargo check --locked`, `cargo fmt --check` | passed |
| Full native serial `cargo test --locked -- --test-threads=1` | 398 passed, 0 failed, 3 ignored |
| `tests/browser/snap-startup.mjs`, installed Chrome / synthetic IPC | 3 groups passed: StrictMode single media load and Esc; actual `main.tsx` capture route without fallback; import failure reaches diagnostic boundary without reveal |
| Existing `tests/browser/snap-annotation.mjs` | 17 interaction groups passed, including selection/history/text and synthetic Copy/Save/Pin composition |
| Independent read-only code review | no actionable P1/P2 findings; native visual limits retained |
| Maintainer's current native menu validation | three successive captures; stationary pointer automatically reveals; no residual Snap menu |
| Strict OpenSpec / local links / diff whitespace | 36 items passed; 10 local links and saved measurement JSON valid; diff check passed |

The new browser regressions observed RED first (`2 !== 1` media reads; `1 !== 0` loading-fallback commits), then GREEN after the corresponding fixes. Their phrase “production capture route” means the application entry source under Vite, not a release bundle measurement.

Initial environment/repair results are retained separately: Oct 27 sandbox Vite startup could not bind `::1:1420`, so permitted native startup was used; the default Playwright browser was absent, so tests used the already installed Chrome. A temporary fixture block-scope mistake was fixed before the intended failing route assertion. Oct 28's first native compile caught a missing `Menu<Wry>` generic parameter; the corrected build and full test run passed. No tests were weakened. The previous interrupted sandbox-native test run has no completion result and is not counted as passing.

Commit preflight on Oct 28 reran the frontend tests (395 passed), build, build-graph budget, Rust format/check and strict OpenSpec validation (36 passed). The first serial Rust run, concurrent with the frontend gates, stopped at the existing File test `direct_runner_preserves_argument_boundaries_and_bounds_output` after its one-second child-process deadline (285 passed, 1 failed, 2 ignored). The unchanged test passed in isolation; a subsequent full serial run after the frontend gates completed passed all 398 tests, with 3 ignored. This does not establish the exact cause of the initial timeout. Both results are retained in `/tmp/zero-snap-commit-rust-test.log` and `/tmp/zero-snap-commit-rust-retry.log`; no unrelated implementation or timeout was changed.

Current detailed test logs are `/tmp/zero-snap-startup-*-20261028.log`, `/tmp/zero-snap-startup-rust-final.log` and `/tmp/zero-snap-annotation-20261028.log`; temporary logs may be cleaned by the system. The measured final events above are intentionally stored in the change as content-free evidence.

## Permissions and remaining device gates

The actual Oct 27 development process passed screen-capture permission preflight and completed captures. The user's `Zero Snap.app` search entry is a shell forwarder to `/Applications/Zero.app`; its permission-list presence alone does not establish the running main/debug executable's identity. No macOS permission was changed.

Automatic approval review rejected an attempted full Finder desktop screenshot because it could include private documents unrelated to menu-position validation. No alternate screenshot mechanism was used. Continue using fixed-field timing logs and maintainer observations for this session.

Tasks 2.1, 2.4 and 5.2 remain open for the rest of the native matrix: display-edge/multidisplay positioning and controlled first/repeated shortcut/menu/main comparisons on final source. Current menu repetition, stationary-pointer reveal and absence of fading-menu pixels are now confirmed by the maintainer; do not repeat them as unexecuted gates. Windows task 4.3 remains independently open. No Windows runtime, installer, release or File-engine approval is implied.
