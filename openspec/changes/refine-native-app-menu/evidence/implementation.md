# Native application menu implementation

Date 2026-11-09. Branch codex/refine-native-app-menu.

## Implemented source

- macOS Zero / Tools / Edit / Window / Help menus follow Zero's resolved Chinese/English language. Native system additions use the operating system's language.
- Existing navigation, settings, About, support links and unified exit cleanup are reused. Tool entries follow enabled Ready/Active records, retain registry ordering and revalidate availability when selected.
- Explicitly requested hidden tools are available for the current main-window session, including settings round trips, without changing saved visibility.
- Native editing uses a narrow synchronous AppKit target retained by each menu item, with worksWhenModal enabled. Native panels use the responder chain. First-party WebViews receive an explicit undo/redo payload, allowing Snap to own annotation history and text fields to keep WebKit history.
- Window/Help use Tauri's reserved native submenu IDs. The new native adapter is macOS-only. Windows retains existing navigation and tray behavior.

## Automated checks

- pnpm test passed 485 tests, including four focused editing/navigation cases and two native menu source-contract cases.
- pnpm build and the build graph budget check passed. New graph output is /tmp/zero-menu-build-graph.json.
- Three Rust menu-model/serialization tests passed. Chinese/English groups, missing/disabled/unhealthy tools, empty catalogs and wire payloads are covered.
- cargo fmt --check and cargo check --locked passed for full, standard and core profiles.
- Strict OpenSpec validation passed 43 items. git diff --check passed.
- Initial sandbox Rust baseline failed in Vision, native pasteboard and a timed process test. The post-change sandbox run also exposed an OCR scheduling timeout. The preserved logs are /tmp/zero-menu-baseline-rust.log and /tmp/zero-menu-rust-tests.log. A permitted unsandboxed serial full rerun passed 459 tests with three ignored tests. Final rerun results are recorded in /tmp/zero-menu-rust-final.log.
- Read-only independent review found and prompted fixes for native Window/Help registration, native dialog editing and hidden-tool settings context. Native modal QA subsequently identified the need for synchronous AppKit targets and worksWhenModal.
- Before integration, the frontend suite again passed 485 tests. The first unsandboxed serial Rust run had one existing process-runner deadline failure. Its isolated rerun passed, and the subsequent complete serial suite passed 459 tests with three ignored tests. Logs are /tmp/zero-menu-precommit-rust.log, /tmp/zero-menu-precommit-rust-targeted.log and /tmp/zero-menu-precommit-rust-retry.log. The test implementation was retained.

## Native macOS observations

pnpm tauri dev was started successfully after the sandbox initially denied localhost binding. The UI tool could not attach to the unbundled executable. Native checks used a temporary local .app wrapper around the same source-built debug executable, with the development frontend at localhost:1420 and the existing debug File asset fallback. This is debug acceptance evidence.

Observed through native accessibility state and screenshot inspection

- Chinese menus contain the confirmed five groups and all five enabled tools.
- Tools → Zero Launch and Tools → Zero File open the appropriate main-window pages.
- Changing the language to English updates the application menus live. The original System language preference was restored.
- Cmd+Comma opens the existing settings view. About opens Zero's existing independent window, and Cmd+W closes it.
- A main-window text field successfully undoes through Edit → Undo and redoes with Cmd+Shift+Z.
- Window has native window-management items and the system-managed current-window entry. Help exposes the website and repository items.
- A five-minute Awake session continued after Cmd+W and main-window reopening. Awake was stopped afterward, and the original indefinite duration selection was restored.
- The native File open panel successfully undoes and redoes synthetic search text through the Edit menu. Temporary instrumentation confirmed the native modal responder accepted the action, and the instrumentation was removed.
- Automated Cmd+Z / Cmd+Shift+Z probes in the native panel did not produce an observable result. Physical-key acceptance remains open separately from the passing menu-click evidence.
- Quit Zero exited the temporary debug instance. The local development server was stopped after acceptance.

## Remaining acceptance

- Snap canvas history, IME/busy states and capture/save flows on a normal permission-bearing installation.
- Native panel physical editing shortcuts, window full-screen/minimize behavior, and main-window red-control close.
- Live disable/re-enable and hidden-tool settings round trips through the native UI. Model, source-contract and frontend tests cover their implementation rules.
- Windows device behavior. Platform-gated source and host profile compilation do not replace Windows acceptance.

The maintainer asked to finish promptly during final QA. These manual items remain open in tasks.md.
