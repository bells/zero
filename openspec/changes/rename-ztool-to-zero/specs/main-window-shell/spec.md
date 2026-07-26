## MODIFIED Requirements

### Requirement: Tray quick panel exposes stable bottom actions
The system SHALL present a compact tray quick panel with a bottom action area containing preferences, open Zero, and more actions.

#### Scenario: Open preferences from tray
- **WHEN** the user activates the left preferences action in the tray quick panel bottom area
- **THEN** the system opens or focuses the dedicated preferences surface

#### Scenario: Open standalone Zero from tray
- **WHEN** the user activates the center open Zero action in the tray quick panel bottom area
- **THEN** the system opens or focuses the standalone main Zero window

#### Scenario: Open more actions from tray
- **WHEN** the user activates the right more action in the tray quick panel bottom area
- **THEN** the system presents actions for about Zero and exiting the status bar app

### Requirement: Standalone main window hosts the plugin home
The system SHALL provide a standalone main Zero window that is separate from the tray quick panel and can host plugin navigation, plugin summaries, and plugin detail content.

#### Scenario: Main window opens from tray
- **WHEN** the user selects open Zero from the tray quick panel
- **THEN** the main window becomes visible and focused without removing the tray quick panel capability

#### Scenario: Main window displays visible plugins
- **WHEN** the main window is shown
- **THEN** it displays the plugins currently enabled by the user's tool visibility preferences

#### Scenario: Main window selects a plugin
- **WHEN** the user selects a plugin in the main window
- **THEN** the main window displays that plugin's primary content or summary without navigating to preferences or about inline views

### Requirement: Preferences and about are separate surfaces
The system SHALL expose preferences and about Zero as dedicated surfaces rather than inline branches inside the tray plugin panel.

#### Scenario: Preferences opens as a dedicated surface
- **WHEN** the user opens preferences from the tray quick panel or main window
- **THEN** the preferences surface displays settings for launch at login, language, and visible tools

#### Scenario: About opens as a dedicated surface
- **WHEN** the user opens about Zero from the tray quick panel or main window
- **THEN** the about surface displays app identity, version, runtime information, and plugin count

#### Scenario: Closing preferences preserves plugin context
- **WHEN** the preferences surface is closed
- **THEN** the tray quick panel and main window retain their selected plugin context

### Requirement: Tauri window labels and capabilities are explicit
The system SHALL define explicit Tauri window labels and capabilities for tray, main, preferences, about, capture, and pin windows.

#### Scenario: React routes by window label
- **WHEN** a Zero WebView starts with label tray, main, preferences, about, capture, or pin-*
- **THEN** React renders the matching top-level surface for that label

#### Scenario: Capabilities include app shell windows
- **WHEN** a native command creates or focuses tray, main, preferences, about, capture, or pin-* windows
- **THEN** the Tauri capabilities allow the target window label and required permissions

#### Scenario: Unknown label falls back safely
- **WHEN** React starts under an unexpected window label
- **THEN** the app renders a safe default app-shell surface rather than crashing

### Requirement: Existing plugin behavior is preserved
The system SHALL preserve existing Zero Snap, Zero Awake, preferences, about, and quit behavior while renaming the app shell to Zero.

#### Scenario: Zero Snap shortcut still opens capture flow
- **WHEN** the user presses CommandOrControl+Shift+A
- **THEN** the system starts the existing screenshot capture flow for the current platform

#### Scenario: Zero Awake controls remain usable
- **WHEN** the user opens Zero Awake from the tray quick panel or standalone main window
- **THEN** the user can enable, disable, and view keep-awake status according to the existing caffeine behavior

#### Scenario: Tool visibility affects shell navigation
- **WHEN** the user changes visible tool preferences
- **THEN** the tray quick panel and standalone main window reflect the visible plugin list while ensuring at least one tool remains visible
