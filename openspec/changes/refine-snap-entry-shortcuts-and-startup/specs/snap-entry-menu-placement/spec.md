## Purpose

Keep Snap's native action menu anchored to its clicked icon without obscuring the macOS menu bar or leaving the target display.

## ADDED Requirements

### Requirement: Native menu respects the status bar boundary
Snap SHALL retain its native menu and display it beneath the clicked macOS status-bar glyph, with horizontal bounds constrained to that display. Windows SHALL retain native system-tray placement.

#### Scenario: Click Snap on a display edge
- **WHEN** the user opens Snap near the right edge of a macOS display
- **THEN** the menu top is below the menu bar, all actions remain visible on that display, and dismissal clears the glyph highlight
