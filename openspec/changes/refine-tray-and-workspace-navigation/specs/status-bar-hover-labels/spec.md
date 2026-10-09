## Purpose

Allow macOS users to identify each tool inside Zero's grouped native status-bar item by hovering over its own icon, while keeping names synchronized with the displayed cells and retaining the existing single-icon fallback on other platforms.

## ADDED Requirements

### Requirement: Grouped status-bar hover hints identify the hovered cell
On macOS, the system SHALL display the current tool's display name when the pointer rests over its visible grouped status-bar cell and SHALL display Zero over the primary app cell. Moving between cells SHALL resolve the newly hovered cell without requiring the user to leave the entire grouped item.

#### Scenario: Hover a bundled tool cell
- **WHEN** a user rests the pointer over a visible Zero Snap, Zero Awake, Zero Paper, Zero Launch, or another contributed tool cell
- **THEN** the normal system hover hint identifies that tool rather than displaying the generic Zero name

#### Scenario: Hover the primary cell
- **WHEN** a user rests the pointer over the primary Ø cell
- **THEN** the hover hint displays Zero

#### Scenario: Move between adjacent cells
- **WHEN** the pointer moves from one tool cell to another tool or primary cell within the same grouped item and rests there
- **THEN** the shown hover hint corresponds to the new cell and does not retain the previous cell's name

#### Scenario: Pointer leaves the grouped item
- **WHEN** the pointer leaves all displayed cells
- **THEN** no tool-name hint remains visible over unrelated desktop content

### Requirement: Hover hints follow the current grouped layout
The system SHALL keep tool-name hint regions synchronized with the visible grouped layout after collapse/expand, tool visibility, plugin lifecycle, and display-name changes. Hidden or removed cells SHALL have no active hint region.

#### Scenario: Collapse and expand the group
- **WHEN** a user collapses the status-bar tools and later expands them
- **THEN** only the Zero hint is available while collapsed and each current tool has its correct hint after expansion

#### Scenario: Hide or remove a tool
- **WHEN** a tool cell is hidden or removed while adjacent cells remain visible
- **THEN** the remaining cells resolve to their current names and no stale region identifies the removed tool

#### Scenario: Display name changes
- **WHEN** a displayed tool name changes through supported language or plugin metadata updates
- **THEN** its hover hint reflects the current name on the next hover

#### Scenario: Different display scale
- **WHEN** the grouped item appears on an available display with a different scale factor
- **THEN** hovering over each visual cell identifies that cell without a coordinate offset into a neighboring cell

### Requirement: Hover hints preserve status-bar actions and platform boundaries
The system SHALL preserve the grouped item's compact width, order, primary toggle, approved tool actions, and per-cell right-click behavior. Hovering SHALL NOT activate tools, steal focus, or display the tray panel. Non-macOS platforms SHALL retain the existing primary Zero tooltip and named tray fallback actions.

#### Scenario: Click after identifying a cell
- **WHEN** a user clicks or right-clicks a tool cell after viewing its hint
- **THEN** the same tool action or existing menu is targeted as before the hint was added

#### Scenario: Hover while another app is active
- **WHEN** a user hovers a tool cell while working in another application
- **THEN** Zero shows only the name hint and does not activate a window or tool

#### Scenario: Single-icon platform fallback
- **WHEN** Zero runs on a platform with only the existing primary native tray item
- **THEN** that item continues to identify Zero and tool names remain available in the tray's navigation and direct-action fallback
