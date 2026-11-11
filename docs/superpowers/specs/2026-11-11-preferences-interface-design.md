# Preferences interface refinement

The maintainer approved the complete preferences shell refinement on 2026-11-11: application settings, tool settings with a named overview, and a standalone extension-management destination. Follow-up feedback uses the supplied ChatGPT settings screenshot as a density reference and restores full tool names so each tool can expand beyond its current functions. Implementation stays in the current workspace and is not committed or published without a further request.

## Intent and scope

Make preferences readable, compact and predictable at the main window's normal 920×660 and minimum 760×520 sizes. Cover navigation, search, page headers, shared setting rows, metadata, overview states, extension sections and responsive behavior. Keep tool-specific business logic, native commands, persistence and immediate feedback unchanged.

## Approaches

- Typography-only adjustment would retain ambiguous categories and repeated headings.
- Replacing navigation or building a new settings framework would increase interaction and migration scope.
- Selected: refine the existing two-pane shell, preserving full tool names, destination IDs, search focus targets and state owners.

## Design

- Groups: 应用设置 / Application; 工具设置 / Tools. Extensions is a standalone 扩展管理 / Manage extensions entry without a redundant group heading. Tools overview is 工具概览 / Tools overview.
- Use full tool names in both languages: Zero Awake, Zero Paper, Zero Launch, Zero Snap and Zero File. Do not add current-function suffixes or a separate preferences-name metadata field. Third-party titles remain unchanged.
- Fixed system typography: group labels 12px/600, navigation 14px, page heading 20px, setting names 13px, descriptions 12px. Use the existing restrained green accent and neutral surfaces.
- Desktop navigation has a 30px target and no extra group-internal gaps; groups have 12px separation. Coarse-pointer layouts retain 44px targets. This intentionally replaces the previous blanket 44px navigation rule with device-appropriate density. Setting rows and other native actions remain comfortably clickable.
- Sidebar approximately 220px, modest page padding, compact outer toolbar and page header. Remove redundant General, Shortcuts and Tools overview section headings while preserving semantic section labels. Multiple meaningful section headings remain.
- Preserve full localized labels, wrapping, visible focus, independently scrollable navigation/content, search result targeting, narrow single-pane navigation, reduced motion and return-to-tools context.
- Reuse existing React, CSS and lucide-react; no new dependency or Rust/TypeScript IPC contract is needed.

## Verification

Test preserved full titles, localized search and unchanged destination/focus IDs. Run desktop frontend tests/build, build-graph budget, strict OpenSpec validation and diff hygiene; Rust checks from the initial pass remain separate historical evidence since the follow-up changes no native code. Inspect Chinese/English, search, keyboard and reduced-size layouts. Record unavailable native and Windows checks separately.
