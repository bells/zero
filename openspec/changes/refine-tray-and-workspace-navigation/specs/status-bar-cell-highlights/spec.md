## Purpose

Give macOS users clear per-tool click feedback within Zero's single grouped status-bar item, while retaining whole-group feedback for the primary app icon and clearing feedback safely as transient surfaces and layout change.

## ADDED Requirements

### Requirement: Tool click highlights only its own cell
On macOS, the system SHALL restrict the background highlight for a tool press, its native menu, or its active transient surface to that tool's visible cell. Adjacent tools and the primary Ø cell SHALL NOT be highlighted by that tool interaction, including during initial mouse down. Primary Ø interactions SHALL retain permitted whole-group feedback. Feedback SHALL NOT create a new persistent tool selection or change existing tool actions.

#### Scenario: Press a tool cell
- **WHEN** the user presses a visible tool cell
- **THEN** only that cell shows pressed background feedback without a whole-group flash

#### Scenario: Tool menu is open
- **WHEN** the user opens the existing right-click menu for a tool cell
- **THEN** any menu-tracking background highlight remains confined to that tool cell and the menu still targets that tool

#### Scenario: Tool transient surface is active
- **WHEN** an existing tool action opens an active transient tool surface with status-bar feedback
- **THEN** the feedback identifies only the initiating cell while preserving existing toggle and focus behavior

#### Scenario: Direct action completes
- **WHEN** a tool click performs a direct action without leaving a menu or transient surface active
- **THEN** pressed feedback is released and the existing status glyph continues to show actual tool state

#### Scenario: Press the primary cell
- **WHEN** the user presses primary Ø or keeps its tray panel active
- **THEN** background feedback may cover the current grouped item, and collapsed mode limits it to the visible Ø item

### Requirement: Cell highlight follows current interaction and layout
The system SHALL clear cancelled or completed feedback and keep any valid active highlight aligned with current cell bounds after layout changes. A stale close or focus event SHALL NOT clear a newer interaction's feedback. Hover alone SHALL NOT activate background highlight or tool actions.

#### Scenario: Cancel a press or fail an action
- **WHEN** the user cancels a tool press or the requested action fails
- **THEN** no stale pressed highlight remains

#### Scenario: Close or deactivate an associated surface
- **WHEN** the associated menu or transient tool surface closes, hides, or loses active status without a newer interaction replacing it
- **THEN** its cell background highlight is cleared

#### Scenario: New interaction precedes an older close
- **WHEN** a new cell interaction becomes active before an older surface's close or blur event arrives
- **THEN** the older event does not clear the new cell's valid feedback

#### Scenario: Collapse hide or remove a highlighted tool
- **WHEN** a highlighted tool becomes invisible through collapse, visibility, disablement, or removal
- **THEN** its highlight is cleared and no neighboring cell inherits it

#### Scenario: Refresh icons or visible cell layout
- **WHEN** status glyphs, visible cell order, count, or display scale change while a valid highlight exists
- **THEN** that highlight follows its current tool cell without offsetting tooltip or click regions

#### Scenario: Hover another cell
- **WHEN** the user hovers another cell without pressing it
- **THEN** its name hint works without creating another active highlight or executing an action

### Requirement: Highlight preserves native grouping and platform behavior
The system SHALL retain one grouped macOS status-bar item, existing width/order/collapse semantics, template glyphs, per-cell actions and hover hints. Background feedback SHALL remain readable in light and dark appearances and supported display scales. Non-macOS platforms SHALL retain their existing single-item native feedback.

#### Scenario: Light dark and scaled displays
- **WHEN** users operate tool cells under supported system appearance and display scale configurations
- **THEN** cell background feedback and glyphs remain legible and aligned with the intended cell

#### Scenario: Single-icon platform
- **WHEN** Zero uses a non-macOS single native tray item
- **THEN** its existing system click feedback and named fallback tool actions remain available
