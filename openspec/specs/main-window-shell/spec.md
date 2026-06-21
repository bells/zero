## Purpose

Define ZTool's standalone main window, tray quick panel, dedicated preferences/about surfaces, and explicit Tauri app-shell window routing.

## Requirements

### Requirement: Tray quick panel exposes stable bottom actions
The system SHALL present a compact tray quick panel with a bottom action area containing preferences, open ZTool, and more actions.

#### Scenario: Open preferences from tray
- **WHEN** the user activates the left preferences action in the tray quick panel bottom area
- **THEN** the system opens or focuses the dedicated preferences surface

#### Scenario: Open standalone ZTool from tray
- **WHEN** the user activates the center open ZTool action in the tray quick panel bottom area
- **THEN** the system opens or focuses the standalone main ZTool window

#### Scenario: Open more actions from tray
- **WHEN** the user activates the right more action in the tray quick panel bottom area
- **THEN** the system presents actions for about ZTool and exiting the status bar app

### Requirement: Standalone main window hosts the plugin home
The system SHALL provide a standalone main ZTool window that is separate from the tray quick panel and can host plugin navigation, plugin summaries, and plugin detail content.

#### Scenario: Main window opens from tray
- **WHEN** the user selects open ZTool from the tray quick panel
- **THEN** the main window becomes visible and focused without removing the tray quick panel capability

#### Scenario: Main window displays visible plugins
- **WHEN** the main window is shown
- **THEN** it displays the plugins currently enabled by the user's tool visibility preferences

#### Scenario: Main window selects a plugin
- **WHEN** the user selects a plugin in the main window
- **THEN** the main window displays that plugin's primary content or summary without navigating to preferences or about inline views

### Requirement: Preferences and about are separate surfaces
The system SHALL expose preferences and about ZTool as dedicated surfaces rather than inline branches inside the tray plugin panel.

#### Scenario: Preferences opens as a dedicated surface
- **WHEN** the user opens preferences from the tray quick panel or main window
- **THEN** the preferences surface displays settings for launch at login, language, and visible tools

#### Scenario: About opens as a dedicated surface
- **WHEN** the user opens about ZTool from the tray quick panel or main window
- **THEN** the about surface displays app identity, version, runtime information, and plugin count

#### Scenario: Closing preferences preserves plugin context
- **WHEN** the preferences surface is closed
- **THEN** the tray quick panel and main window retain their selected plugin context

### Requirement: Tauri window labels and capabilities are explicit
The system SHALL define explicit Tauri window labels and capabilities for tray, main, preferences, about, capture, and pin windows.

#### Scenario: React routes by window label
- **WHEN** a ZTool WebView starts with label tray, main, preferences, about, capture, or pin-*
- **THEN** React renders the matching top-level surface for that label

#### Scenario: Capabilities include app shell windows
- **WHEN** a native command creates or focuses tray, main, preferences, about, capture, or pin-* windows
- **THEN** the Tauri capabilities allow the target window label and required permissions

#### Scenario: Unknown label falls back safely
- **WHEN** React starts under an unexpected window label
- **THEN** the app renders a safe default app-shell surface rather than crashing

### Requirement: Native window actions are handled through the Tauri boundary
The system SHALL route user-triggered app-window actions through explicit Tauri commands or a typed frontend service over invoke.

#### Scenario: Open main window command succeeds
- **WHEN** the frontend requests to open the main window
- **THEN** Rust creates or focuses the main window and reports success

#### Scenario: Open window command fails
- **WHEN** Rust cannot create or focus a requested app-shell window
- **THEN** the command returns an error and the frontend can surface that failure to the initiating UI

#### Scenario: Quit action exits status bar app
- **WHEN** the user selects exit status bar from the more menu
- **THEN** the system invokes the existing quit behavior and exits the app

### Requirement: Existing plugin behavior is preserved
The system SHALL preserve existing screenshot, caffeine, preferences, about, and quit behavior while introducing the standalone main shell.

#### Scenario: Screenshot shortcut still opens capture flow
- **WHEN** the user presses CommandOrControl+Shift+A
- **THEN** the system starts the existing screenshot capture flow for the current platform

#### Scenario: Caffeine controls remain usable
- **WHEN** the user opens the caffeine plugin from the tray quick panel or standalone main window
- **THEN** the user can enable, disable, and view caffeine status according to the existing caffeine behavior

#### Scenario: Tool visibility affects shell navigation
- **WHEN** the user changes visible tool preferences
- **THEN** the tray quick panel and standalone main window reflect the visible plugin list while ensuring at least one tool remains visible
