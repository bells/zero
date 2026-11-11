## Context

See proposal.md for the observed interface problems. The existing settings-center and later main-window navigation changes already own destination IDs, search, immediate feedback and native integration. The maintainer approved refining the full common settings shell and bilingual naming.

## Goals / Non-Goals

**Goals:** readable hierarchy, compact desktop navigation, explicit grouping, full tool names and consistent settings controls across all destinations.

**Non-Goals:** new settings behavior, native IPC, plugin identity changes, storage migration, tool workspace redesign, release or archive.

## Decisions

- Keep the existing shell and controllers; typography-only fixes cannot resolve the naming problems, while a new settings framework would add unnecessary migration risk.
- Use the existing full title in navigation and headers. The maintainer reverted function-specific short names because tools such as Snap may gain additional functions. Remove the extra preferencesLabel metadata rather than retaining unused indirection. Plugin-owned search descriptors receive the owning full title as a keyword.
- Use two named navigation groups and an unheaded extension-management entry. Keep tools overview available with its explicit name.
- Put refinements in settings-scoped CSS: 12px group labels, 14px navigation, 20px page headings, 13px row names and 12px descriptions. Use 30px desktop navigation with no extra row gaps and 12px group separation and 44px coarse-pointer targets. This intentionally supersedes the older uniform 44px navigation rule.
- Omit redundant single-section headings while retaining an accessible section name. Keep meaningful multi-section headings, live feedback, focus targets and scroll regions.
- Reuse the existing system fonts, colors and lucide-react icons. No new library or Rust contract is required.

## Risks / Trade-offs

- [Risk] Tool names become tied to current features → Retain complete tool names in navigation, detail headers and search.
- [Risk] Long extension labels or English controls overflow → Wrap labels/actions and inspect constrained layouts.
- [Risk] Smaller navigation targets reduce touch usability → Coarse-pointer media queries retain 44px targets.
- [Risk] Pure browser checks miss macOS WebView behavior → Attempt real Tauri inspection and record unavailable acceptance separately from automated verification.

## Migration Plan

Ship the presentation-only change with the existing application. Optional labels fall back to full names. Reverting the frontend changes requires no stored-data migration. The selected implementation plan is in [the implementation plan](../../../docs/superpowers/plans/2026-11-11-preferences-interface.md).
