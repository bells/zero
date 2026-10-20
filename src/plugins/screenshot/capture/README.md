# Snap capture editor

macOS owns the custom editor. Windows continues to launch the system screenshot tool; these frontend modules do not establish Windows, Linux or mobile editor support.

| Responsibility | Entry |
| --- | --- |
| Session/media, crop, gesture routing and output actions | `CaptureApp.tsx` |
| Per-tool styles, validation, legacy normalization and allowed patches | `captureAnnotationProperties.ts` |
| Source-space bounds, measured text, handles and transforms | `captureAnnotationGeometry.ts` |
| Object begin/preview/commit/cancel and stale-target rejection | `captureAnnotationEditing.ts`, `useCaptureAnnotationEditing.ts` |
| Style-only storage and in-memory default transactions | `captureToolDefaults.ts`, `useCaptureToolDefaults.ts` |
| Presentational range/number/color/options controls | `AnnotationPropertiesPanel.tsx` |
| Shared scene renderer, bounded temporary layer and cropped PNG | `captureCanvas.ts`, `captureExport.ts` |
| Crop geometry and measured toolbar/panel placement | `captureSelectionModel.ts`, `captureGeometryModel.ts`, `captureToolbarModel.ts`, `useCapturePropertyAnchor.ts`, `SelectionGeometryControls.tsx` |
| Capture-only Chinese/English property labels | `i18n.ts` (kept out of the initial application graph) |

Drawing keeps its tool active and targets the newly completed annotation for live property edits. The next drawing still uses independent tool defaults. Reactivate the drawing tool or press Escape to deselect and adjust defaults; Select enables geometry editing of existing objects. The properties panel sits below its type button with a measured caret, clamping inside the toolbar stack and tracking horizontal scrolling. Desktop properties use inline label/slider/number rows, a two-row color palette and a side column for tool context/options. The reset icon retains its full tool-default label and tooltip. Narrow viewports reflow and coarse pointers receive taller controls. Crop and object geometry are independent and use source pixels; viewport projection preserves horizontal/vertical objects. Text uses one source baseline and shared font/layout helpers. One completed edit produces one history entry; preview replacement never appends a duplicate object. Escape unwinds input/property/text/pointer work, object selection, then the session. Explicit Cancel exits the session.

`zero.snap.annotation-defaults.v1` stores allowlisted styles only. Object changes, IDs, text, coordinates, OCR, media tokens and screenshots never enter that record. Unsupported versions are not overwritten on initialization. A failed save leaves in-memory drawing usable.

Copy/Save/Pin consume committed annotations through the same renderer. Whole-object opacity uses one reusable visible-bounds layer; Mosaic samples preceding content from a newly rebuilt scene. The crop-radius mask is independent of rectangle radius. OCR still sends only the session ID and original source selection to Rust. No annotation model or new command crosses IPC.

Run the normal project gates from `AGENTS.md`. Additional real-browser synthetic checks require an existing Playwright installation and Chrome/Chromium:

```sh
pnpm dev --host 127.0.0.1
# In another terminal; omit these variables if Playwright and its browser are already configured.
export SNAP_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
export SNAP_CHROME_PATH=/absolute/path/to/chrome
node tests/browser/snap-annotation.mjs
node tests/browser/snap-annotation-pixels.mjs
```

The fixtures mock only native IPC and use a generated synthetic image. Interaction, Canvas compositing, storage and PNG encoding run in the actual browser. These checks do not establish macOS screenshot startup, native dialogs/IME, device alignment, native output actions, application restart or memory recovery.

Implementation and remaining native acceptance: [`enhance-snap-annotation-editing/evidence/implementation.md`](../../../../openspec/changes/enhance-snap-annotation-editing/evidence/implementation.md).
