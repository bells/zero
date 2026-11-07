## REMOVED Requirements

### Requirement: Tray quick panel exposes stable bottom actions
**Reason** The footer consumes plugin workspace and its actions are moving into the header.
**Migration** Use the header Preferences and About buttons, Open Zero at the right of the tool row, and the native context menu to quit.

## ADDED Requirements

### Requirement: Tray quick panel exposes compact top actions
The tray panel SHALL place Preferences and About icon buttons after its visible/total tool count. It SHALL place a separate Open Zero icon button at the right end of the tool navigation row. Buttons SHALL expose translated accessible names, hover hints and keyboard focus. The panel SHALL devote the recovered footer space to plugin content within its existing outer dimensions.

#### Scenario: Open preferences from tray
- **WHEN** the user activates the header Preferences icon
- **THEN** the main window opens its preferences view

#### Scenario: Open standalone ZTool from tray
- **WHEN** the user activates Open Zero at the right of the tool row
- **THEN** the system opens or focuses the standalone main Zero window

#### Scenario: Open more actions from tray
- **WHEN** the user needs About from the tray panel
- **THEN** the header About icon opens the dedicated About window directly

#### Scenario: Tool navigation exceeds available width
- **WHEN** tool entries exceed the tool row's available space
- **THEN** tools remain reachable through the existing scrolling navigation and Open Zero remains visible

## MODIFIED Requirements

### Requirement: Native window actions are handled through the Tauri boundary
The system SHALL route user-triggered app-window actions through explicit Tauri commands or a typed frontend service over invoke.

#### Scenario: Open main window command succeeds
- **WHEN** the frontend requests to open the main window
- **THEN** Rust creates or focuses the main window and reports success

#### Scenario: Open window command fails
- **WHEN** Rust cannot create or focus a requested app-shell window
- **THEN** the command returns an error and the frontend can surface that failure to the initiating UI

#### Scenario: Quit action exits status bar app
- **WHEN** the user selects exit status bar from the native context menu
- **THEN** the system invokes the existing quit behavior and exits the app
