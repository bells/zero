## Purpose

Make Zero's bundled tools discoverable through desktop application search and route their activation to the existing host, while keeping platform shortcut hints and compact Launch presentation consistent.

## ADDED Requirements

### Requirement: Platform Launch shortcut and compact title
Zero SHALL register Option + Space on macOS and Ctrl + Alt + Space on Windows as the default Launch shortcut, display the registered accelerator consistently, and omit the redundant Launcher eyebrow. The shortcut SHALL toggle the floating Launch window: open it when hidden or absent, and hide it when visible without quitting Zero.

#### Scenario: Launch on macOS
- **WHEN** the enabled Launch tool receives Option + Space
- **THEN** Zero opens the existing Launch surface and displays the same shortcut in its panel

#### Scenario: Launch on Windows
- **WHEN** the enabled Launch tool receives Ctrl + Alt + Space
- **THEN** Zero opens Launch without claiming Alt + Space or Win + Space

#### Scenario: Press the same shortcut again
- **WHEN** the floating Launch window is visible and the user presses the Launch shortcut again
- **THEN** Zero hides only the floating Launch window and continues running

#### Scenario: Reopen after shortcut dismissal
- **WHEN** the user presses the Launch shortcut after hiding the floating window
- **THEN** Zero reuses and focuses the existing Launch window

### Requirement: Indexed bundled tool entries
Packaged Zero SHALL create user-level application entries named Zero Snap, Zero Awake, Zero Paper, Zero Launch, and Zero File in standard macOS/Windows application search locations, without overwriting unrelated files or following symlinks. Creation failures SHALL leave Zero usable.

#### Scenario: Search for Snap
- **WHEN** an application launcher has indexed the generated entries and a user searches snap
- **THEN** Zero Snap is an available application entry

#### Scenario: Existing unrelated entry
- **WHEN** a destination is not owned by Zero or is a symbolic link
- **THEN** Zero preserves it and reports an entry synchronization failure

### Requirement: Single host activation with retained tool destination
Tool entries SHALL launch or activate one Zero host and select their visible, enabled tool in the main window. Unknown targets SHALL be rejected; disabled/hidden tools SHALL not be enabled or run implicitly.

#### Scenario: Cold tool launch
- **WHEN** Zero File is opened before the main frontend is ready
- **THEN** the latest target survives frontend initialization and selects File once available

#### Scenario: Warm tool launch
- **WHEN** Zero is running and Zero Snap is opened
- **THEN** the existing main window selects Snap without a duplicate host process

#### Scenario: Disabled tool
- **WHEN** an entry targets a disabled or hidden tool
- **THEN** the main window opens without enabling or executing that tool

#### Scenario: Invalid target
- **WHEN** a tool activation names an arbitrary target or extra arguments
- **THEN** Zero rejects that activation without executing arbitrary content
