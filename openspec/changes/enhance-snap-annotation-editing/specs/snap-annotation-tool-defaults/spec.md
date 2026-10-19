## Purpose

Preserve each Zero Snap annotation tool's preferred style across capture sessions and restarts, while isolating selected-object edits and retaining only validated, non-content configuration.

## ADDED Requirements

### Requirement: Drawing defaults are independent for each tool
Each of Rectangle, Ellipse, Arrow, Pen, Text and Mosaic SHALL retain its own applicable default properties. Changing defaults SHALL affect subsequently created annotations only; changing an existing selected object's properties SHALL affect that object only. The panel SHALL distinguish these two editing contexts. Switching tools SHALL restore that tool's defaults without importing another tool's color, opacity, width or other fields.

#### Scenario: User changes a tool default
- **WHEN** the user changes Rectangle color without an object selected and draws two rectangles
- **THEN** both new rectangles use that color while existing objects and other tool defaults remain unchanged

#### Scenario: User changes an existing object
- **WHEN** the user selects an older rectangle, changes its opacity, and returns to Rectangle drawing
- **THEN** only the selected rectangle has changed and the next rectangle still uses the saved Rectangle default opacity

#### Scenario: Tools have different opacity
- **WHEN** the user switches between Pen, Rectangle and Mosaic
- **THEN** each drawing context restores only its applicable defaults and Mosaic always retains full coverage

### Requirement: Style defaults survive sessions without retaining content
The editor SHALL persist supported tool default properties across screenshot sessions and application restarts. Persistent data MUST contain only versioned, allowlisted style configuration, excluding screenshot pixels, annotation coordinates or IDs, text/OCR content, scene history, session/media/lease tokens and file paths. Existing application preferences and legacy migration inputs MUST remain compatible. Writing defaults MUST NOT depend on native screenshot commit or produce a screenshot export.

#### Scenario: User starts another capture or restarts the app
- **WHEN** the user finishes a default-style change and later opens another screenshot session, including after application restart
- **THEN** the same tool restores its validated saved defaults while the new scene contains no annotations from the previous session

#### Scenario: Defaults are saved after private text is entered
- **WHEN** the user creates text content and changes a tool default
- **THEN** stored configuration contains only allowlisted style values and contains no text, image, geometry, scene or session data

### Requirement: Invalid or unavailable storage does not block capture
Loading defaults SHALL validate the supported version, tool keys, property types, finite integer ranges and opaque colors before use. Missing or malformed configuration SHALL fall back to initial defaults; invalid individual tool properties SHALL fall back independently, and unknown properties SHALL be ignored. Numeric out-of-range stored integers SHALL clamp consistently with the property rules. Unknown versions SHALL NOT be guessed or destructively overwritten merely by opening capture. Storage read/write failures SHALL leave drawing functional using in-memory defaults and show a localized, nonblocking indication when a requested save cannot persist.

#### Scenario: Storage contains a malformed property
- **WHEN** saved Text size is invalid but its color is valid
- **THEN** Text size falls back to its initial value, the valid color remains available, and capture opens normally

#### Scenario: Stored schema version is unknown
- **WHEN** the editor reads defaults written with an unsupported version
- **THEN** it uses initial defaults without applying unknown fields or overwriting that saved record on initialization

#### Scenario: Storage write fails
- **WHEN** saving a changed default fails
- **THEN** the new value remains usable in the current session, the UI explains that it could not be remembered, and no capture or export fails as a consequence

### Requirement: Restore defaults targets tool configuration only
The property panel SHALL provide an explicitly labeled action to restore the currently displayed tool's defaults to the documented initial values. In selected-object context the action SHALL explicitly identify that it resets tool defaults rather than the selected object. A successful reset SHALL persist for later sessions, leave existing annotations and annotation history untouched, and SHALL NOT reset other tools, crop geometry or global preferences.

#### Scenario: User resets one tool
- **WHEN** the user restores Rectangle defaults
- **THEN** future rectangles use the initial Rectangle values, existing rectangles and other tool defaults remain unchanged, and no annotation undo entry is added

#### Scenario: Reset occurs with an object selected
- **WHEN** a selected rectangle is displayed and the user activates the explicitly labeled tool-default reset
- **THEN** the selected rectangle keeps its current properties and the reset affects only subsequent Rectangle drawing defaults
