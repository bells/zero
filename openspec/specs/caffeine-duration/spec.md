## Purpose

Define timed caffeine sessions, supported duration presets, remaining-time feedback, automatic expiry, and platform error behavior.

## Requirements

### Requirement: Duration presets are selectable when enabling caffeine mode
The system SHALL allow users to enable caffeine mode with either no time limit or one of the supported finite duration presets: 5 minutes, 10 minutes, 15 minutes, 30 minutes, 1 hour, 2 hours, or 5 hours.

#### Scenario: Enable no-limit caffeine mode
- **WHEN** the user selects the no-limit option and enables caffeine mode
- **THEN** the system enables caffeine mode without an expiry timestamp

#### Scenario: Enable finite caffeine mode
- **WHEN** the user selects the 10 minute option and enables caffeine mode
- **THEN** the system enables caffeine mode with a duration of 10 minutes and an expiry timestamp calculated by the backend

#### Scenario: Reject unsupported finite duration
- **WHEN** a command requests a finite duration that is not one of the supported presets
- **THEN** the system MUST reject the request and leave the current caffeine state unchanged

### Requirement: Finite caffeine sessions expire automatically
The system SHALL automatically disable caffeine mode when a finite session reaches its backend-calculated expiry time.

#### Scenario: Finite session reaches expiry
- **WHEN** caffeine mode is enabled for 5 minutes and the expiry time is reached
- **THEN** the system disables the native keep-awake behavior and reports caffeine mode as inactive

#### Scenario: No-limit session stays active
- **WHEN** caffeine mode is enabled with no time limit
- **THEN** the system MUST NOT schedule a duration-based automatic shutdown

#### Scenario: Manual disable before expiry
- **WHEN** caffeine mode is enabled for a finite duration and the user disables it before expiry
- **THEN** the system disables the native keep-awake behavior and ignores the pending expiry for that session

### Requirement: Duration changes replace the active session
The system SHALL allow users to change the caffeine duration while caffeine mode is already active, and the new duration SHALL replace the previous session timing.

#### Scenario: Switch from finite duration to another finite duration
- **WHEN** caffeine mode is enabled for 5 minutes and the user switches to 1 hour
- **THEN** the system recalculates the expiry timestamp from the switch time and keeps caffeine mode active

#### Scenario: Switch from finite duration to no limit
- **WHEN** caffeine mode is enabled for 30 minutes and the user switches to no limit
- **THEN** the system removes the expiry timestamp and prevents the previous finite timer from disabling the new no-limit session

#### Scenario: Stale timer wakes after duration switch
- **WHEN** an old finite session timer wakes after the user has switched to a newer session
- **THEN** the old timer MUST NOT disable the newer caffeine session

### Requirement: Caffeine status exposes duration and remaining time data
The system SHALL expose enough caffeine session data for the frontend to display whether caffeine mode is inactive, active with no time limit, or active with a finite duration.

#### Scenario: Snapshot for inactive caffeine mode
- **WHEN** caffeine mode is inactive
- **THEN** the snapshot reports enabled as false and includes no started time, duration, or expiry timestamp

#### Scenario: Snapshot for no-limit caffeine mode
- **WHEN** caffeine mode is active with no time limit
- **THEN** the snapshot reports enabled as true, includes a started time, and includes no duration or expiry timestamp

#### Scenario: Snapshot for finite caffeine mode
- **WHEN** caffeine mode is active for 2 hours
- **THEN** the snapshot reports enabled as true, includes a started time, duration of 120 minutes, and an expiry timestamp

### Requirement: Frontend presents duration controls and time feedback
The system SHALL present compact duration controls in the caffeine panel and show elapsed/remaining time feedback for the active session.

#### Scenario: Caffeine mode is inactive
- **WHEN** the caffeine panel is shown while caffeine mode is inactive
- **THEN** the panel displays duration choices and an enable action

#### Scenario: Finite caffeine mode is active
- **WHEN** caffeine mode is active with a finite duration
- **THEN** the panel displays the selected duration, elapsed time, remaining time, and a disable action

#### Scenario: No-limit caffeine mode is active
- **WHEN** caffeine mode is active with no time limit
- **THEN** the panel displays no-limit status, elapsed time, and a disable action

### Requirement: Platform support and error behavior are preserved
The system SHALL preserve the existing platform-specific keep-awake behavior while adding duration selection.

#### Scenario: Supported platform enables finite duration
- **WHEN** the user enables caffeine mode for 1 hour on a supported platform
- **THEN** the system applies the existing native keep-awake mechanism and tracks the requested duration

#### Scenario: Unsupported platform fails to enable
- **WHEN** the user enables caffeine mode with any duration on an unsupported platform
- **THEN** the system reports the platform error and leaves caffeine mode inactive
