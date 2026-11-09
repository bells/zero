## Purpose

Give Zero users a compact, localized macOS application menu that opens existing product surfaces, respects focused editors and preserves tray-first background operation.

## ADDED Requirements

### Requirement: Localized platform-aware application menu
The host SHALL present Zero, Tools, Edit, Window and Help menus on macOS, following Zero's resolved Chinese or English language. Brand names SHALL remain unchanged. Windows SHALL retain its existing window navigation and tray entry points.

#### Scenario: Change application language
- **WHEN** the user changes Zero's language
- **THEN** the application menu labels update without restarting and retain native services and window/help integration

#### Scenario: Compact menu structure
- **WHEN** Zero is active on macOS
- **THEN** File and View actions are consolidated into Window, and Help offers the existing website and repository URLs

### Requirement: Existing product surfaces and available tools
The application menu SHALL reuse Zero's settings, About and main-window navigation. Tools SHALL list enabled, available tools for the current build and SHALL follow registry changes. Selecting a tool SHALL open its main-window page without changing saved tool visibility.

#### Scenario: Open settings and About
- **WHEN** the user selects settings or About, or presses Cmd+Comma for settings
- **THEN** the existing corresponding Zero interface is shown and focused

#### Scenario: Tool availability changes
- **WHEN** a tool is disabled, removed or unavailable
- **THEN** its menu entry disappears and an obsolete activation cannot start it

#### Scenario: Explicitly open a hidden tool
- **WHEN** a user selects an enabled tool hidden from ordinary navigation
- **THEN** its main-window page becomes accessible for the explicit request while saved visibility stays intact

### Requirement: Focused editing and window lifecycle
Editing actions SHALL operate on the focused editing context, including Snap's annotation history. Window actions SHALL target the current operable window. Closing a window with its red control or Cmd+W SHALL preserve background operation. Quit Zero and Cmd+Q SHALL use the unified application shutdown path.

#### Scenario: Undo text and annotations
- **WHEN** Undo or Redo is invoked
- **THEN** the focused text editor uses its text history, and a focused Snap canvas uses its annotation history with its existing busy/composition restrictions

#### Scenario: Close and reopen main
- **WHEN** the user closes main and opens it again through the menu or tray
- **THEN** Zero remains running, background tasks continue, and the main window can be reopened

#### Scenario: Quit the application
- **WHEN** the user chooses Quit Zero or Cmd+Q
- **THEN** the entire application exits through the existing cleanup flow
