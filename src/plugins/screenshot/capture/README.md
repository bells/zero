# Snap capture editor

macOS owns the full custom editor. Windows ordinary capture continues to launch the system tool; capture OCR now has an `ocr-selection` mode with selection, explicit Recognize/Enter and Esc only. Windows native/mixed-DPI/offline-installation acceptance is still separate from source and cross-compile checks. Linux/mobile editor support is not established.

The session payload carries `editorMode: "full" | "ocr-selection"`. Windows selection uses frozen physical monitor pixels and a validated native monitor identity; it cannot submit image copy/save/pin commits. The shared OCR result view remains editable and Copy is explicit. See [Snap maintenance](../../../../docs/snap.md).

Startup instrumentation uses fixed stage names and bounded numeric durations via `record_screenshot_startup`; it accepts only the active capture caller/session. Set `ZERO_PERFORMANCE_TRACE=1` to collect native capture, targets, PNG write, WebView build, decode and reveal timings. macOS capture disables hidden-view throttling while waiting for decoded pixels; it does not pre-capture or reuse an earlier screenshot.

| Responsibility | Entry |
| --- | --- |
| Session/media, crop, gesture routing and output actions | `CaptureApp.tsx` |
| Per-tool styles, validation, legacy normalization and allowed patches | `captureAnnotationProperties.ts` |
| Source-space bounds, measured text, handles and transforms | `captureAnnotationGeometry.ts` |
| Object begin/preview/commit/cancel and stale-target rejection | `captureAnnotationEditing.ts`, `useCaptureAnnotationEditing.ts` |
| Style-only storage and in-memory default transactions | `captureToolDefaults.ts`, `useCaptureToolDefaults.ts` |
| Presentational range/number/color/options controls | `AnnotationPropertiesPanel.tsx` |
| Stable responsive measurement and visible toolbar controls | `CapturePropertyMeasurements.tsx`, `CaptureToolbarPositionControls.tsx` |
| Session-only toolbar/group coordinates, pointer capture and keyboard movement | `captureToolbarModel.ts`, `useCaptureToolbarDrag.ts` |
| Shared scene renderer, bounded temporary layer and cropped PNG | `captureCanvas.ts`, `captureExport.ts` |
| Crop geometry and measured toolbar/panel placement | `captureSelectionModel.ts`, `captureGeometryModel.ts`, `captureToolbarModel.ts`, `useCapturePropertyAnchor.ts`, `SelectionGeometryControls.tsx` |
| Capture-only Chinese/English property labels | `i18n.ts` (kept out of the initial application graph) |

Drawing keeps its tool active and targets the newly completed annotation for live property edits. The next drawing still uses independent tool defaults. Reactivate the drawing tool or press Escape to deselect and adjust defaults; Select enables geometry editing of existing objects.

The toolbar centers on the selection and prefers outside below, outside above, then inside bottom. It reserves the largest panel height at the current responsive width and locale even while properties are hidden. Its 15 original 40px actions remain horizontally scrollable, while one icon-only dot grip stays fixed on the left, without a visible text label or separate reset button. Dragging or using arrow keys on this handle moves the toolbar **together with its attached properties** (1px, Shift 10px). Properties have no separate drag handle or manual coordinates. They continue tracking the corresponding tool button and caret in both automatic and manual modes; near a horizontal viewport edge they clamp while retaining the association.

Manual toolbar coordinates and the property's original side survive tool/object changes, hiding/reopening and crop move/resize during the capture. Group bounds reserve the largest property height, with property scrolling in short viewports. Pointer capture, pointercancel/lost-capture/Escape rollback and normal release keep movement separate from drawing, crop and history. Position is not persisted. Double-clicking the grip (or pressing Enter/Space on it) restores automatic group position without changing styles; the property panel's existing tool-default reset does not move the toolbar.

All six annotation property panels share two rows. The first holds compact tool/context text, five preset colors (red/yellow/green/blue/black), a Palette icon over the native color input, existing shape/arrow/bold options and the tool-default reset. Mosaic has no color controls. The second holds inline label/slider/number controls; full accessible names still describe units and default/selected context. Narrow viewports scroll horizontally without adding rows, keyboard focus reveals the active control, and coarse pointers receive taller property inputs. Valid saved colors outside the five presets remain available through the custom-color control. Hidden measurements use the same scroll container as visible panels, with viewport-clamped width and natural content height plus border/scrollbar thickness.

Width/height/radius controls stay attached to the crop top-left: 2px above when space is available, otherwise 2px below its top edge inside the crop. Their placement depends only on crop/viewport/control dimensions; a manually moved toolbar may cover them without moving them. Automatic outside placement clears the fixed strip first, including tiny crops at the viewport top. Crop and object geometry use source pixels. Text uses one baseline and shared font/layout helpers. One completed edit produces one history entry. Escape unwinds input/property/text/pointer work, object selection, then capture; explicit Cancel exits capture.

`zero.snap.annotation-defaults.v1` stores allowlisted styles only. Object changes, IDs, text, coordinates, OCR, media tokens and screenshots never enter that record. Unsupported versions are not overwritten on initialization. A failed save leaves in-memory drawing usable. Rectangle, Ellipse, Arrow, Pen and Text now have factory red `#ff5252`; valid saved green `#55f280` or custom colors remain authoritative. To use factory red for a tool with saved green, activate that drawing tool and choose **Restore tool defaults** (恢复工具默认值). This affects subsequent drawing and persists only that tool, without recoloring existing objects. The selection border stays green; Mosaic and Pin gain no color field.

Copy/Save/Pin consume committed annotations through the same renderer. Whole-object opacity uses one reusable visible-bounds layer; Mosaic samples preceding content from a newly rebuilt scene. The crop-radius mask is independent of rectangle radius. OCR still sends only the session ID and original source selection to Rust. No annotation model or new command crosses IPC.

Run the normal project gates from `AGENTS.md`. Additional real-browser synthetic checks require an existing Playwright installation and Chrome/Chromium:

```sh
pnpm dev --host 127.0.0.1
# In another terminal; omit these variables if Playwright and its browser are already configured.
export SNAP_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
export SNAP_CHROME_PATH=/absolute/path/to/chrome
node tests/browser/snap-annotation.mjs
node tests/browser/snap-annotation-pixels.mjs
node tests/browser/snap-floating-panels.mjs
node tests/browser/snap-properties-layout.mjs
```

The fixtures mock only native IPC and use a generated synthetic image. Interaction, Canvas compositing, storage and PNG encoding run in the actual browser. These checks do not establish macOS screenshot startup, native dialogs/IME, device alignment, native output actions, application restart or memory recovery.

Implementation and remaining native acceptance: [`enhance-snap-annotation-editing/evidence/implementation.md`](../../../../openspec/changes/enhance-snap-annotation-editing/evidence/implementation.md).

Floating-panel implementation, measurements and pending native acceptance: [`optimize-snap-floating-panels/evidence/implementation.md`](../../../../openspec/changes/optimize-snap-floating-panels/evidence/implementation.md).
