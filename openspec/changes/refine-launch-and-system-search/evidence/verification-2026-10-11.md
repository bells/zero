# Verification — 2026-10-11

## Delivered source

- macOS Launch `Alt+Space` (Option + Space); Windows `Control+Alt+Space` (Ctrl + Alt + Space). Native modifier matching, snapshot accelerator and Launch search hint agree. The repeated Launcher eyebrow and second shortcut badge were removed.
- Official `tauri-plugin-single-instance` 2.4.2 handles secondary activations. Exact `--zero-tool snap|awake|paper|launch|file` arguments resolve a bundled ID; other arguments are ignored without dispatch. Disabled tools open the main window without enabling them.
- `get_main_window_navigation` and `zero://main-navigation` retain `{ destination, revision, pluginId? }`. Rust serde camelCase and the TS interface match. Ordinary navigation clears the target; late snapshots cannot replace newer targets. The frontend consumes a request after registry loading and selects only a visible, enabled tool.
- Packaged release startup generates five named application entries under macOS `~/Applications/Zero Tools` or Windows user Start Menu `Programs/Zero Tools`. Work runs off the UI thread; content is not rewritten when unchanged. Ownership markers, symlink checks and Windows shortcut digests preserve unrelated entries. Failures emit only a safe `desktop-entries` diagnostic outcome.
- Debug builds do not install persistent user entries. Packaged macOS debug validation uses the explicitly supplied temporary `ZERO_DESKTOP_ENTRIES_TEST_ROOT`.

## Automated checks

| Check | Actual result |
| --- | --- |
| `pnpm test` | 351 passed, 0 failed |
| `pnpm build` | Passed; existing PDF lazy-chunk size warning remains |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Passed |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | Passed on macOS |
| Rust full suite, serial, outside sandbox | 346 passed, 0 failed, 2 ignored |
| Windows `cargo xwin check ... --target x86_64-pc-windows-msvc --locked` | Passed; 19 existing platform warnings remain, no Windows runtime claim |
| build graph with `/tmp/zero-build-graph.json` | Passed; tracked historical evidence untouched |
| `openspec validate --all --strict` | 24 passed, 0 failed; existing missing-main-spec archive advisory remains |
| `git diff --check` | Passed |

First Rust run compiled before temporary-path canonicalization and failed two new entry tests because macOS TMPDIR used a symbolic-link ancestor. That test path was corrected. Subsequent sandbox full run passed the new tests but failed the existing native private-pasteboard test (236 passed, 1 failed, 1 ignored in lib). The complete permitted outside-sandbox serial rerun above passed. No native test was weakened.

Windows first attempt failed to access MSVC CRT cache under sandbox. Permitted retry downloaded its CRT cache, then exposed two new-code compile issues: a `windows` module/crate import ambiguity and windows 0.52 `CoInitializeEx` already returning `Result` rather than HRESULT. Both were fixed before the successful check.

## Native macOS debug observations

`pnpm tauri dev --no-watch` was started with an isolated `com.watson.zero.discovery-smoke` identifier. An initial attempt to pass tool args through the CLI was rejected by cargo argument parsing. Raw development executables could not be resolved by the UI driver by bundle identifier, so visual verification used the same source's packaged debug app, copied to `/private/tmp/zero-discovery-smoke/Zero.app`, with temporary entry output at `/private/tmp/zero-discovery-smoke/Applications`. This is debug evidence, not an installed release or signing certificate.

Observed via the native accessibility tree:

- Cold `--zero-tool launch` opened the main window with Zero Launch selected, one heading and an `⌥Space` hint. No Launcher eyebrow was present.
- Preferences → Keyboard shortcuts displayed `Alt+Space` and 已注册 for Launch.
- Opening the generated Zero Snap application from the preferences view returned to tools and selected Zero Snap.
- Opening the generated Zero File application selected Zero File in the same main window. Its existing unavailable engine messages remained unchanged; the release engine policy was not modified.
- One temporary host process remained after the warm activation. A secondary invocation with an unknown tool returned without spawning another persistent host.
- The native driver timed out when trying to inspect the forwarding applications themselves after they exited; subsequent host accessibility observations confirmed successful routing.

An injected `alt+space` in the app inserted an Option-space character rather than proving a global hotkey transition. Registration is confirmed; a physical/global event smoke remains open. No claim that automated input proves the real shortcut is made.

## Remaining device and installation gates

- Actual Alfred/Spotlight indexed search results in standard user Applications (temporary test directories are outside normal application-search scope).
- Physical Option + Space, hide/reopen, and conflict behavior on macOS.
- Windows installed shortcut creation, Start Menu search, Ctrl + Alt + Space and native single-instance activation.
- Signed/installed release validation. Generated macOS wrappers are local forwarders and are not independently signed distribution packages.

No commit, push, tag, release, spec sync or archive was performed. Temporary UI processes are stopped after verification; the pre-existing Zero process is preserved.


## Follow-up: toggle Launch with the same shortcut

The global shortcut callback now calls the existing `toggle_quick_launcher_window` used by the status bar. This reads native visibility and uses `hide_surface` for a visible launcher, or the existing create/reuse/focus path for a hidden/absent launcher. It does not call application exit or change the main window.

Focused `cargo test --locked --lib launcher`: 31 passed, 0 failed. This includes visibility-toggle and exact-modifier tests. macOS `cargo check --locked`, Windows `cargo xwin check --locked --target x86_64-pc-windows-msvc`, `cargo fmt --check`, strict validation of this change, and diff whitespace checks passed. Frontend source is unchanged in this follow-up. The physical/global shortcut gate above remains open; source and compile checks are not reported as physical key evidence.

For this follow-up, `pnpm tauri dev --no-watch` with the isolated smoke identifier successfully launched `target/debug/zero --zero-tool launch`; the spawned test process was then stopped. No physical double-shortcut interaction is claimed.


## Local commit preparation

Re-ran the complete frontend suite (351 passed), frontend production build, Rust fmt/check and full permitted outside-sandbox serial suite (346 passed, 2 ignored), Windows locked cross-compilation, build graph with separate `/tmp/zero-commit-build-graph.json`, strict OpenSpec validation (24 items and this change explicitly), and diff whitespace checks. All passed. Existing bundle-size/Windows warnings and the outstanding device/indexing gates remain unchanged. No generated build artifacts or test logs are included in the commit scope.
