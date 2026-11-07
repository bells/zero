## Purpose

Give Zero tray users more plugin workspace and a clear visual connection between each status-bar icon and the panel or native menu it opens.

## ADDED Requirements

### Requirement: Popover carets follow their actual triggering icons
The macOS Zero and Paper popovers SHALL display an attached top caret aimed at the center of their actual triggering status-bar cells. The caret SHALL follow the target when screen boundaries shift the panel horizontally.

#### Scenario: Open the primary panel or Paper
- **WHEN** the user opens Zero or Paper through its status-bar icon
- **THEN** the panel displays a connected top caret pointing at that icon

#### Scenario: Panel is constrained by a screen edge
- **WHEN** the target panel must shift horizontally to fit the current screen
- **THEN** its caret shifts within the panel to continue identifying the triggering icon

#### Scenario: Geometry cannot be resolved
- **WHEN** the triggering geometry is invalid or unavailable
- **THEN** the panel uses a safe centered placement and omits the caret

#### Scenario: A popover opens before its frontend listener is ready
- **WHEN** a popover is first created or reopened during frontend initialization
- **THEN** its frontend obtains the latest placement and older placement responses cannot overwrite it

### Requirement: Grouped context menus expand rightward from their own icons
Every macOS grouped status-bar icon SHALL open its native context menu below its own cell with its left edge aligned to that cell, adjusting left when the menu would exceed the screen's right boundary.

#### Scenario: Sufficient space to the right
- **WHEN** the user right-clicks any grouped icon with sufficient right-side space
- **THEN** its native menu opens below that icon and extends to the right

#### Scenario: Insufficient space to the right
- **WHEN** the menu would extend beyond the screen's right boundary
- **THEN** the menu shifts left to remain within that screen

### Requirement: Shared tray layout respects platform placement
The top system-action layout SHALL be available on macOS and Windows. Windows SHALL use its platform-native system tray menu placement.

#### Scenario: Open the tray panel on Windows
- **WHEN** a Windows user opens the Zero tray panel
- **THEN** the user can access the compact top system actions and the native tray context menu
