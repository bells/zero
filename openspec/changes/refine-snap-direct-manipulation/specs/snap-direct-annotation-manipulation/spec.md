## Purpose

Let macOS Zero Snap users directly select, move and resize any of the six existing annotation types during a capture session while retaining their active drawing tool, predictable crop gestures, reversible edits and consistent exported pixels.

## ADDED Requirements

### Requirement: Existing annotations are directly editable without changing drawing tools
The full macOS capture editor SHALL permit single-object selection and geometry editing in Select and all six drawing tools. Finishing a drawing SHALL keep the drawing tool active and immediately select the new object with type-appropriate handles. Selecting an object of a different type SHALL show that object's properties without changing the active drawing tool, z-order or independent drawing defaults. Explicitly activating a tool SHALL clear selection and show its defaults. Clicking blank space SHALL clear object selection; a drawing gesture on blank space SHALL use the active tool's defaults, while Text SHALL retain its blank-click text-creation behavior.

#### Scenario: New shape is adjusted immediately
- **WHEN** a user finishes a rectangle and drags its edge or a handle without switching to Select
- **THEN** the rectangle moves or resizes, Rectangle remains active, the crop stays fixed and no extra rectangle is created

#### Scenario: A different object type is selected
- **WHEN** Arrow is active and the user selects an existing ellipse and changes its color
- **THEN** Ellipse properties edit only that ellipse, Arrow remains active and the next blank-space drawing uses Arrow defaults

#### Scenario: Tool defaults are restored as the active context
- **WHEN** the user explicitly activates or reactivates a drawing tool
- **THEN** the selected object clears and that tool's defaults appear without changing existing objects or adding history

### Requirement: Object bodies are hit by visible geometry with consistent display tolerance
The editor SHALL select the topmost annotation whose visible geometry or configured display-pixel tolerance contains the pointer. Outline rectangles, including rounded corners, and outline ellipses SHALL hit only near their strokes; arrows SHALL hit near their shaft or either visible arrowhead; Pen SHALL hit near its actual path. Solid shapes SHALL hit their fill and edges, Text its measured layout area and Mosaic its region. Opacity SHALL NOT change hit eligibility. Empty areas of an outline shape or path bounding box SHALL allow lower-object selection or the active tool's blank-space behavior. Hover, press and text double-click SHALL use consistent hit rules under image scaling.

#### Scenario: Drawing inside an outline
- **WHEN** Arrow is active and a drag starts inside a large outline rectangle beyond its stroke tolerance
- **THEN** a new arrow is drawn and the rectangle does not move

#### Scenario: A diagonal path has a large empty bounding box
- **WHEN** the pointer lies inside an arrow or Pen bounding box but beyond its actual path tolerance
- **THEN** that object does not block a lower visible object or blank-space interaction

#### Scenario: Rounded corner and arrowhead are targeted
- **WHEN** a user targets blank space outside a solid rounded rectangle's curved corner or targets the visible filled head of a double-headed arrow
- **THEN** the blank corner is not treated as fill and either arrowhead can select the arrow

#### Scenario: Viewport scaling changes
- **WHEN** the same image is displayed at different source-to-display scales
- **THEN** the extra clickable distance from a thin stroke remains constant in display pixels rather than source pixels

### Requirement: Option bypasses object bodies without bypassing controls
An Option-modified pointer press SHALL bypass existing object bodies for that gesture, allowing drawing from their area with the active drawing tool. Option SHALL NOT bypass toolbar/property controls, selected-object handles or active crop handles. Its bypass mode SHALL be fixed at gesture start; changing Option during a gesture SHALL NOT change the target or operation. In Select, bypass SHALL preserve normal blank-space crop behavior. Option-modified double-click SHALL NOT reopen existing text.

#### Scenario: Drawing over a solid object
- **WHEN** Pen is active and the user holds Option before starting a stroke on a solid rectangle or Mosaic region
- **THEN** a new Pen object is drawn over that region and the original object does not move

#### Scenario: Option is released while drawing
- **WHEN** a user starts an Option-bypassed drawing and releases Option before pointer release
- **THEN** the same drawing continues without switching to moving the object underneath

#### Scenario: Option is used on a control
- **WHEN** Option is held while a selected-object handle or property control is operated
- **THEN** that control performs its normal edit and no drawing passes through it

### Requirement: Shapes and Pen have predictable proportional resizing
Rectangle, Ellipse and Mosaic SHALL retain eight resize handles and free width/height resizing by default; Shift SHALL preserve the object's gesture-start aspect ratio. Corner resizing SHALL anchor the opposite corner; proportional edge resizing SHALL anchor the opposite edge midpoint and symmetrically adjust the orthogonal axis. Pen SHALL scale its complete path uniformly through its bounding box and retain its configured stroke width. Zero-width or zero-height paths SHALL remain finite and retain their zero axis; a single-point path SHALL remain movable and its resize SHALL be a no-op. Proportional boundary constraints SHALL preserve one scale factor without inversion. Style, identity and z-order SHALL remain unchanged, except existing rectangle-radius limits SHALL remain valid. Arrow SHALL retain whole-object movement and independently movable endpoints.

#### Scenario: Shift resizes a shape
- **WHEN** a user resizes a rectangle, ellipse or Mosaic with Shift, including near an image boundary
- **THEN** the initial aspect ratio stays fixed, the opposite anchor stays fixed and the object remains within valid image-coordinate limits

#### Scenario: Shift changes during a drag
- **WHEN** the user presses or releases Shift during shape resizing
- **THEN** resizing is recalculated from the gesture-start geometry without cumulative distortion or a new history entry

#### Scenario: Pen is enlarged
- **WHEN** a user drags a Pen corner or edge handle
- **THEN** all points scale uniformly around the opposite anchor, with unchanged stroke width and no per-node editing

#### Scenario: A degenerate path is resized
- **WHEN** a horizontal, vertical or single-point Pen is resized
- **THEN** all resulting coordinates remain finite, a zero axis stays zero and a single-point resize makes no scene or history change

#### Scenario: An arrow endpoint is adjusted
- **WHEN** one arrow endpoint is dragged
- **THEN** only that endpoint changes, arrow direction and length update and the opposite endpoint, style and crop stay fixed

### Requirement: Text has corner-based font resizing and cross-tool content editing
Selected Text SHALL expose four corner handles that resize by changing font size uniformly, keeping its text, manual line breaks and glyph proportions. Resizing SHALL reuse the existing valid font-size range, keep the opposite layout corner anchored and preserve other style fields. It SHALL stop at a boundary if further resizing would move the text's x or baseline y outside captured-image coordinates, rather than clamping position and shifting the opposite corner. Glyph overflow with legal anchors SHALL retain normal image clipping. It SHALL NOT stretch glyphs or automatically reflow text. A double-click on Text in Select or any drawing tool SHALL open the existing multiline editor without creating another object; IME composition, text-input shortcuts, commit/cancel and empty-text deletion SHALL retain priority. Geometry handles SHALL be inactive during text drafting.

#### Scenario: Multiline text is resized
- **WHEN** the user drags a corner of bold multiline Chinese and English text
- **THEN** font size changes within the existing 12–96 source-pixel limits, the opposite layout corner remains anchored and content, line breaks and bold remain unchanged

#### Scenario: Text is reopened from another tool
- **WHEN** Rectangle is active and the user double-clicks existing Text without Option
- **THEN** the original text editor opens without drawing a rectangle, moving the crop or changing the active Rectangle tool

#### Scenario: Text resize reaches an image edge
- **WHEN** a corner is dragged beyond the image and further font resizing would move the anchored text origin or baseline outside the image
- **THEN** resizing stops at the last legal integer font size along the gesture, keeping the opposite layout corner fixed without changing line breaks or clamping the text to a different position

#### Scenario: Composition confirms a candidate
- **WHEN** Enter or Escape is consumed by active Chinese input composition
- **THEN** no scene-level commit, undo, deletion or capture cancellation occurs

### Requirement: Direct object gestures remain separate from crop and input gestures
Input controls and active text editing SHALL take precedence over canvas gestures. Selected-object handles SHALL precede crop handles at coincident positions; crop handles SHALL be interactive only in Select and SHALL precede object bodies. Object bodies SHALL precede blank-space actions. In Select, blank dragging inside the crop SHALL translate the crop and blank dragging outside SHALL retain selection creation; drawing tools SHALL use blank space for drawing without moving the crop. OCR-only selection mode SHALL NOT activate annotation editing. Object and crop control points SHALL be visually distinguishable and excluded from output. Option and Shift behavior SHALL be discoverable in Chinese and English without obscuring the capture workspace.

#### Scenario: Crop and object handles overlap
- **WHEN** Select is active and the pointer starts on coincident selected-object and crop handles
- **THEN** the object handle edits the object, with no crop change or second gesture

#### Scenario: Blank space is dragged in different modes
- **WHEN** the same blank point inside the crop is dragged with Select and then with a drawing tool
- **THEN** Select translates only the crop and the drawing tool creates only its new annotation

#### Scenario: A text draft receives an outside click
- **WHEN** a text draft is active and the user clicks elsewhere on the image
- **THEN** the text edit is committed according to existing rules and the click does not also start drawing, object movement or crop movement

#### Scenario: OCR-only selection is opened
- **WHEN** the OCR-only editor receives pointer or keyboard input
- **THEN** its existing selection and OCR actions remain available without annotation handles, drawing or object edits

### Requirement: New editing entrances preserve transactions, exports and privacy
Each completed valid geometry, property or text edit SHALL produce one undo entry; previews, selection changes, cancellations and no-ops SHALL NOT add history or discard redo. Escape, pointer cancellation and lost capture SHALL restore pre-gesture state; tool changes SHALL cancel unfinished object gestures and reject their late events. Committed object identity and z-order SHALL stay stable. Copy, Save and Pin SHALL consume the same committed scene without control chrome; active unfinished gestures SHALL NOT be exported. Mosaic SHALL resample preceding scene content at its current region with unchanged pixel size. OCR SHALL continue using original captured pixels. Object content and geometry SHALL remain session-only and SHALL NOT enter saved tool defaults or add a new native IPC contract. Exported PNGs SHALL NOT promise editable object recovery.

#### Scenario: A long drag is undone
- **WHEN** many pointer moves are committed as one drag and Undo is invoked once
- **THEN** the object returns to its pre-drag state and Redo restores the final committed geometry

#### Scenario: A gesture is cancelled or its target becomes stale
- **WHEN** an edit is cancelled by Escape, pointer cancellation, lost capture or tool change, or receives a late callback
- **THEN** no cancelled preview is committed, no extra history is created and a previously available redo branch is preserved

#### Scenario: A Mosaic region is moved
- **WHEN** the user moves or resizes Mosaic and exports the committed capture
- **THEN** the region pixelates the preceding scene at its new position with its configured pixel size rather than moving old pixels as a sticker

#### Scenario: Outputs and defaults are checked
- **WHEN** edited objects are copied, saved or pinned and tool defaults are subsequently loaded
- **THEN** image pixels match the committed preview without handles, defaults contain no object text or geometry, and OCR continues to see the original captured pixels
