## Purpose

Provide space-efficient plugin navigation in Zero's tray and standalone main window so growing tool collections remain reachable while the active tool retains useful working space, accessible names, and predictable selection behavior.

## ADDED Requirements

### Requirement: Tray plugin navigation occupies one bounded row
The system SHALL show visible plugins as distinct icon buttons in one horizontal row in the tray quick panel. Navigation SHALL NOT wrap into additional rows or increase its height as plugins are added, and each plugin button SHALL provide a target of at least 44 by 44 logical pixels.

#### Scenario: Five bundled tools fit the default panel
- **WHEN** the five bundled tools are visible in the default 400 logical pixel wide tray panel
- **THEN** navigation displays their distinct icons on one row, identifies the selected tool, and leaves the remaining content area for that tool

#### Scenario: More tools than available width
- **WHEN** the visible tool collection exceeds the row's available width
- **THEN** the row scrolls horizontally without wrapping or pushing the fixed bottom system actions outside the panel

### Requirement: Overflow tools remain discoverable and operable
The system SHALL support native horizontal scrolling, touch swiping, keyboard access, and labeled previous/next scroll buttons when the tray tool row overflows. Focused and selected tools SHALL be brought into view without requiring the user to drag with a mouse.

#### Scenario: Reach an offscreen tool with scroll controls
- **WHEN** a user activates a directional scroll button on an overflowing row
- **THEN** the row reveals tools in that direction and disables the button when its corresponding boundary is reached

#### Scenario: Reach and select tools using the keyboard
- **WHEN** a user tabs to an offscreen tool and presses Enter or Space
- **THEN** that button becomes visible, shows keyboard focus, and selects its tool content

#### Scenario: Selected tool changes outside the row
- **WHEN** an existing host action selects a tool outside the current horizontal viewport
- **THEN** the row reveals the selected tool and updates the selection indication

#### Scenario: Collection and available width change
- **WHEN** tool visibility, collection size, or row width changes
- **THEN** the row recalculates overflow and selection visibility without leaving stale enabled scroll controls

### Requirement: Compact navigation retains names and meaningful states
The system SHALL give each tool entry a full localized accessible name, a visible keyboard focus indication, and a selected indication distinguishable without relying only on color. Icon-only entries SHALL show their tool name on hover and keyboard focus, and tool health SHALL remain available without replacing the tool's identifying icon.

#### Scenario: Identify an icon-only tool
- **WHEN** a user hovers over or focuses an icon-only tool entry
- **THEN** the complete tool name is displayed without being clipped by the navigation scroll container

#### Scenario: Long localized name
- **WHEN** a tool has a long Chinese or English display name
- **THEN** the navigation preserves its click target and provides the full name in its accessible label and name hint even if visible list text is truncated

#### Scenario: Tool without a custom icon
- **WHEN** an installed tool has no host-supported navigation icon
- **THEN** it displays a generic extension icon with its own name and remains independently selectable

#### Scenario: Hidden or disabled selection
- **WHEN** the currently selected tool becomes unavailable in the visible navigation collection
- **THEN** the existing selection fallback chooses an available tool or presents a localized empty state without stale selected entries

### Requirement: Main window sidebar can collapse without losing navigation
The system SHALL provide a labeled sidebar collapse/expand control. The expanded sidebar SHALL show icons and tool names in compact rows; the collapsed sidebar SHALL preserve icons, selection, health information, name hints, and keyboard access. Each tool row SHALL have a target height of at least 44 logical pixels.

#### Scenario: Collapse the sidebar
- **WHEN** a user activates the sidebar collapse control
- **THEN** the sidebar becomes an icon rail, the workspace gains width, and the selected tool content and active tasks are preserved

#### Scenario: Expand the sidebar
- **WHEN** a user activates the sidebar expand control
- **THEN** the sidebar shows tool names again without resetting tool selection or content state

#### Scenario: Many tools in a short window
- **WHEN** the tool list exceeds the available sidebar height in either mode
- **THEN** the tool list scrolls vertically while the collapse/expand control remains reachable and the workspace retains independent scrolling

### Requirement: Sidebar preference is persistent and responsive
The system SHALL remember the user's main-window sidebar mode across reopening and restart. Older preferences without a sidebar field SHALL default to expanded. Narrow-window automatic compaction SHALL NOT overwrite the saved wide-window preference or affect status-bar group collapse settings.

#### Scenario: Reopen using the saved mode
- **WHEN** the user chooses a sidebar mode and later reopens a sufficiently wide main window
- **THEN** that mode is restored with existing language and tool visibility preferences intact

#### Scenario: Load legacy preferences
- **WHEN** valid existing preferences omit sidebar mode or contain an invalid value for that field
- **THEN** the sidebar defaults to expanded without discarding the other preferences

#### Scenario: Narrow window becomes wide again
- **WHEN** the main window becomes narrow enough to require compact navigation and later returns to a wider size
- **THEN** the sidebar first uses a compact rail and then restores the saved user mode without stacking a full tool list above the workspace

#### Scenario: Sidebar preference cannot be saved
- **WHEN** persistent storage fails while the user changes sidebar mode
- **THEN** the current session keeps the chosen mode, shows non-blocking feedback, and preserves the previously stored preferences

### Requirement: Compact navigation preserves existing actions and accessibility
The system SHALL retain tray preferences/open Zero/more actions, preferences within main and the dedicated about surface, plugin behavior, and non-macOS direct-action fallback. Changed navigation SHALL support Chinese and English, visible focus, WCAG AA contrast, and reduced-motion settings.

#### Scenario: Non-macOS tool action fallback
- **WHEN** a user activates an existing direct tool action in the fallback row
- **THEN** the same approved tool action runs without being confused with merely selecting that plugin in navigation

#### Scenario: Reduced motion is requested
- **WHEN** the system requests reduced motion
- **THEN** sidebar and programmatic scroll changes avoid animated transitions while preserving focus and selection visibility
