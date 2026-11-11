## Why

The preferences sidebar uses tiny group labels beside oversized, widely spaced destinations. Repeated Tools/Extensions labels and page headings obscure the distinction between application settings, tool settings and extension management.

## What Changes

- Clarify application/tool groups, name the tools overview explicitly and present extension management once.
- Keep complete tool names throughout preferences so navigation does not limit a tool to its current functions.
- Refine the whole preferences shell, shared rows, metadata and responsive controls using consistent typography and desktop density, with larger coarse-pointer targets.
- Preserve search, focus targets, immediate persistence, native behavior and return-to-tools context.

## Capabilities

### New Capabilities
- `preferences-interface`: readable and compact preferences presentation, distinct navigation labels and accessible responsive behavior.

### Modified Capabilities
None. This builds on the unarchived settings-center and main-window preferences changes; their destination IDs and setting behavior remain intact.

## Impact

React preferences components, settings-scoped CSS, bilingual messages and focused navigation tests. No new dependencies, native commands or storage migrations. Desktop navigation targets become 30px while coarse-pointer targets remain at least 44px; this supersedes the earlier blanket 44px presentation guidance.
