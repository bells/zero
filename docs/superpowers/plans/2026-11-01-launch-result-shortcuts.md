# Launch Result Shortcuts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Directly activate the first nine current Launch results using platform-local numeric chords.

**Architecture:** Keep keyboard mapping in a pure Launch helper and pending/identity checks in its controller. Reuse the shared panel/floating view and existing Rust activation command.

**Tech Stack:** React 19, TypeScript, Tauri 2; existing Node test harness.

**Spec:** `docs/superpowers/specs/2026-11-01-launch-result-shortcuts-design.md`

## Global Constraints

- macOS Command+1–9; Windows Ctrl+1–9; local Launch scope only.
- Preserve ranking, action labels, Enter selection, window dimensions, error handling and successful floating dismissal.
- No TypeScript `any`, new dependencies, new IPC, or OpenSpec archive.

## Review Focus

- A new query arriving during an older in-flight search must disable execution until the latest results are ready.
- Background running-state refresh must also disable numeric shortcuts until complete.
- The displayed item identity and revision must survive reordering safely.
- Focus on result/refresh controls, repeated keydown and IME must not bypass guards.
- Narrow panels must keep shortcut labels legible without hiding action text.

### Task 1: Numeric shortcuts and result freshness

**Files:** Create `src/plugins/quickLauncher/quickLauncherShortcuts.ts`; modify `quickLauncherScheduling.ts`, `useQuickLauncher.ts`, and `scripts/prepare-test-fixtures.mjs`; add focused shortcut and scheduler tests.

**Interfaces:** Produce platform shortcut metadata, event-to-result-index parsing, and stable displayed-result activation resolution. Extend `LatestQueryScheduler` with synchronous `isPending()` and a pending-change notification.

- [x] Write behavior tests covering platform modifiers, invalid keys/modifiers, repeat/composition, pending transitions, stale query suppression and stable ID/revision resolution.
- [x] Run fixture preparation followed by focused Launch tests; confirm failures for missing behavior.
- [x] Implement pure helpers and controller protections, including a numeric activation method that never waits to reinterpret a result index.
- [x] Run focused tests, then the frontend suite. Expected: all pass.

### Task 2: Shared view and validation

**Files:** Modify `QuickLauncherView.tsx`, `src/App.css`, and bilingual `i18n.ts` as needed.

**Interfaces:** Consume the Task 1 numeric activation method and shortcut metadata. Both surfaces render shortcuts from absolute result indices.

- [x] Add local keyboard handling, accessible shortcut metadata, first-nine hints, and a compact responsive action/hint group.
- [ ] Verify search, control focus, Enter, scrolling, empty/missing positions, repeated keys and activation behavior in a rendered fixture and real macOS Tauri flow.
- [x] Run `pnpm test`, `pnpm build`, `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json`, strict OpenSpec validation and `git diff --check`. Run Rust checks as appropriate to the unchanged IPC/native boundary.
- [x] Request a fresh final review and address material findings; record evidence and any unavailable device checks.

## Execution record

- Baseline: clean checkout, 404 frontend tests passed.
- Workspace: local branch `codex/launch-result-shortcuts` in the selected checkout; no worktree relocation was needed for this bounded edit.
- The user explicitly requested implementation of the approved design, so execution proceeds inline without another approval round.


## Verification evidence (2026-11-01)

- `pnpm test`: 408 passed, 0 failed. `pnpm build`: passed. Build graph budget: no findings or forbidden eager imports (`/tmp/zero-build-graph.json`).
- Rust fmt/check: passed. Initial sandbox Rust test run had native clipboard and Vision OCR failures; the preserved first output is `/tmp/zero-launch-rust-tests.log`. Serial execution with system service access passed 426 tests, with three intentional ignores across suites (`/tmp/zero-launch-rust-serial.log`). No Rust source was changed.
- `openspec validate --all --strict`: 39 passed, 0 failed; no OpenSpec tasks were changed or archived. `git diff --check`: passed.
- Fresh review found one P2: running-state probing was not itself a numeric-activation blocker. A synthetic browser test using the real hook/view reproduced one unexpected activation with the probe promise unresolved, then passed after adding the synchronous and rendered probe guard.
- Browser plugin unavailable; used installed Playwright and Chrome with official Tauri IPC mocks and synthetic app data. Both macOS panel semantics and Windows floating semantics passed: first/ninth/missing digits, mixed applications/settings, refresh-button focus, pending searches and successors, repeated/composing keys, failure feedback, Enter selection, hidden/resumed presentation and focus outside Launch. Viewports 760×520 and 360×600 had no horizontal overflow or app page errors. Fixture-only Vite HMR websocket warnings were observed; they did not affect the production component checks.
- Temporary browser harness/logs/screenshots are under `/tmp/zero-launch-qa/`; no test applications or personal usage data were read.
- `pnpm tauri dev` successfully built and started the real desktop binary after the sandbox refused the local dev port. Native UI automation timed out twice (`timeoutReached`), so real macOS physical shortcut/focus/dismissal acceptance remains unverified. Windows behavior above is synthetic browser evidence, not Windows-device acceptance. The native/manual step above remains unchecked for this reason.
- The subsequent user request authorizes committing and pushing this change on `codex/launch-result-shortcuts`; merging and OpenSpec archiving are outside this delivery scope.
