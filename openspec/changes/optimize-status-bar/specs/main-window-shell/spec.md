## ADDED Requirements

### Requirement: Primary status bar logo controls the tray quick panel
The system SHALL keep the primary ZTool status bar logo as the app-shell entry point that toggles the tray quick panel.

#### Scenario: Primary logo opens tray quick panel
- **WHEN** the user clicks the primary ZTool status bar logo while the tray quick panel is hidden
- **THEN** the system positions, shows, and focuses the tray quick panel

#### Scenario: Primary logo hides tray quick panel
- **WHEN** the user clicks the primary ZTool status bar logo while the tray quick panel is visible
- **THEN** the system hides the tray quick panel

#### Scenario: Plugin item does not accidentally toggle tray
- **WHEN** the user clicks a plugin status bar item with a direct plugin action
- **THEN** the system runs that plugin action without also toggling the tray quick panel

#### Scenario: Primary logo remains recoverable
- **WHEN** plugin status bar items are disabled or hidden
- **THEN** the primary ZTool status bar logo remains available so the user can open the tray quick panel and preferences

### Requirement: App-shell surfaces expose status bar preferences
The system SHALL make status bar display controls reachable from the existing preferences surface without replacing the tray, main, preferences, or about surfaces.

#### Scenario: Open preferences for status bar controls
- **WHEN** the user opens preferences from the tray quick panel or standalone main window
- **THEN** the preferences surface includes controls for status bar plugin item display and preview

#### Scenario: Existing surfaces stay routed by label
- **WHEN** status bar display controls are added
- **THEN** React still routes tray, main, preferences, about, capture, and pin-* window labels to their existing top-level surfaces

#### Scenario: Existing bottom tray actions remain usable
- **WHEN** plugin status bar items are visible
- **THEN** the tray quick panel still provides preferences, open ZTool, more/about, and exit actions
