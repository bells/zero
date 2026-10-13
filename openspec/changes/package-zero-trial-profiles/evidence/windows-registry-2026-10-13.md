# Windows registry save investigation — 2026-10-13

## Observed hosted failure

[CI run 38267465430](https://github.com/bells/zero/actions/runs/38267465430), revision `93ae1589c8b889ddaa3e00f4dc7969e36401d533`, passed Windows Rust checking, 237 library tests and 20 wallpaper tests. Both `build_profiles` tests then failed on the second registry save with sharing violation `0x80070020`. Later integration suites did not run. macOS CI passed.

The two tests use separate process/sequence/time-based roots. `PluginRegistry::save` retained its staging `File` after writing and `sync_all`, then called `ReplaceFileW` for an existing destination. [Microsoft's API contract](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew) specifies no sharing mode when opening the replacement file. This conflicts with our own open staging writer. The initial save uses `MoveFileExW`, explaining why seeding succeeds and the next save fails.

## Changes and related inspection

- Close the registry staging writer after syncing and before atomic replacement. Failure cleanup and revision advancement continue to depend on the replacement result.
- Add repeated-save checks for persisted revisions, unchanged records, clean reloads and staging cleanup in every build profile.
- Add a Windows-native test that exclusively opens the destination, verifies failed save preserves the committed revision/data and cleans its stage, then verifies successful save after unlocking.
- Inspect plugin storage, native resource writes and launcher cache writes. Plugin storage closes its writer before returning the prepared transaction. Native resource and launcher cache writers use `MoveFileExW` and have replacement coverage; they do not use the failing `ReplaceFileW` path.
- Expanded profile verification exposed missing Cargo test prerequisites. Wallpaper/launcher tests now require `bundled-tools`, File conversion/process tests require `file-tool`, and the full five-tool registry integration suite requires both. File-specific registry/status-bar unit tests require `file-tool`. The macOS entry test now selects an actually compiled tool and checks the empty tool-directory case in core.

The original core all-target check failed on imports of compiled-out tool modules on macOS and Windows. Initial core/standard test runs also exposed the File/Snap assumptions above. During adjustment, the core entry assertion incorrectly assumed the owned directory itself would be absent; inspection showed the installer creates it with an ownership marker, and the final assertion checks that no tool directories exist. All final results below supersede those failed verification attempts without changing release or device task status.

## Final local verification

| Gate | Result |
| --- | --- |
| Focused full-profile registry/storage/native-resource tests | 27 passed |
| core complete Rust suite | 143 passed, 1 ignored |
| standard complete Rust suite, unsandboxed serial | 258 passed, 2 ignored |
| full complete Rust suite, unsandboxed serial | 368 passed, 2 ignored |
| Windows x86_64 MSVC all-target check, full/core/standard | Passed, including compilation of the new Windows-only test |
| Frontend tests and production build | 362 passed; build passed |
| Locked macOS Cargo check / Rust formatting / whitespace | Passed |
| Strict OpenSpec | 28 passed, 0 failed; existing icon archive dependency notice retained |

The Windows-only lock test has not executed locally. Windows hosted execution for this fix, installer/native-device validation and packaged trial gates remain pending. No release-policy approval or task-checkbox changes are included.
