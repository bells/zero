## ADDED Requirements

### Requirement: Tray quick panel dismisses on external focus loss
The system SHALL hide the tray quick panel when the user clicks another application, another window, or the desktop, without changing selected tools, disabling plugins, exiting Zero, or cancelling accepted background work. A stale focus-loss event SHALL NOT hide a newly reopened or refocused panel.

#### Scenario: Click outside the tray
- **WHEN** the tray quick panel is visible and focused and the user clicks an external window or the desktop
- **THEN** the quick panel hides promptly and the external target retains focus

#### Scenario: Repeated primary click closes the panel
- **WHEN** the tray is visible and the user clicks the primary Ø cell again
- **THEN** the panel ends hidden and is not reopened by a focus-loss/toggle race

#### Scenario: Reopen before an old dismissal completes
- **WHEN** an earlier focus-loss dismissal is pending and the user opens or refocuses the tray again
- **THEN** the old dismissal does not hide the newly active panel

#### Scenario: Internal navigation is used
- **WHEN** the user selects a tool or operates tray controls without transferring focus outside the panel
- **THEN** the panel remains available and the operation proceeds normally

#### Scenario: Background conversion continues
- **WHEN** the user dismisses the tray after native conversion work has been accepted
- **THEN** the work continues and its state is available when the user reopens the tool

### Requirement: Tray dismissal respects native dialogs and local Escape handling
The system SHALL avoid hiding the tray solely because one of its authorized native dialogs temporarily takes focus. Dialog success, cancellation, and errors SHALL restore normal dismissal behavior without indefinitely pinning the tray or forcibly stealing another application's focus. Escape SHALL dismiss the innermost open tray menu first and hide the tray when no local layer or native modal consumes it.

#### Scenario: File picker takes focus
- **WHEN** the user opens an authorized file picker from a tray tool
- **THEN** temporary dialog focus does not prematurely hide the tray or discard the initiating tool context

#### Scenario: Dialog closes normally or with an error
- **WHEN** a tray-owned native dialog completes, is cancelled, or fails
- **THEN** its temporary dismissal exemption is released and subsequent external focus loss hides the tray normally

#### Scenario: Another app becomes active during a dialog
- **WHEN** another application becomes active while a tray-owned dialog is open and the dialog later closes
- **THEN** Zero does not force the tray to regain focus and does not leave it indefinitely visible because of the completed dialog

#### Scenario: Escape closes the more menu
- **WHEN** the tray's more menu is open and the user presses Escape
- **THEN** the menu closes before the tray panel is dismissed

#### Scenario: Escape hides the tray
- **WHEN** the tray is focused, no inner popup or native modal consumes Escape, and the user presses Escape
- **THEN** the tray hides without changing tool selection or quitting the app

### Requirement: Tray handoff does not leave overlapping transient surfaces
The system SHALL hide the tray when the user opens main, the settings view within main, about, or an existing dedicated tool surface. Opening tray SHALL hide peer transient tool surfaces without hiding persistent main, pinned results, or the isolated document engine.

#### Scenario: Open a persistent shell surface
- **WHEN** the user opens main, preferences, or about from the tray
- **THEN** the host window opens or focuses with the requested surface, and the tray hides without losing the selected plugin context

#### Scenario: Switch between transient tool entry points
- **WHEN** a user switches between tray and an existing Paper, Launch, or Snap transient surface
- **THEN** only the requested transient surface remains visible and unrelated persistent windows remain unaffected

### Requirement: Workspace presents one visible tool title and real status
The system SHALL avoid displaying a second host-generated plugin title above a plugin panel that already supplies its own title. The workspace SHALL retain an accessible name, a clear visible tool identity, useful actions, and actual capability/job/error information. Descriptive marketing copy SHALL NOT be presented as a success state.

#### Scenario: Zero File is selected in main
- **WHEN** the user selects Zero File in the standalone main window
- **THEN** its working area displays one Zero File title, meaningful format/provider/queue information, and the file input/action controls without an extra host title or LOCAL / SESSION label

#### Scenario: Another bundled tool is selected
- **WHEN** the user selects any other bundled tool
- **THEN** the working area retains its identity and existing interactions without a duplicate host-generated heading

#### Scenario: Generic extension or panel fallback is shown
- **WHEN** a generic plugin, loading state, unavailable state, or empty collection is displayed
- **THEN** the host supplies an appropriate localized visible identity or state description without adding a duplicate title to an extension-owned surface

### Requirement: Navigation and work content have independent bounded layout
The system SHALL keep navigation, current plugin content, and system actions visually distinct, avoid redundant nested workspace panels, and allow content to scroll within available window bounds without making navigation growth consume the working area.

#### Scenario: Tray content exceeds available height
- **WHEN** the selected tray plugin has more content than the remaining panel height
- **THEN** its content can scroll while the one-row navigation and preferences/open Zero/more actions remain reachable

#### Scenario: File queue in a short main window
- **WHEN** Zero File has a populated queue or error content in a short main window
- **THEN** the user can reach task state, error details, and conversion/cancellation actions without sidebar growth pushing the workspace outside the window

## MODIFIED Requirements

### Requirement: Tray quick panel exposes stable bottom actions
The system SHALL present a compact tray quick panel with a bottom action area containing preferences, open Zero, and more actions.

#### Scenario: Open preferences from tray
- **WHEN** the user activates the left preferences action in the tray quick panel bottom area
- **THEN** the system opens or focuses main in its settings view without creating a separate preferences window

#### Scenario: Open standalone ZTool from tray
- **WHEN** the user activates the center open ZTool action in the tray quick panel bottom area
- **THEN** the system opens or focuses the standalone main Zero window in its tools view

#### Scenario: Open more actions from tray
- **WHEN** the user activates the right more action in the tray quick panel bottom area
- **THEN** the system presents actions for about Zero and exiting the status bar app

### Requirement: Standalone main window hosts the plugin home
The system SHALL provide a standalone main Zero window separate from the tray quick panel, with a tools view hosting plugin navigation and content and a settings view hosting preferences in that same window.

#### Scenario: Main window opens from tray
- **WHEN** the user selects open ZTool from the tray quick panel
- **THEN** the main window becomes visible and focused in its tools view without removing the tray quick panel capability

#### Scenario: Main window displays visible plugins
- **WHEN** the main window tools view is shown
- **THEN** it displays the plugins currently enabled by the user's tool visibility preferences

#### Scenario: Main window selects a plugin
- **WHEN** the user selects a plugin in the main window
- **THEN** the main window displays that plugin's primary content or summary without unintentionally switching to settings or opening about

### Requirement: Preferences and about are separate surfaces
The system SHALL expose preferences as a distinct settings view inside main and about Zero as a dedicated window, with neither embedded in the tray plugin panel. Normal preferences entry points SHALL NOT create a separate preferences window.

#### Scenario: Preferences opens as a dedicated surface
- **WHEN** the user opens preferences from the tray quick panel or main window
- **THEN** main displays its settings view with launch at login, language, and visible tools while retaining all existing settings destinations

#### Scenario: About opens as a dedicated surface
- **WHEN** the user opens about Zero from the tray quick panel or main window
- **THEN** the about surface displays app identity, version, runtime information, and plugin count

#### Scenario: Closing preferences preserves plugin context
- **WHEN** the user leaves the main settings view through return to tools
- **THEN** the tray retains its selected plugin context and main restores its previous valid plugin context without cancelling accepted background work

### Requirement: Tauri window labels and capabilities are explicit
The system SHALL define explicit Tauri window labels and capabilities for tray, main, about, capture, and pin windows and existing dedicated tool surfaces. Main SHALL host both tools and settings views. Any retained legacy preferences label SHALL redirect to main settings without presenting an independent settings window or broadening permissions.

#### Scenario: React routes by window label
- **WHEN** a Zero WebView starts with label tray, main, about, capture, or pin-*, or a retained legacy preferences label
- **THEN** React renders the matching top-level surface for the current labels; a retained legacy preferences label redirects to settings within main

#### Scenario: Capabilities include app shell windows
- **WHEN** a native command creates or focuses tray, main, about, capture, or pin-* windows, or a shell entry point requests preferences
- **THEN** the Tauri capabilities allow only the required target label and permissions; preferences requests target main and the isolated document engine retains its separate capability boundary

#### Scenario: Unknown label falls back safely
- **WHEN** React starts under an unexpected window label
- **THEN** the app renders a safe default app-shell surface rather than crashing

### Requirement: Native window actions are handled through the Tauri boundary
The system SHALL route native app-window actions through explicit Tauri commands or a typed frontend service over invoke. Settings navigation within an existing main view SHALL be handled by its frontend host; settings requests from outside main SHALL use the native boundary to show or focus main and reliably deliver the settings destination.

#### Scenario: Open main window command succeeds
- **WHEN** the frontend requests to open the main window
- **THEN** Rust creates or focuses the main window in its tools view and reports success

#### Scenario: Open window command fails
- **WHEN** Rust cannot create or focus a requested app-shell window
- **THEN** the command returns an error and the frontend can surface that failure to the initiating UI

#### Scenario: Quit action exits status bar app
- **WHEN** the user selects exit status bar from the more menu
- **THEN** the system invokes the existing quit behavior and exits the app
