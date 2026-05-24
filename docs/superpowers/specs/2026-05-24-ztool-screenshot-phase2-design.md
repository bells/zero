# ZTool Screenshot Phase 2 Design

## Goal

Upgrade ZTool's screenshot plugin from a system screenshot launcher plus pending tool buttons into a usable screenshot editor. macOS is the full delivery platform for this phase. Windows keeps the existing system screenshot launcher path and remains compatible with the shared command contract.

The phase is complete when a macOS user can start capture from the panel or global shortcut, annotate the captured screen with rectangle, arrow, pen, text, mosaic, and pin tools, then copy or save the final annotated PNG.

## Scope

In scope:

- macOS custom capture flow: hide the main tray window, capture the current screen, open a full-screen capture window, and initialize it with session data.
- Capture editor UI: a dedicated React view for the capture window, separate from the main plugin panel.
- Annotation tools: rectangle, arrow, pen, text, mosaic, and pin.
- Editing basics: selection, deletion, Escape cancel, undo, and redo.
- Output: copy and save the final annotated PNG, not the raw screenshot.
- Pin window: create a separate borderless always-on-top window from the selected region, with drag and close behavior.
- Tests for reducer behavior, serialization payloads, hotkey mapping, and Rust command/service helpers that can be tested without opening native windows.

Out of scope:

- Windows custom overlay or annotation support.
- Pin image scaling, opacity control, or multi-pin management beyond creating independent pin windows.
- Advanced shape editing such as resize handles, color palettes beyond MVP defaults, or text re-editing after commit.
- Multi-monitor capture refinement beyond the current macOS full-screen capture baseline.

## Recommended Approach

Continue from the existing phase-2 skeleton already present in the workspace. It has Rust session commands, capture and pin window plumbing, and frontend capture model helpers. The next step is to complete the missing React capture view, wire it into app routing, and tighten command payload naming and tests.

This is lower risk than rewriting the capture architecture because the current skeleton already matches the desired public APIs closely. It also gets all six tools usable before visual polish, which matches the phase objective.

## Native Architecture

The screenshot service owns the native session lifecycle:

- `start_screenshot(action)` normalizes the requested action. On macOS it hides the main window, captures a PNG with `screencapture`, stores a session, and opens the `capture` window. On Windows it keeps the current `ms-screenclip` / `SnippingTool.exe` fallback.
- `init_screenshot_session({ session_id? })` returns the active session payload: session id, base64 screenshot, initial action, width, and height.
- `commit_screenshot({ session_id, action, png_base64, save_path? })` validates the active session, decodes the final PNG, then either writes it to the image clipboard or saves it through a system save dialog when no path is provided.
- `cancel_screenshot_session({ session_id })` closes the capture window, restores the main window, and clears the active session.
- `pin_screenshot({ session_id, png_base64 })` validates the active session, stores the pin image payload, and opens a borderless always-on-top pin window.
- `init_pin_window()` returns the stored pin image for the window label.

The session store stays in Rust process memory. Only one active capture session is supported at a time. Pin windows use stored base64 payloads and do not mutate the active capture history.

## Frontend Architecture

`ScreenshotPanel` remains an entry point only. It calls `start_screenshot` for copy or save and reports command errors.

The React app chooses its top-level view from the current Tauri window label:

- `main` renders the existing plugin shell.
- `capture` renders the capture editor.
- `pin...` renders the pin image window.

The capture editor has three visual layers:

- A base image layer showing the captured screenshot.
- A committed annotation canvas rendered from `AnnotationObject[]`.
- An interaction layer for active drawing previews, hit testing, and toolbar input.

The existing `captureReducer`, `captureCanvas`, `captureHotkeys`, and `captureSerialize` helpers become the stable core. The editor component owns transient pointer state such as drag start, current path, active text input, and selected region.

## Annotation Model

All tools share `AnnotationObject`:

- `rectangle`: normalized bounds, color, stroke width.
- `arrow`: start and end points, color, stroke width.
- `pen`: ordered points, color, stroke width.
- `text`: insertion point, text content, font size, color.
- `mosaic`: normalized bounds and pixel size.
- `pin`: normalized bounds used to crop a pin image, not drawn into the final exported image.

The reducer records committed annotation arrays in `undoStack` and `redoStack`. Selection is lightweight UI state and clears after undo and redo to avoid stale ids.

## Tool Behavior

Rectangle, arrow, mosaic, and pin are drag tools. The editor normalizes the drag bounds and ignores tiny regions to avoid accidental objects.

Pen records pointer movement as a freehand path and commits on pointer up. Text creates a positioned input on click and commits when the user presses Enter or the input loses focus with non-empty text.

Pin uses the current drag bounds to render a cropped PNG from the current final image state, then calls `pin_screenshot`. The pin annotation is not included as a visible mark in copy or save output.

Select mode supports selecting an existing annotation by bounds. Delete or Backspace removes the selected object. Escape cancels the active text/draw operation, or cancels the whole screenshot session when idle.

## Output Rendering

Copy, save, and pin export through the same rendering pipeline:

1. Create an offscreen canvas at the original screenshot pixel size.
2. Draw the base screenshot.
3. Draw committed annotations in order, skipping pin objects.
4. Apply mosaic from the current canvas contents so it pixelates whatever is underneath it.
5. Export PNG as a data URL.

For pin, the editor renders the full final canvas first, crops the selected bounds into a second canvas, and sends that PNG to Rust.

## Window Behavior

The capture window is full-screen, borderless, focused, and always on top on macOS. Cancel, copy, and save close it and restore the main window.

Pin windows are borderless and always on top. Their React view displays the image at 1:1 within the native window for the MVP. The top strip is draggable through `data-tauri-drag-region`, and the close button closes only that pin window.

## Permissions And Configuration

The default Tauri capability includes `main`, `capture`, and pin window labels. Commands registered in `lib.rs` cover all screenshot session APIs.

No frontend save-dialog plugin is required for this phase because save selection is owned by Rust with `rfd`. Clipboard image write is implemented in Rust on macOS through a temporary PNG and AppleScript. If a Tauri clipboard image plugin is adopted later, it can replace only the clipboard helper without changing the frontend contract.

## Testing

Rust:

- Unit test action normalization.
- Unit test data URL PNG decoding.
- Unit test store/session helper behavior where practical without constructing a Tauri app.
- Run `cargo test` and `cargo check` in `src-tauri`.

Frontend:

- Add Node tests for `captureReducer`: add, delete selected, undo, redo, and clear.
- Add Node tests for `captureHotkeys`: Escape, Delete, Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, and Cmd/Ctrl+Y.
- Add Node tests for serialization payloads matching the Rust command parameter names.
- Add focused helper tests for geometry normalization and bounds clamping.
- Run `pnpm build`.

Manual macOS verification:

- Start capture from the panel and from `CommandOrControl+Shift+A`.
- Use rectangle, arrow, pen, text, mosaic, and pin.
- Copy and paste the annotated image into another app.
- Save through the system dialog and confirm a PNG is written.
- Drag and close a pin window.
- Cancel capture and confirm the main window returns with no stale capture window.

## Risks

The main functional risk is coordinate scaling between the captured screenshot pixels and the full-screen editor viewport. The editor should compute a stable image-to-screen transform and convert pointer coordinates into original image coordinates before committing annotations.

The second risk is macOS screen recording permission. If `screencapture` fails or returns no readable PNG, the command should surface a plain error and restore the main window.

The third risk is Tauri command naming across camelCase and snake_case payloads. The frontend serialization helper should intentionally emit the field names the Tauri command expects, and tests should lock that down.
