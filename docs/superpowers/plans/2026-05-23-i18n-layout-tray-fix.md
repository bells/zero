# I18n Layout And Tray Toggle Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix repeated tray-click toggling, keep the third system section visible in a fixed-size tray window, and add Chinese/English language preferences with system default.

**Architecture:** Keep tray click state in Rust with a dedicated last-toggle debounce timestamp. Keep language preference in the existing frontend preferences model and resolve UI strings through a small local i18n dictionary.

**Tech Stack:** Tauri 2, React 19, TypeScript, Node test runner.

---

## Tasks

### Task 1: Preference And I18n Model

- [ ] Add tests for language normalization and system-language resolution.
- [ ] Add `language` to preferences.
- [ ] Add i18n dictionary and resolver.
- [ ] Verify model tests pass.

### Task 2: Tray Toggle Fix

- [ ] Replace show-time debounce with last-toggle debounce.
- [ ] Keep tray show/hide positioning behavior.
- [ ] Verify with Tauri dev startup.

### Task 3: Fixed Layout And Translated UI

- [ ] Fix shell dimensions to the Tauri window.
- [ ] Reduce tool list and second-section heights.
- [ ] Add language selector to Preferences.
- [ ] Translate App, Preferences, About, Screenshot, and Caffeine visible text.

### Task 4: Verification

- [ ] Run frontend model tests.
- [ ] Run `pnpm build`.
- [ ] Run `cargo check`.
- [ ] Run `cargo test`.
- [ ] Run `pnpm tauri dev`.
