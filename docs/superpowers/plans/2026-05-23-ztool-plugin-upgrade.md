# ZTool Plugin Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade caffeine and screenshot into plugin-shaped tools, with a polished screenshot visual direction delivered in a phase-1 cross-platform way.

**Architecture:** Split frontend features into `src/plugins/caffeine` and `src/plugins/screenshot`, with a compact app shell in `src/App.tsx`. Split Rust commands into `commands` and platform services so macOS and Windows behavior can evolve independently.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript, Vite, CSS modules via existing global CSS.

---

## File Structure

- Modify: `src/App.tsx` to render plugin navigation, detail panes, and shared status.
- Modify: `src/App.css` to replace template styling with tray-control-center UI and screenshot preview styling.
- Create: `src/plugins/types.ts` for plugin metadata and status types.
- Create: `src/plugins/caffeine/useCaffeinePlugin.ts` for caffeine state, elapsed timer, and invoke calls.
- Create: `src/plugins/caffeine/CaffeinePanel.tsx` for the caffeine plugin UI.
- Create: `src/plugins/screenshot/useScreenshotPlugin.ts` for platform capability and screenshot invoke calls.
- Create: `src/plugins/screenshot/ScreenshotPanel.tsx` for phase-1 screenshot UI.
- Modify: `src-tauri/src/lib.rs` to register modules and preserve tray behavior.
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/caffeine.rs`, `src-tauri/src/commands/screenshot.rs`.
- Create: `src-tauri/src/services/mod.rs`, `src-tauri/src/services/caffeine.rs`, `src-tauri/src/services/screenshot.rs`.

## Tasks

### Task 1: Rust Feature Modules

- [ ] Create command and service modules for caffeine and screenshot.
- [ ] Move `AwakeState`, process cleanup, and platform toggling into `services/caffeine.rs`.
- [ ] Add `get_caffeine_state`, `toggle_keep_awake`, `get_screenshot_capabilities`, and `start_screenshot`.
- [ ] Keep macOS custom path as phase-ready capability metadata and use current system launcher until the frontend overlay backend is added.
- [ ] Register commands in `lib.rs`.
- [ ] Run `cargo check` in `src-tauri`.

### Task 2: Frontend Plugin Model

- [ ] Add plugin metadata types.
- [ ] Build caffeine hook and panel.
- [ ] Build screenshot hook and panel with platform capability loading.
- [ ] Refactor `App.tsx` into plugin navigation plus selected panel.
- [ ] Preserve simple status feedback for native command failures.

### Task 3: Screenshot Phase-1 UI

- [ ] Replace `App.css` with compact tray UI styling.
- [ ] Add screenshot preview with dark overlay, green selection, dimensions, handles, and toolbar buttons.
- [ ] Mark pending annotation buttons visually disabled while active actions remain clear.
- [ ] Add caffeine status, elapsed timer, and native state chip.

### Task 4: Verification

- [ ] Run `pnpm build`.
- [ ] Run `cargo check` in `src-tauri`.
- [ ] Start `pnpm tauri dev` if build checks pass.
- [ ] Manually verify the window renders and both commands can be invoked.
