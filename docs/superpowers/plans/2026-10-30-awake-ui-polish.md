# Awake UI polish implementation plan

**Goal:** Apply the approved quiet, compact, native-aware direction to Awake's tray, main workspace and battery preferences.

**Architecture:** Keep native scheduling, power policy, IPC contracts and the session hook unchanged. Use plugin-owned React presentation and CSS, reusing the host's preference classes. No new dependencies.

**Design:** The maintainer approved the review in chat on 2026-10-30: smaller neutral status ring; presets and custom editing share one control area; one primary submit action; battery preferences match the existing settings rows and width. Preserve the eight presets, both custom modes, cancellation without mutation, explicit policy saving, and an accessible stop action while editing a running session.

## Tasks

- [x] Update `CaffeinePanel.tsx`, `caffeine.css` and `i18n.ts`: separate status and plan regions, replace appended editor with an alternate view, distinguish primary/secondary actions, maintain keyboard focus.
- [x] Update `AwakeSettings.tsx` and plugin CSS: reuse preference sections/rows/switches, group threshold with its toggle, show the percentage once, keep feedback and capability states.
- [x] Verify existing frontend tests/build/bundle budget and strict OpenSpec validity. Inspect Chinese/English at 920×660, 760×520 and 400×500 using mocked IPC, including cancel, invalid input, start, running edit/stop, settings save and keyboard navigation. Launch `pnpm tauri dev` and inspect the available macOS flow separately.

## Review focus

- Draft edits and cancellation must not mutate a live session.
- Starting or applying a custom schedule has one clear primary action; stopping stays accessible.
- Both custom modes and long English labels fit the tray; main controls remain reachable in a short window.
- Preference search target IDs and unavailable/disabled controls remain intact.
- Shared host styles must not be changed in a way that affects other plugins.

## Verification record

Implementation and rendered checks completed. Frontend tests: 401 passed; build and bundle budget passed; Rust fmt/check passed; native serial Rust rerun: 404 passed, 3 ignored (the initial sandbox pasteboard/Vision failures are preserved). OpenSpec: 38 passed. See `openspec/changes/add-awake-custom-schedules/evidence/ui-polish-2026-10-30.md`.

Native startup was attempted, but the UI automation connection timed out. Native UI and Windows-device acceptance remain with the maintainer, who requested that further verification stop. No commit, push or archive was performed.
