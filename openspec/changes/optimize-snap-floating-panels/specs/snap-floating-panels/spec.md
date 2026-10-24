## Purpose

Keep macOS Zero Snap capture actions close to the selected region without covering it unnecessarily, while allowing users to move the toolbar and its attached annotation properties together during a capture session.

## ADDED Requirements

### Requirement: Toolbar is centered with ordered vertical placement
The editor SHALL center the main toolbar horizontally on the current screenshot selection, extending beyond a narrow selection when necessary, and translate it only as needed to remain within viewport safe margins. Automatic placement SHALL prefer outside below, then outside above, then inside along the bottom of the selection. Outside placement SHALL require enough height for the toolbar, its gaps and the reserved annotation property space. Inside-bottom placement SHALL be used only when neither outside candidate fits. When no complete candidate fits, the editor SHALL clamp the controls within the viewport and bound property-panel scrolling rather than placing actions offscreen.

#### Scenario: Complete controls fit below the selection
- **WHEN** the viewport has enough space below the selection for the toolbar and reserved property space
- **THEN** the toolbar is immediately below and horizontally centered on the selection, subject to viewport safe margins

#### Scenario: Space below fits only the toolbar
- **WHEN** the space below fits the toolbar alone but not its reserved property space and the complete controls fit above
- **THEN** the toolbar is placed outside above the selection rather than below or inside it

#### Scenario: Selection reaches the bottom of the screen
- **WHEN** the selection reaches the viewport bottom and the complete controls fit above the selection
- **THEN** the toolbar is centered outside above the selection

#### Scenario: Selection leaves no outside space
- **WHEN** neither complete outside candidate fits, including a full-screen selection
- **THEN** the toolbar is centered inside the selection along its bottom edge with its inner inset, with properties above it

#### Scenario: Selection is narrow or touches a horizontal edge
- **WHEN** centering the toolbar would extend beyond the selection or viewport
- **THEN** extension beyond the selection is allowed, horizontal translation is limited to keeping it in the viewport, and a toolbar wider than the available viewport retains horizontal scrolling

### Requirement: Automatic placement reserves stable property space
Automatic toolbar placement SHALL reserve the maximum required height among all supported annotation panels at the current responsive width and locale, including when no panel is open. That reservation SHALL remain independent of which tool or object is targeted, panel visibility and manual toolbar positioning. The reservation SHALL NOT render an empty panel. The editor SHALL recalculate from selection, viewport and responsive layout changes, rather than from active-panel height alone.

#### Scenario: A larger panel is opened
- **WHEN** the user opens Rectangle properties after no panel or a shorter panel was visible without changing selection or viewport
- **THEN** the main toolbar retains its position and the complete panel fits within its reserved space

#### Scenario: Panel is moved manually or hidden
- **WHEN** the user hides or reopens properties, or moves or restores the toolbar group without changing selection or viewport
- **THEN** the main toolbar does not relocate because of that panel state change

#### Scenario: Responsive layout changes
- **WHEN** viewport dimensions or locale change the largest required panel height
- **THEN** the reservation is remeasured and the layout is recalculated within the current viewport

### Requirement: Automatic panels expand away from the nearest screen edge
In automatic mode, properties SHALL appear below an outside-bottom toolbar and above an outside-top or inside-bottom toolbar. A caret SHALL identify the corresponding visible tool button and track toolbar scrolling; it SHALL be hidden when that button is outside the scroll viewport. The property panel SHALL independently clamp horizontally within viewport margins without shifting the main toolbar away from its selection-centered anchor. Selection size/radius controls SHALL be anchored to the crop: 2 CSS pixels above its top-left edge when space is available, otherwise 2 CSS pixels below its top edge inside the crop, subject only to viewport bounds. Toolbar/property position SHALL NOT affect this placement; a manually moved toolbar may cover the controls. Automatic outside toolbar candidates SHALL clear the fixed strip before their complete reserved-space fit is evaluated.

#### Scenario: Above-selection toolbar exposes properties
- **WHEN** the toolbar is outside above the selection and the user opens a tool's properties
- **THEN** properties appear above that toolbar and their caret points downward toward the corresponding button

#### Scenario: Toolbar is dragged over geometry controls
- **WHEN** the user manually drags the toolbar over the size/radius strip
- **THEN** the strip retains its crop-anchored position and the toolbar may cover it

#### Scenario: Crop has no room above
- **WHEN** the strip cannot fit above the crop
- **THEN** it is placed 2 CSS pixels below the crop's top edge rather than seeking space around the toolbar

#### Scenario: A property panel is wider than the toolbar
- **WHEN** the active automatic panel would overflow a horizontal viewport edge
- **THEN** the panel shifts within viewport margins while the main toolbar remains at its own centered or clamped position

### Requirement: Compact toolbar preserves all actions and accessibility
The desktop toolbar SHALL use 40-by-40 CSS-pixel action buttons, 20-pixel icons, 2-pixel within-group spacing, 4-pixel between-group spacing and 4-pixel outer padding. It SHALL retain all existing actions, functional order, grouping, state cues, localized names, keyboard access and visible focus. Narrow viewports SHALL retain horizontal scrolling rather than hide actions or reduce targets further. One icon-only dot grip SHALL remain outside the scrolling action area, without a visible drag label or separate position-recovery button.

#### Scenario: Compact desktop toolbar is shown
- **WHEN** the toolbar has enough horizontal viewport space
- **THEN** all existing tools and actions remain in their original groups and order at the documented compact dimensions

#### Scenario: Keyboard user accesses an overflowed action
- **WHEN** an action lies outside the visible horizontal toolbar portion and receives keyboard focus
- **THEN** it becomes visible and remains operable with a localized accessible name and visible focus

### Requirement: Toolbar moves together with attached properties
The main toolbar SHALL provide a localized, focusable drag handle with an icon-only dot grip and an accessible name/tooltip describing dragging, double-click recovery and keyboard controls. Pointer movement starting on that handle SHALL move the toolbar and its visible annotation properties together, preserving their vertical relationship and tool-button association. Properties SHALL have no separate drag handle, manual position or position-recovery action. Property inputs, sliders, colors and blank content SHALL NOT initiate toolbar or panel movement. Dragging SHALL NOT alter crop geometry, annotation content, tool defaults or history.

#### Scenario: User drags the toolbar
- **WHEN** the user drags and releases the main toolbar handle
- **THEN** the toolbar moves to the requested bounded position and its visible properties follow the same movement away from viewport edges

#### Scenario: User interacts inside properties
- **WHEN** the user drags property-panel blank content, adjusts a slider, edits a number or chooses a color
- **THEN** properties do not acquire an independent position and the toolbar retains its position

#### Scenario: Properties are temporarily hidden
- **WHEN** the user hides and reopens properties or changes tools or selected objects
- **THEN** the toolbar retains its manual position, subject only to viewport bounds, and properties remain anchored to the corresponding tool button with the appropriate caret

#### Scenario: Crop changes after manual movement
- **WHEN** the screenshot selection is moved or resized
- **THEN** the manually positioned toolbar remains at its viewport position and properties continue following the toolbar

#### Scenario: Next screenshot starts
- **WHEN** a new screenshot session is initialized
- **THEN** the toolbar group starts in automatic mode without loading a prior manual position

### Requirement: Group movement remains bounded and cancellable
Manual toolbar movement SHALL retain the property's side from the start of the move and reserve the current responsive maximum property height when clamping the group vertically. Properties SHALL retain horizontal viewport clamping and visible-button caret tracking. Viewport or responsive-size changes SHALL translate the manual toolbar only when needed to keep controls accessible. Short viewports SHALL bound property scrolling. Pointer cancellation, unexpected lost capture or Escape during a drag SHALL restore the pre-drag group position and automatic/manual mode without cancelling capture or another editing layer. Normal release SHALL commit without being reverted by the subsequent lost-capture event. Unmounting SHALL release capture and listeners.

#### Scenario: User moves the toolbar toward an edge
- **WHEN** the requested group position would place the toolbar or reserved properties beyond the viewport
- **THEN** the toolbar is clamped using the attached-property space and properties remain accessible within safe margins

#### Scenario: Drag is cancelled
- **WHEN** Escape, pointer cancellation or unexpected capture loss interrupts a toolbar drag
- **THEN** the complete group restores its starting position and mode without changing the crop, annotations or capture lifecycle

#### Scenario: Keyboard user moves the toolbar
- **WHEN** the toolbar handle is focused and an arrow key is pressed
- **THEN** the group moves 1 CSS pixel, or 10 CSS pixels with Shift, without invoking canvas nudge, deletion or undo

### Requirement: Toolbar position recovery and tool style reset remain independent
Double-clicking the toolbar dot grip SHALL restore automatic group position. Enter or Space on the focused grip SHALL provide the same recovery. There SHALL be no separate position-recovery button; full Chinese/English accessible labels SHALL describe the gesture, distinct from the property panel's tool-default style reset. Restoring position SHALL reapply the current selection's automatic toolbar placement, property side and caret without changing styles or scene history. Tool-default reset SHALL NOT change the toolbar position. Editing chrome SHALL remain excluded from Copy, Save, Pin and OCR inputs.

#### Scenario: User restores automatic position
- **WHEN** the user double-clicks the dot grip or presses Enter/Space on it after moving the group
- **THEN** the toolbar returns to its current automatic placement and properties follow without changing a style, object, default or history entry

#### Scenario: User resets style after moving the group
- **WHEN** the user resets the current tool's defaults inside properties
- **THEN** only those defaults reset and the toolbar group retains its manual position

#### Scenario: User exports after moving the toolbar
- **WHEN** the user copies, saves, pins or invokes OCR after moving the group
- **THEN** toolbar/property controls and caret are excluded from image output, and OCR continues using original screenshot pixels

### Requirement: Annotation properties share a compact two-row layout
Every supported tool's annotation property panel SHALL use two content rows in both default and selected-object contexts. The first row SHALL contain compact tool/context information, five common preset colors and a native custom-color entry when supported, existing tool options, and the style reset. The second row SHALL contain the tool's numeric controls. All existing editing capabilities, full accessible labels and transaction behavior SHALL remain. Narrow viewports SHALL use bounded horizontal scrolling instead of adding content rows or hiding controls. Effective measurement SHALL include any scrollbar space so the stable maximum reservation and group bounds remain accurate.

#### Scenario: Colored tool properties are opened
- **WHEN** Rectangle, Ellipse, Arrow, Pen or Text properties are opened
- **THEN** five presets (red, yellow, green, blue and black) and an accessible native custom-color picker entry are available in the first row, with factory red unchanged

#### Scenario: Tool has no color
- **WHEN** Mosaic properties are opened
- **THEN** it uses the same two-row structure without an invented color control

#### Scenario: Narrow property panel
- **WHEN** the two-row contents exceed the viewport's available width
- **THEN** horizontal scrolling and keyboard focus reveal every control while preserving two content rows and the toolbar anchor

#### Scenario: Saved color is outside the five presets
- **WHEN** a valid saved or selected-object color is not among the five common presets
- **THEN** it remains unchanged and appears in the custom-color entry without preference migration or recoloring
