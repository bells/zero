# Tray Window And Shortcut Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ZTool behave more like a pure tray utility: non-topmost rounded window, no Dock/taskbar presence, always-visible system section, and a global screenshot shortcut.

**Architecture:** Keep the visual changes in the React screenshot panel and global CSS. Keep native window behavior in Tauri config and shortcut registration in `src-tauri/src/lib.rs` using the official global shortcut plugin.

**Tech Stack:** Tauri 2, `tauri-plugin-global-shortcut`, React 19, TypeScript, CSS.

---

## Tasks

### Task 1: Shortcut Presentation Model

- [ ] Add a failing Node test for the screenshot shortcut label and action copy.
- [ ] Implement a tiny screenshot metadata module.
- [ ] Verify the Node test passes.

### Task 2: Native Tray Behavior

- [ ] Set `alwaysOnTop` to false.
- [ ] Ensure the app stays hidden from Dock/taskbar where Tauri supports it.
- [ ] Add global shortcut dependencies and permissions.
- [ ] Register `CommandOrControl+Shift+A` to trigger screenshot copy.

### Task 3: UI Density And Screenshot Copy

- [ ] Compress the tool list and current tool section.
- [ ] Keep the bottom system strip visible by default.
- [ ] Remove reference wording from the screenshot tool panel.
- [ ] Show shortcut and usage guidance in the screenshot panel.

### Task 4: Verification

- [ ] Run shortcut/model tests.
- [ ] Run `pnpm build`.
- [ ] Run `cargo check`.
- [ ] Run `cargo test`.
- [ ] Run `pnpm tauri dev`.
