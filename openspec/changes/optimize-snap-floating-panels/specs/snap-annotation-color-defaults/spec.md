## Purpose

Distinguish newly drawn annotations from the green screenshot selection using red factory defaults, while preserving each user's saved tool preferences and the colors of existing annotation objects.

## ADDED Requirements

### Requirement: Colored annotations have red factory defaults
Rectangle, Ellipse, Arrow, Pen and Text SHALL use the existing preset red #ff5252 as their factory color when no valid saved color exists. Their other initial properties SHALL retain their documented values. The screenshot selection frame SHALL retain its existing green color. Mosaic and Pin SHALL NOT gain a color property as part of this change.

#### Scenario: Fresh defaults are loaded
- **WHEN** a screenshot starts without valid saved colors for Rectangle, Ellipse, Arrow, Pen and Text
- **THEN** each of those five tools creates red #ff5252 annotations while the screenshot selection frame remains green

#### Scenario: Rectangle is drawn with initial style
- **WHEN** no valid Rectangle defaults exist and the user draws a rectangle
- **THEN** it uses red #ff5252, stroke width 4 source pixels, full opacity, outline mode and zero annotation corner radius

#### Scenario: Tool does not support color
- **WHEN** the user activates Mosaic or Pin
- **THEN** the tool retains its existing non-color semantics and exposes no invented color setting

### Requirement: Saved colors and existing annotations remain authoritative
Valid saved colors SHALL override the new factory color, including saved green #55f280. Loading defaults SHALL NOT rewrite valid preferences or recolor existing annotation objects. Missing or invalid colors SHALL fall back independently to factory red using the existing validation behavior; valid unrelated fields SHALL remain effective. No one-time green-to-red migration SHALL occur.

#### Scenario: Existing installation has saved green
- **WHEN** a tool has a valid persisted green color and a new screenshot starts
- **THEN** that tool continues using saved green until the user changes or resets its defaults

#### Scenario: Saved record mixes valid and invalid fields
- **WHEN** saved Text color is invalid but its font size is valid
- **THEN** Text falls back to red while retaining its valid saved font size without blocking capture

#### Scenario: Existing object uses a custom color
- **WHEN** factory defaults change or a new drawing context is opened
- **THEN** the existing object's committed color remains unchanged

### Requirement: Tool-default reset restores red without resetting toolbar group position
The existing restore-defaults action SHALL restore only the displayed tool's factory properties and persist those properties using the existing versioned style-only format. For colored tools this SHALL include red #ff5252. It SHALL NOT recolor existing objects, alter annotation history, reset other tools or change a manually positioned toolbar group. Restoring automatic toolbar group position SHALL NOT reset any tool color.

#### Scenario: User resets a saved-green Rectangle default
- **WHEN** the user restores Rectangle tool defaults
- **THEN** subsequently drawn rectangles use factory red and the reset survives later sessions while existing objects, other tool defaults and manual toolbar group position remain unchanged

#### Scenario: User resets defaults while editing an object
- **WHEN** a selected green rectangle is displayed and the user invokes the explicitly labeled tool-default reset
- **THEN** that rectangle remains green and only subsequent Rectangle drawing uses factory red

#### Scenario: User restores toolbar group position after choosing blue
- **WHEN** the user sets a tool's default color to blue and activates restore automatic position
- **THEN** the toolbar group returns to automatic placement and that tool's default remains blue
