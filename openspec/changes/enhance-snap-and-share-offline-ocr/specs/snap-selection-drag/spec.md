## Purpose

Make an existing screenshot selection discoverably movable with a hand cursor, preserving source-pixel geometry, resize controls, annotation editing and deterministic gesture cancellation.

## ADDED Requirements

### Requirement: Selection interior provides hand cursor and translation
When the Select tool is active and a committed selection exists, hovering over selection interior without an annotation or control SHALL show a grab cursor. Dragging there SHALL show a grabbing cursor and translate the complete selection in source-image pixels without changing width, height or radius.

#### Scenario: Hover and drag selection interior
- **WHEN** the user moves into an annotation-free interior and begins a pointer drag
- **THEN** the cursor changes from grab to grabbing and the selection follows the pointer with preserved dimensions and radius

#### Scenario: Translation reaches an image boundary
- **WHEN** dragging would put part of the selection outside the captured image
- **THEN** the selection clamps without shrinking and responds immediately when the pointer returns toward valid positions

#### Scenario: Image axis is fully selected
- **WHEN** the selection fills the captured image along one axis
- **THEN** dragging cannot translate along that axis but can still translate along any non-full axis

### Requirement: Dragging preserves gesture priority and rollback
Controls and resize handles SHALL take precedence over annotations, annotations over selection interior translation, and selection interior over outside selection creation. Pointer capture SHALL preserve the active gesture outside the selection. Cancel, capture loss or Escape during translation SHALL restore the pre-gesture selection.

#### Scenario: Handle or annotation is hit
- **WHEN** the pointer starts on a resize handle or an existing annotation
- **THEN** the existing resize or annotation selection behavior runs without translating the screenshot selection

#### Scenario: Pointer is released outside the selection
- **WHEN** an interior drag leaves the selection and ends with pointer up
- **THEN** its valid clamped draft commits without starting a second gesture

#### Scenario: User cancels translation
- **WHEN** pointer cancellation, lost capture or Escape occurs during translation
- **THEN** the initial geometry returns, the draft clears and that Escape does not also close the capture session

#### Scenario: Outside canvas or drawing tool
- **WHEN** the user drags outside the existing selection in Select or uses an annotation drawing tool
- **THEN** outside selection creation or the drawing tool continues to work without being consumed by interior movement

### Requirement: Translation updates crop feedback without changing annotation history
The border, dimming, dimensions and toolbar SHALL follow the current translation draft. Translation MUST NOT move source-anchored annotations or add annotation undo entries. Copy, Save, Pin and OCR SHALL use the committed selection and exclude interaction chrome.

#### Scenario: Moving selection over existing source content
- **WHEN** the selection translates and commits
- **THEN** feedback follows the crop, annotations keep their original source coordinates and the selected region is used by subsequent output actions
