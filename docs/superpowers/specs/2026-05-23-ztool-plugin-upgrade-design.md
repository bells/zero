# ZTool Plugin Upgrade Design

## Goal

ZTool is a tray-first desktop utility collection. The current caffeine and screenshot actions should become first-class plugins with a consistent UI, reliable native state, and a screenshot product direction that visually follows WeChat while landing in phases.

## Scope

Phase 1 keeps the app small and usable:

- Caffeine mode exposes queryable state, reliable toggle behavior, elapsed time in the UI, and cleanup on app exit.
- Screenshot uses a WeChat-like product language: darkened full-screen capture surface, bright green selection, live dimensions, resize handles, and a bottom toolbar.
- macOS receives the first custom capture path. Windows keeps a working system screenshot launcher inside the same plugin contract, ready for a later custom backend.
- Annotation tools are visible as disabled or pending controls in phase 1. Cancel, confirm/copy, and save are the active screenshot actions.

## Architecture

Frontend code is split by feature under `src/plugins`. Each plugin owns its view, state hook, and Tauri bridge functions. Shared app shell code only registers plugins and renders the selected detail pane.

Rust code is split by feature under `src-tauri/src/commands` and `src-tauri/src/services`. The caffeine service owns platform power behavior. The screenshot command returns platform capabilities and starts either the custom macOS workflow or the Windows fallback launcher.

## UI Direction

The app window should feel like a compact tray control center rather than a landing page. Use dense plugin rows, clear status chips, and a focused detail pane. The screenshot detail shows the phase-1 toolbar model so users understand the intended product even before every annotation tool is implemented.

## Testing

Phase 1 is verified with:

- TypeScript build for frontend type safety.
- Rust `cargo check` for command/service compilation.
- Manual run through Tauri dev server for tray window, caffeine toggle, and screenshot command behavior.

## Notes

This workspace is not a Git repository, so the Superpowers commit step is skipped.
