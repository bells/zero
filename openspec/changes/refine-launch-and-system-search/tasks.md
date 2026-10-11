## 1. Implementation

- [x] 1.1 Change native Launch shortcut and shared UI hint, remove eyebrow; verify modifier tests and frontend build.
- [x] 1.2 Add official single-instance routing and retained pluginId navigation; verify invalid targets, revision ordering and wire serialization tests.
- [x] 1.3 Generate owned macOS applications and Windows shortcuts on packaged startup; verify idempotency, quoting and unrelated/symlink preservation tests.
- [x] 1.4 Document entry locations, indexing and platform defaults; verify strict OpenSpec validation.
- [x] 1.5 Route the Launch shortcut through the existing window toggle; verify launcher visibility/modifier tests and native compilation.

## 2. Verification

- [x] 2.1 Run frontend/Rust checks and build graph; record actual results in evidence.
- [ ] 2.2 Run macOS native cold/warm tool navigation and Option + Space/UI smoke; record actual results.
- [ ] 2.3 Verify actual Alfred/Spotlight search discovery after indexing on macOS.
- [ ] 2.4 Verify installed Windows Start Menu search, shortcuts, single-instance and Ctrl + Alt + Space on a Windows device.
