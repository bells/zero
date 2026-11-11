## 1. Navigation semantics

- [x] 1.1 Retain full tool names without feature-specific suffixes or extra naming metadata; verify focused navigation tests.
- [x] 1.2 Distinguish application/tool groups, tools overview and standalone extension management; verify bilingual rendered navigation.
- [x] 1.3 Preserve full-title and setting-keyword search with stable focus targets; verify navigation/search unit tests.

## 2. Presentation

- [x] 2.1 Refine the complete settings shell and shared rows with consistent typography and compact desktop density; inspect every destination.
- [x] 2.2 Remove redundant single-section titles and retain accessible section names; inspect General, Shortcuts and Tools overview.
- [x] 2.3 Preserve responsive wrapping, focus, scroll access and coarse-pointer targets; inspect short/narrow layouts and keyboard navigation.

## 3. Verification

- [x] 3.1 Run pnpm test/build and build-graph budget checks; record outputs.
- [x] 3.2 Run cargo fmt/check/test, strict OpenSpec validation and git diff --check; record outputs.
- [ ] 3.3 Complete real macOS preferences layout/focus/scroll/interaction acceptance. pnpm tauri dev launched successfully, but the native UI connection was unavailable; see evidence/implementation.md.
- [x] 3.4 Record remaining Windows/device acceptance without marking unavailable checks complete.
