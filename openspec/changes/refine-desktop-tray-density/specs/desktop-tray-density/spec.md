## Purpose

Keep Zero's five-plugin tray compact and predictable while preserving the full main workspace, truthful background status feedback, readable launch results and a clear visual connection to the macOS status-bar icon.

## ADDED Requirements

### Requirement: Tray height follows bounded natural content
The system SHALL use a consistent tray width and spacing for Snap, Awake, Paper, Launch and File, shrink short content to its natural height, and cap long content to a compact height within the available display. Height changes SHALL preserve the opening anchor and existing controls. This supersedes the fixed-height portion of the compact-top-actions requirement in the active refine-tray-popover-layout change.

#### Scenario: Open a short plugin
- **WHEN** the user opens a plugin whose controls fit below the compact height limit
- **THEN** the tray ends after its content and normal bottom padding without a large stretched empty card

#### Scenario: Switch between different content heights
- **WHEN** the user switches between any of the five plugins or expands a content section
- **THEN** the panel adjusts height while retaining the top anchor, header and navigation
- **AND** late measurements from the previous plugin cannot resize the current panel

#### Scenario: Content exceeds the height limit
- **WHEN** results, jobs, schedules or error details exceed the available content height
- **THEN** the panel remains within its compact display limit and all controls remain reachable through the appropriate content viewport
- **AND** that region does not acquire nested host and plugin vertical scrollbars

#### Scenario: Background state changes without changing structure
- **WHEN** a running timer or background state refresh leaves the visible content structure unchanged
- **THEN** the panel retains its height without periodic resize oscillation

#### Scenario: Reopen or change display
- **WHEN** the tray is reopened or opened on another display
- **THEN** its content height and position are reconciled against that display's scale and usable space
- **AND** hidden-window measurements cannot reveal or reposition it

### Requirement: macOS popover bodies attach closely to the menu bar
The macOS Zero tray and dedicated Paper popover SHALL keep their bodies close to the menu-bar lower edge and aim attached carets at their actual triggering cells. Only the caret region SHALL overlap the menu-bar region when native layering and hit testing permit it; otherwise the panel SHALL use the closest usable below-menu position. Screen-edge clamping, safe fallback and independent retained placement updates SHALL remain intact.

#### Scenario: Native caret overlap is usable
- **WHEN** the panel opens with valid icon geometry and native overlap supports correct rendering and interaction
- **THEN** its body meets the menu-bar lower edge and its caret extends toward the triggering icon

#### Scenario: Native caret overlap is unusable
- **WHEN** the operating system clips the overlapping caret or overlap interferes with menu-bar interaction
- **THEN** the panel uses a close below-menu position without impairing icon clicks, dismissal or reopening

#### Scenario: Screen edge or mixed display scale
- **WHEN** the panel is constrained by a display edge or opens at a different display scale
- **THEN** it stays on the destination display and the caret identifies the actual triggering cell

#### Scenario: Invalid anchor or late placement response
- **WHEN** geometry is unavailable or an old placement response arrives after a newer one
- **THEN** missing geometry uses centered placement without a caret and stale responses cannot replace newer placement

#### Scenario: Windows tray positioning
- **WHEN** the panel opens from the Windows system tray
- **THEN** it uses bounded content height with native taskbar positioning and does not display a macOS menu-bar caret

### Requirement: Launch background reconciliation is visually quiet
Launch SHALL distinguish background running-state reconciliation from actual initial loading, user queries and index refresh. Background reconciliation alone SHALL preserve the ready status, displayed selection, result accessibility status and numeric-shortcut appearance. Activation SHALL remain tied to the displayed item and valid revision.

#### Scenario: Repeated running-state polls while idle
- **WHEN** Launch has a ready index and repeatedly refreshes application running status
- **THEN** its index status and shortcut opacity do not flash through loading states
- **AND** running badges can update without clearing the displayed list or selection

#### Scenario: Query and background result race
- **WHEN** the user edits a query while a background response is pending
- **THEN** an older response cannot replace results for the newer query

#### Scenario: Numeric activation during reconciliation
- **WHEN** the user invokes a displayed result's numeric shortcut during background reconciliation
- **THEN** activation targets that displayed item with revision validation or safely declines if the target is genuinely stale
- **AND** it never activates an item by reusing an old numeric position in a newer list

#### Scenario: Real loading, refresh or error
- **WHEN** initial loading, user search, explicit refresh, actual index invalidation or an error occurs
- **THEN** the corresponding feedback remains available and activation safety is preserved

### Requirement: Launch actions remain beside result text
Launch main-window and tray results SHALL show an icon, a stacked name/path column, and a right-aligned action/shortcut column in the same result row. Long text SHALL be abbreviated with an ellipsis without moving the action column below it; full paths SHALL remain discoverable.

#### Scenario: Tray result with a long title and path
- **WHEN** a result with long text is displayed at the normal tray width
- **THEN** its action and numeric shortcut remain at the right and the text truncates within the remaining width
- **AND** the user can inspect the complete path through a pointer or keyboard-accessible hint

#### Scenario: Locale and platform labels
- **WHEN** the interface uses Chinese or English and macOS or Windows shortcut labels
- **THEN** result actions and shortcuts remain legible without horizontal overflow or an additional action row

### Requirement: File empty-state connector is aligned
Where the File conversion empty state is shown, the system SHALL display one visually continuous horizontal conversion arrow centered between its format tokens.

#### Scenario: Empty conversion queue
- **WHEN** the File empty state is visible in the main workspace or another supported surface
- **THEN** the connector shaft and arrowhead share a centerline at normal and scaled rendering
