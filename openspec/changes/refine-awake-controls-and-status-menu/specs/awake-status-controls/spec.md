## Purpose

Provide quickly distinguishable Awake state icons, direct native duration selection, a reliable stop-and-hide exit action, and consistent session feedback across Zero's status bar and Awake panels.

## ADDED Requirements

### Requirement: Awake icons distinguish inactive and active states
The system SHALL use an empty cup outline for inactive Awake and a prominently filled cup body for active Awake, retaining the same cup silhouette, handle, saucer, status-item bounds, and click target. The states SHALL remain distinguishable in monochrome at 16 through 24 pixels on light and dark backgrounds without relying on color, animation, or a single thin liquid-level line.

#### Scenario: Awake is inactive
- **WHEN** authoritative state reports Awake inactive
- **THEN** its visible status icon renders the empty cup outline

#### Scenario: Awake is active
- **WHEN** authoritative state reports Awake active with any supported duration
- **THEN** its visible status icon renders the filled cup body with recognizable cup, handle, and saucer

#### Scenario: State changes in the grouped status item
- **WHEN** Awake starts, stops, or expires
- **THEN** its icon updates without moving its own or neighboring click targets or using a different tool identity

### Requirement: Awake right-click menu offers all duration presets
On macOS the system SHALL show an Awake-specific native right-click menu containing no limit, 5 minutes, 10 minutes, 15 minutes, 30 minutes, 1 hour, 2 hours, and 5 hours in that order, followed by separated Exit Awake and existing Quit Zero Status Bar actions. Labels SHALL follow Zero's resolved language preference. The menu SHALL mark only the active session's duration as checked and SHALL NOT treat opening the menu as a left-click toggle.

#### Scenario: Right-click active Awake
- **WHEN** the user right-clicks the visible Awake cell during a 10 minute session
- **THEN** the localized Awake menu appears with 10 minutes checked and both exit actions following the preset list
- **AND** the session is not toggled merely by opening the menu

#### Scenario: Right-click inactive Awake
- **WHEN** the user right-clicks Awake while inactive
- **THEN** the same presets and exit actions appear without an active-session checkmark

#### Scenario: Right-click another status cell
- **WHEN** the user right-clicks the primary Zero cell or another tool
- **THEN** that cell retains its existing menu and does not receive Awake-only preset or exit actions

### Requirement: Menu duration selection starts or replaces an authoritative session
Selecting a duration from Awake's native menu SHALL immediately start Awake with that duration when inactive, or replace current session timing from the selection time when active. It SHALL preserve native platform behavior, reject unsupported or unavailable actions, and prevent stale deadlines from stopping a newer session. Existing left-click toggle behavior SHALL remain compatible.

#### Scenario: Start a timed session from the menu
- **WHEN** inactive Awake receives the menu's 5 minute action
- **THEN** native keep-awake starts with a backend-calculated five-minute deadline and the icon, reopened menu, and visible panels show that session

#### Scenario: Replace a running finite session
- **WHEN** the user selects 1 hour during a 10 minute session
- **THEN** the backend starts the replacement timing from the selection time and the old deadline cannot stop that replacement

#### Scenario: Switch to no limit
- **WHEN** the user selects no limit during a finite session
- **THEN** the session remains active without an expiry and its old finite timer cannot disable it

#### Scenario: Existing left-click behavior
- **WHEN** the user left-clicks the visible Awake cell
- **THEN** an active session stops or inactive Awake starts with the existing default no-limit behavior without opening the duration menu

#### Scenario: Invalid or stale action cannot start Awake
- **WHEN** a requested duration is unsupported or Awake became unavailable after the menu opened
- **THEN** the system rejects the start request, preserves the actual current session, and exposes actionable error feedback without falsely showing success

### Requirement: Exit Awake stops the function before hiding its entry
Exit Awake SHALL stop native keep-awake, clear current session timing, invalidate pending expiry work, and then persistently hide only Awake's status-bar entry. It SHALL leave Zero, other tools, and the Awake main-panel entry available. A normal disable action SHALL stop the session while retaining the status-bar entry. Quit Zero Status Bar SHALL retain its existing whole-application quit semantics.

#### Scenario: Exit a running Awake session
- **WHEN** the user selects Exit Awake during a finite or no-limit session
- **THEN** native keep-awake stops, the session becomes inactive, pending timers cannot affect a later session, and the Awake status entry is hidden persistently
- **AND** Zero and other tools continue running while open Awake panels show inactive state

#### Scenario: Exit inactive Awake
- **WHEN** the user selects Exit Awake while it is already inactive
- **THEN** the Awake status entry is hidden without enabling a session or quitting Zero

#### Scenario: Native shutdown fails
- **WHEN** stopping native keep-awake fails during Exit Awake
- **THEN** the system preserves the visible entry, exposes its actual session state and a localized failure, and does not report exit success

#### Scenario: Visibility persistence fails after shutdown
- **WHEN** native shutdown succeeds but hiding the entry cannot be persisted
- **THEN** the session remains inactive, the previous visibility setting is preserved, and the user is informed that Awake stopped but hiding failed
- **AND** the system does not restart keep-awake as a rollback

#### Scenario: Stop through the panel
- **WHEN** the user selects Disable caffeine in an Awake panel
- **THEN** the session stops and the Awake status entry remains visible according to its existing visibility preference

#### Scenario: Quit all of Zero
- **WHEN** the user selects the existing Quit Zero Status Bar action
- **THEN** Zero follows its existing application shutdown and resource cleanup behavior

### Requirement: Awake exit is recoverable without automatic reactivation
The existing status-bar settings SHALL allow the user to restore Awake's hidden entry without enabling native keep-awake. Exiting Awake SHALL NOT uninstall or globally disable the plugin, discard other tools' visibility settings, or automatically restore the previous session on restart.

#### Scenario: Restore Awake from settings
- **WHEN** the user restores Awake's status-bar visibility after Exit Awake
- **THEN** the inactive Awake entry reappears and a new session begins only after an explicit enable action

#### Scenario: Reopen main panel after exit
- **WHEN** the user opens Awake from main after Exit Awake
- **THEN** the panel remains available and can explicitly start a new session without silently changing its status-bar visibility preference

#### Scenario: Restart after exiting Awake
- **WHEN** Zero restarts after Exit Awake was saved successfully
- **THEN** Awake's entry remains hidden and no prior keep-awake session is resumed

### Requirement: Awake feedback stays consistent across surfaces
Authoritative session changes from a menu, left click, panel, exit, or automatic expiry SHALL update status icons and visible Awake panels without requiring the user to close and reopen a panel. Reopening a hidden panel SHALL read fresh state before resuming timing; hidden panels SHALL NOT run presentation clocks or own expiry. Native action failures SHALL produce user-visible localized feedback, and late asynchronous responses SHALL NOT overwrite newer confirmed state.

#### Scenario: Menu changes while panels are open
- **WHEN** the native menu starts or changes a session while tray or main Awake panels are visible
- **THEN** those panels update state, current duration, selected preset, timing, and primary action from the authoritative session

#### Scenario: Deadline arrives while all panels are hidden
- **WHEN** a finite session expires while no Awake panel is visible
- **THEN** native keep-awake stops and the status icon becomes inactive without any frontend clock
- **AND** the next visible panel reads inactive state before resuming presentation

#### Scenario: Native action fails with no panel visible
- **WHEN** a native Awake action fails while all Awake panels are hidden
- **THEN** Zero presents localized failure feedback through a visible Awake or host feedback surface instead of silently discarding the error

#### Scenario: Fast successive actions complete out of order
- **WHEN** the user rapidly changes presets or exits Awake while earlier refresh requests are pending
- **THEN** the displayed final state matches the latest authoritative transition and an old response or expiry cannot restore or disable the wrong session

### Requirement: Fallback platforms preserve Awake controls
Platforms using one primary tray icon SHALL retain Awake's shared panel and approved fallback actions without requiring macOS status-item geometry or exposing Awake's native menu on unrelated icons. Existing unsupported-platform failures SHALL remain explicit.

#### Scenario: Windows user selects a duration
- **WHEN** a Windows user enables Awake with a supported duration through the shared panel
- **THEN** the existing Windows native mechanism and backend-owned expiry are used with the same compact state feedback

#### Scenario: Unsupported platform requests Awake
- **WHEN** a user requests keep-awake on an unsupported platform
- **THEN** the system reports the platform error without falsely rendering an active cup or active session
