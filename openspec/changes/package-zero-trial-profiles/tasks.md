## 1. Build profiles

- [x] 1.1 Add Vite catalogs and File resource exclusion, preserve full default.
- [x] 1.2 Add Cargo features and conditional native composition/commands/tasks.
- [x] 1.3 Preserve excluded registry records; seed/restore only compiled tools; filter desktop entries.
- [x] 1.4 Add installer collection, version checks, size and SHA-256 reports.
- [x] 1.5 Add Actions matrix artifacts and tag-only Draft upload.

## 2. Verification

- [x] 2.1 Verify frontend/Rust regression, all profiles, bundle gates and strict specs.
- [x] 2.2 Build and inspect local Apple Silicon core/standard installers; record exact sizes, checksum and signature evidence.
- [ ] 2.3 Run native startup/tool trial for these specific installers (owner local trial).
- [ ] 2.4 Run hosted Actions for macOS Apple Silicon and Windows x64; download and verify matching artifacts.
- [ ] 2.5 Verify Windows installers and native trial use on a Windows device.

## 3. Core market and restore feedback follow-up

- [x] 3.1 Reproduce the missing default market index and misleading empty restore result; add regression tests and bounded fixes. See [2026-11-13 evidence](evidence/core-market-recovery-2026-11-13.md).
- [x] 3.2 Verify full/core/standard frontend builds, core regression tests, full serial Rust regression, performance and strict specs; preserve the initial OCR concurrency failure separately.
- [ ] 3.3 Inspect the corrected core empty state and disabled restore action on a real desktop; verify newly packaged macOS/Windows builds when available.
