# Preferences Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Refine the complete preferences interface using the maintainer-approved compact hierarchy and bilingual navigation and complete tool names.

**Architecture:** Keep all existing destination IDs, state owners and IPC. Use complete tool names directly in navigation and search; add owning tool names to plugin-specific searchable settings.

**Tech Stack:** React 19, TypeScript, CSS, existing lucide-react icons and Tauri 2.

**Spec:** docs/superpowers/specs/2026-11-11-preferences-interface-design.md

## Global Constraints

- No new dependencies, persistence changes, native contracts or archives. Commit and push were explicitly requested after the interface follow-up.
- Keep full titles and stable destination/focus IDs; third-party labels fall back to titles.
- Desktop navigation 30px with zero internal row gap; coarse-pointer navigation 44px; visible keyboard focus.
- Chinese/English parity and narrow navigation/content flow remain required.

## Review Focus

- Third-party tools with long titles must wrap and remain searchable.
- Full Zero names and Chinese functional labels must both find the same setting.
- Short windows must retain scroll access to extension management.
- Shortcut controls and extension actions must wrap without clipping.
- Language switching and returning to tools must preserve valid settings context.

### Task 1: Navigation semantics and plugin-owned labels

**Files:** src/core/preferences/preferencesNavigation.ts, i18n.ts, PreferencesSettingsCenter.tsx; tests/unit/core/preferences/preferencesNavigation.test.mjs.

**Interfaces:** existing `title` on tool metadata and destinations; optional additionalSettings on the search-index input.

- [x] Add and run failing navigation/search tests for complete tool names, plugin-owned search targets and distinct overview title.
- [x] Implement localized labels, two named groups and standalone extension management.
- [x] Run the focused tests after fixture preparation; expected all pass.

### Task 2: Shared settings layout and typography

**Files:** src/appShell/mainSettings.css; src/core/preferences/PreferencesPages.tsx and PreferencesSettingsCenter.tsx.

**Interfaces:** SettingsSection supports a visually omitted heading while retaining its accessible name. Existing setting IDs and handlers remain intact.

- [x] Consolidate settings-only layout/typography rules; remove blanket oversized navigation targets and repeated page headings.
- [x] Reuse the existing icon library for search/back affordances; keep selected state and focus visible.
- [x] Inspect every destination, long labels, English, search, narrow layout and wrapped controls in the actual UI.

### Task 3: Verification and evidence

**Files:** openspec/changes/refine-preferences-interface/{proposal.md,design.md,tasks.md,specs/preferences-interface/spec.md,evidence/implementation.md}.

**Interfaces:** implementation evidence distinguishes automated checks, native observation and outstanding device checks.

- [x] Run pnpm test, pnpm build and the build-graph check with a separate /tmp output.
- [x] Run cargo fmt/check/test, strict OpenSpec validation and git diff --check.
- [ ] Finish real macOS preferences acceptance. The application launched, but native UI connection failed; unavailable checks are recorded in OpenSpec evidence.
- [x] Review the final diff and record the results; leave all changes uncommitted.
