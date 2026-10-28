# Awake custom schedules implementation — 2026-10-28

## Scope and evidence boundary

Implemented custom schedules, native authoritative timing, battery protection, versioned input/policy preferences, retained custom-editor navigation, and the optional bundled settings extension. Only this change's task statuses are updated. Packaging release, spec sync and archive remain outside this delivery. Commit and push were separately authorized on 2026-10-29.

Source/automated results below do not establish native menu, sleep/resume, installed-package or Windows-device acceptance. Task 2.4 remains open for executable Windows ownership/cleanup validation; tasks 7.3 and 7.4 retain the full device matrices.

## Dependency and API decisions (1.1)

- Reuse browser `Date` local calendar resolution and explicitly search repeated clock occurrences. Domain tests cover cross-midnight, New York spring gaps/fall repetitions, expired previews, and local display after time-zone changes. No JavaScript dependency was added.
- Reuse the existing pinned transitive `chrono 0.4.44` as a direct optional bundled-tools dependency, with only clock/std features. License: MIT OR Apache-2.0, checked in the cached crate's LICENSE.txt. Native Until validation compares local calendar dates through `chrono::Local`; tomorrow is not treated as a fixed 1440 minutes.
- Reuse the host's controlled plugin storage, quota/path checks and atomic replacement. Persist only version, confirmed input and battery policy under the Awake plugin data directory; never enabled state, session timestamps or an absolute historical deadline. A single native mutex serializes read/merge/save and commits effective policy only after persistence succeeds.
- macOS elapsed clock: `mach_continuous_time` plus the platform timebase. The installed Apple SDK `mach/mach_time.h` explicitly describes it as advancing during sleep. Windows elapsed clock: `GetTickCount64`, through the existing `windows` crate. `ClockReading`/`SessionTiming` tests inject independent wall/continuous readings; no assumption that Rust `Instant` includes suspension.
- macOS power: IOKit power-source snapshots/notifications, `NSProcessInfo.isLowPowerModeEnabled`, low-power notifications and workspace wake notifications. External power comes from Power Source State, independently of charging. Windows: `GetSystemPowerStatus`, power-setting and resume callbacks. API shapes/constants checked against cached platform bindings; Windows source cross-check is separate from device acceptance.
- One bounded native power-reader queue and a two-second response timeout avoid unbounded worker creation on stalled reads. Unknown readings remain explicit and are retried; native events trigger fresh reads, with a correction at most every 30 seconds while protection is needed. Finite expiry has a separate one-second native task so a power-read timeout cannot hold its waiting loop.

## Implementation and regression map

| Tasks | Implementation / verification |
| --- | --- |
| 1.2–1.3 | Symmetric tagged schedule, extended snake_case snapshot/action errors, custom input parser, calendar preview and reconfirmation. Wire/boundary tests for 1/45/1440, invalid fractions/overflow/past targets, legacy presets, DST and presentation clocks. |
| 2.1–2.3 | Continuous elapsed duration versus fixed-wall Until; one lifecycle coordinator, generation-bound timers, explicit caller checks. Failed native start/stop retains the prior session; expiry/protective stops publish truthful reasons only after successful release. Clock errors propagate. Native hidden expiry/device suspend remain in 7.3/7.4. |
| 2.4 (partial) | Windows enable/disable/cleanup now run on a dedicated owning thread. Drop closes its channel and joins the thread, whose final action releases its execution state. Windows compilation passed; executable/device validation remains open. |
| 3.1 | Native versioned input memory; apply first, then save. Saving failure is nonfatal and visible. Store tests cover merged input/policy, unrelated storage preservation, injected write failure, corrupt reads, last-valid-policy retention and absence of persisted sessions. |
| 3.2 | Awake-only typed menu action routes to a retained host navigation intent/revision. The lazy panel consumes the intent after mounting; repeated intent preserves its draft. Existing main-navigation and menu scoping tests pass; mock browser interaction confirmed no mutation during repeated entry. Actual native menu remains in 7.3. |
| 4.1–4.3 | Shared hook/editor with isolated drafts, busy guard, stale refresh rejection, authoritative elapsed/remaining, actual Until date, accurate custom duration and checkmarks. Bilingual rendered browser checks detailed below. |
| 5.1–5.5 | Source/no-battery/unknown capabilities, bounded reader, independent policies, inclusive threshold and session override. Rule tests cover external without charging, missing/unknown battery details, low-power refusal despite threshold override, unknown recovery semantics and bounded timeout/queue behavior. Session/native failure and monitor-replacement tests cover stop truthfulness and stale workers. Physical power events/resume remain unverified. |
| 6.1–6.3 | Optional trusted bundled settings loader/search metadata through appShell to abstract core slots. Awake owns the settings UI and translations; no plugin import in core. Default switches off, threshold keyboard step 5%, save/stop-failure feedback. Session interfaces contain status notices without policy controls. All three frontend profiles and core Rust checks passed. |

## Independent review fixes

A separate reviewer checked the uncommitted implementation against the design/specs and reported three actionable issues, all fixed:

1. Protection workers already inside `spawn_blocking` survive async cancellation. Add a distinct monitor revision, checked again under the lifecycle gate, so a policy save cannot let an older worker combine stale power with the new policy for the same session generation. Regression: `replaced_monitor_rejects_workers_in_flight_for_the_same_session`.
2. Low-power mode can be known while battery percentage/details are unknown. Evaluate the known mode independently, while retaining the no-battery exemption. Regression: `known_low_power_state_is_enforced_when_battery_details_are_unknown`.
3. A policy save can succeed while native stop fails. Preserve saved feedback and explicitly report the failed stop in settings. Regression: `policy save reports native stop failure separately from successful persistence`.

Browser verification also exposed the sticky session button covering custom confirmation at 760×520. The session action becomes static while editing; subsequent screenshot/keyboard checks showed both Cancel and Apply unobstructed. Closing/confirming returns focus to Custom. Correcting an invalid draft clears its stale validation message.

## Rendered browser verification (mock IPC)

The reproducible [harness](ui-harness.html) uses Tauri's official mocks and the production panel/settings modules. Run `pnpm dev`, then open `/openspec/changes/add-awake-custom-schedules/evidence/ui-harness.html`. This is a development test harness, excluded from application entry points. It never creates a native Awake request or writes real preferences.

Observed through the in-app browser:

- 920×660 main, 760×520 main and 400×500 tray layouts, Chinese/English labels, visible focus, scrolling and reachable custom actions; main retains the elapsed dial, tray uses timing rows.
- Initial one-hour draft, 45-minute draft/application, reopening remembered input, repeated Custom intent retaining edits without increasing the mutation count.
- Zero duration shows validation and makes no startup call. Until keyboard input updates its actual date/time preview; explicit Start yields `Until Today …` with no No limit checkmark and a single running remaining value.
- Confirming a custom session returns focus to Custom. Draft controls and Cancel/Apply are reachable with the keyboard in compact layouts.
- Battery settings start with both rules off/10%; enabling threshold and pressing ArrowRight yields 15%, Save yields localized saved feedback, with the second switch independent. Narrow layout remains scrollable.

The harness is source/UI evidence, not native IPC, main preferences-host navigation, real power, sleep/resume or installed-app evidence. Browser time-input `fill` did not dispatch the React change consistently in this automation bridge; keyboard ArrowUp was used and the resulting preview was verified.

## Native attempt and remaining device work

`pnpm tauri dev` successfully compiled and launched `target/debug/zero`. Computer Use could not attach: Zero and SystemUIServer app connections returned `timeoutReached`; selecting the development executable reported Invalid app. A temporary local debug App wrapper also failed to attach. The attempted wrapper is not an installer/release artifact. Native interaction was therefore not established, and no native task is marked complete from browser results.

Still required on macOS: actual Awake menu → main intent, primary toggle/default infinity, both languages/surfaces, replacement/cancel, hidden real expiry, wall/time-zone adjustment, suspension/resume, real external-not-charging/unplug/threshold/system mode, policy save/unknown/read failure, cleanup and restart behavior.

No Windows device was available. Required: the Windows thread execution-state lifecycle, all input/menu fallback paths, hidden expiry/replacement, real clocks/resume/power capabilities, protection/override/error paths, preferences and restart. A passing `cargo xwin check` is not a Windows runtime result.

## Automated commands and logs

Final results are recorded below after the last verification. Logs are local `/tmp` artifacts, not release evidence.

- `pnpm test`: 401 passed, 0 failed. `/tmp/zero-awake-frontend-final.log`.
- `pnpm build`: full passed; core and standard each also built and passed the profile verifier. Final full frontend module count: 85. `/tmp/zero-awake-build-final.log`, `/tmp/zero-awake-core-build.log`, `/tmp/zero-awake-standard-build.log`.
- `node scripts/performance/build-graph.mjs --check --output /tmp/zero-awake-custom-build-graph.json`: passed. Tracked historical build evidence was not rewritten.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `cargo check --manifest-path src-tauri/Cargo.toml --locked`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1`: 404 passed, 0 failed, 3 ignored across library/integration/doc suites. `/tmp/zero-awake-rust-final.log`.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked --no-default-features`: core passed.
- `cargo xwin check --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --no-default-features --features bundled-tools`: passed, with existing platform unused-code warnings. `/tmp/zero-awake-windows-final.log`.

First full Rust run is preserved in `/tmp/zero-awake-rust-full-first.log`: 285 passed / 3 failed / 2 ignored in the library suite, involving Vision OCR, native pasteboard and File's one-second child-process test. Outside-sandbox serial rerun resolved OCR/pasteboard but the timed File test still failed; its isolated rerun passed (0.09 seconds). Subsequent complete serial run passed. No tests or unrelated runtime code were weakened to hide these failures.

`openspec validate --all --strict`: 37 passed / 0 failed. Changed documentation link targets and `git diff --check` passed. Final task progress: 22/25; only 2.4, 7.3 and 7.4 remain open. No other change's task file was modified.

## Commit verification — 2026-10-29

Fresh validation before committing found a previously misreported budget result: the initial entry was 291,081 bytes against a 285,000-byte limit. The expanded Awake editor/battery dictionary was still statically imported by its descriptor. Move the translator and panel adapter into the existing lazy panel module; keep only compact navigation/search metadata eager. Existing lazy-renderer source contracts remain intact.

After correction the initial entry is 284,006 bytes (87,673 gzip bytes), with no budget findings or forbidden eager imports. The budget limit is unchanged. `pnpm test` reran with 401 passing; full build and graph check passed. Fresh Rust format/check/full serial tests passed: 404 passed, 0 failed, 3 ignored. OpenSpec strict validation: 37 passed, 0 failed. Commit logs: `/tmp/zero-awake-commit-frontend.log`, `/tmp/zero-awake-commit-build.log`, `/tmp/zero-awake-commit-build-graph.json`, `/tmp/zero-awake-commit-rust.log`, `/tmp/zero-awake-commit-openspec.log`. Device tasks 2.4, 7.3 and 7.4 remain incomplete.
