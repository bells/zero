## Purpose

Give macOS Zero Snap users a compact, accessible property panel for each existing annotation tool, with predictable source-pixel values and matching preview and image output.

## ADDED Requirements

### Requirement: Property panels follow the active tool or selected object
The macOS custom capture editor SHALL expose the following properties for drawing defaults and for a selected annotation of the same type. Select without an object, Pin, OCR, Copy, Save, Undo, Redo and Cancel MUST NOT expose invented drawing properties.

| Tool | Properties |
| --- | --- |
| Rectangle | Stroke width, opacity, color, outline/solid, corner radius |
| Ellipse | Stroke width, opacity, color, outline/solid |
| Arrow | Stroke width, opacity, color, single/double headed |
| Pen | Stroke width, opacity, color |
| Text | Font size, opacity, color, bold |
| Mosaic | Pixel block size only |

#### Scenario: Drawing tool changes
- **WHEN** the user switches from Rectangle to Text without a selected object
- **THEN** the panel shows Text defaults and its applicable properties instead of Rectangle properties

#### Scenario: Existing object is selected
- **WHEN** the Select tool selects an existing ellipse
- **THEN** the panel identifies the selected-object editing context and displays that ellipse's current properties

#### Scenario: No editable annotation is targeted
- **WHEN** Select has no selected object or a non-annotation action is active
- **THEN** no annotation property panel consumes drawing input or presents irrelevant controls

### Requirement: Numeric properties have source-pixel ranges and stable initial values
The editor SHALL provide both a slider and a numeric input for each numeric property using the following inclusive integer ranges and initial defaults. Pixel values SHALL refer to exported source-image pixels, independently of viewport scale or display density.

| Property | Range | Initial default |
| --- | --- | --- |
| Rectangle/ellipse stroke width | 1–32 px | 4 px |
| Arrow/pen stroke width | 1–32 px | 5 px |
| Opacity, excluding Mosaic | 1–100% | 100% |
| Rectangle corner radius | 0–100 px, additionally limited to the integer floor of half its shorter side | 0 px |
| Text font size | 12–96 px | 24 px |
| Mosaic pixel block size | 4–64 px | 14 px |

Finite integer requests outside the applicable range SHALL clamp to that range. Empty, non-numeric, non-finite or fractional numeric edits SHALL leave the committed value unchanged and expose an invalid state until corrected or cancelled. Enter, Tab or focus loss SHALL commit valid numeric edits; Escape SHALL restore the value from before the edit without exiting capture. A rectangle default radius SHALL retain its requested 0–100 px value, while each created or resized rectangle SHALL limit its actual radius to its own bounds.

#### Scenario: First rectangle uses initial defaults
- **WHEN** no valid saved Rectangle defaults exist and the user draws a rectangle
- **THEN** its stroke width is 4 px, opacity is 100%, radius is 0 px, color is #55f280 and mode is outline

#### Scenario: Numeric input is invalid or outside limits
- **WHEN** the user commits an invalid numeric value or a finite out-of-range integer
- **THEN** invalid input preserves the previous committed value with an invalid indication, while an out-of-range integer clamps to the documented range

#### Scenario: Radius is limited per object
- **WHEN** a 20-by-10 px rectangle is created or resized with a requested radius of 40 px
- **THEN** that object's radius becomes 5 px and the next Rectangle default remains 40 px

#### Scenario: Editor is scaled on a Retina display
- **WHEN** a 4 px stroke is drawn in a viewport where source pixels and display pixels differ
- **THEN** exported stroke width remains 4 source pixels and the displayed preview uses the same source geometry

### Requirement: Color fill and opacity have unambiguous semantics
Rectangle, Ellipse, Arrow, Pen and Text SHALL offer preset colors and a custom color control. The initial color SHALL be #55f280. Rectangle and Ellipse SHALL default to outline and use one chosen color: outline draws the border only, and solid fills the interior without a separately colored border. Arrow SHALL default to single-headed; Text SHALL default to regular weight and the existing system font stack. Opacity SHALL apply once to the completed annotation as a whole, including overlapping parts, and SHALL NOT leak to later annotations. Solid mode SHALL retain stroke-width settings for switching back to outline without expanding its fill bounds.

#### Scenario: User switches a rectangle to solid
- **WHEN** the user selects a custom color, solid mode and 40% opacity
- **THEN** the rectangle interior uses that color at 40% opacity without an independently configurable border or extra opacity overlap at its edges

#### Scenario: Translucent arrow has overlapping components
- **WHEN** an arrow shaft overlaps its arrowhead at 50% opacity
- **THEN** that overlap has the same annotation opacity as the rest of the arrow, and the next annotation retains its own opacity

#### Scenario: Double-headed arrow or bold text is enabled
- **WHEN** the corresponding property is enabled
- **THEN** the arrow has a head at each endpoint or the text uses bold weight consistently in the preview and exported image

### Requirement: Mosaic always replaces its area at full coverage
Mosaic SHALL expose only its pixel block size, with larger values producing coarser blocks. It MUST NOT offer color, fill or opacity settings, inherit translucent drawing state, or blend the unpixelated original back into its covered area. This coverage requirement SHALL NOT imply that pixelation guarantees irreversible removal of sensitive content.

#### Scenario: Mosaic follows a translucent drawing tool
- **WHEN** the user switches from a 20%-opacity Pen to Mosaic and covers an area
- **THEN** Mosaic replaces the covered area with its pixelated result at full coverage in preview and image output

#### Scenario: Mosaic strength changes on an existing object
- **WHEN** the user changes the pixel block size of a selected mosaic
- **THEN** the effect is recomputed from the same underlying scene content, without accumulating previous mosaic previews or changing its geometry

### Requirement: Property panels remain reachable and localized
The secondary panel SHALL anchor beside the selection-following main toolbar, remeasure when its content changes, flip or clamp within the visible viewport, and keep main actions and selection geometry controls operable. When necessary it SHALL wrap controls or use bounded internal scrolling. Controls SHALL provide Chinese/English labels, accessible names, visible keyboard focus, keyboard-operable inputs and practical pointer targets; native color controls SHALL NOT cancel capture simply by taking focus. Panel interactions MUST NOT draw annotations, move the crop, or invoke canvas Delete/undo/nudge hotkeys while an input consumes them.

#### Scenario: Tool panel meets a screen edge
- **WHEN** the selection or active tool changes near a viewport corner
- **THEN** the measured panel is repositioned or internally scrollable so all controls and main actions remain reachable without overlapping the geometry control bar

#### Scenario: User edits a focused numeric input
- **WHEN** the user presses arrows, Delete, undo or Escape in that input
- **THEN** the input's own editing interaction runs and the canvas does not move a selection, delete an annotation or close the screenshot session

#### Scenario: Custom color control receives focus
- **WHEN** the user opens and closes the custom color control
- **THEN** capture remains active and a confirmed color updates the intended tool default or selected object

### Requirement: Image output matches the committed annotation scene
Preview and Copy/Save/Pin SHALL use the same committed annotation properties, geometry, z-order and compositing. The final screenshot crop and crop corner-radius mask SHALL apply to the composed image. Annotation rectangle radius MUST remain independent of crop radius. Selection outlines, object controls, property panels, text input chrome and masks MUST NOT enter output. Output actions SHALL be unavailable while a text or pointer/property edit remains uncommitted. OCR SHALL continue using original frozen pixels from the committed region rather than annotations.

#### Scenario: User exports edited annotations
- **WHEN** the user copies, saves or pins a scene with solid rounded shapes, opacity, bold text, double-headed arrows and mosaic
- **THEN** the image contains the same committed effects clipped to the screenshot selection, with no editing chrome

#### Scenario: Crop and rectangle radii differ
- **WHEN** a rectangle radius changes while the screenshot crop radius is nonzero
- **THEN** only that annotation changes and final transparent crop corners still follow the independent crop geometry

#### Scenario: Edit is still active
- **WHEN** a text draft, object drag or property interaction has not committed or cancelled
- **THEN** Copy/Save/Pin cannot export a mixture of draft and committed state

#### Scenario: OCR follows annotation changes
- **WHEN** the user recognizes a committed region containing annotations
- **THEN** recognition receives its original screenshot pixels and the existing action hint continues to explain that annotations do not alter OCR input
