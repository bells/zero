# ZTool System Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom system section with Preferences, About, Exit, real login autostart, and configurable tool visibility.

**Architecture:** Keep plugin panels focused on tool behavior. Add a `preferences` plugin-support module for persistent UI preferences and a small Rust app command module for quitting the app. Use Tauri's official autostart plugin for real OS startup registration.

**Tech Stack:** React 19, TypeScript, Tauri 2, `@tauri-apps/plugin-autostart`, `tauri-plugin-autostart`, Node test runner.

---

## Tasks

### Task 1: Preference Model

- [ ] Write tests for visibility normalization and last-visible-tool protection.
- [ ] Implement `preferencesModel.ts`.
- [ ] Verify the model tests pass.

### Task 2: Native App Commands And Autostart

- [ ] Add autostart dependencies.
- [ ] Register `tauri-plugin-autostart`.
- [ ] Add `quit_app` command.
- [ ] Add autostart permissions.

### Task 3: Preferences UI

- [ ] Add `usePreferences` to bridge local preferences and real autostart.
- [ ] Add `PreferencesPanel` and `AboutPanel`.
- [ ] Update `App.tsx` so the shell has tool list, content panel, and bottom system strip.
- [ ] Apply tool visibility filtering and selected-tool fallback.

### Task 4: Visual Polish

- [ ] Update CSS for the third section, settings toggles, and about view.
- [ ] Keep the 400 x 500 tray window dense and readable.

### Task 5: Verification

- [ ] Run preference model tests.
- [ ] Run `pnpm build`.
- [ ] Run `cargo check`.
- [ ] Run `cargo test`.
- [ ] Run `pnpm tauri dev`.
