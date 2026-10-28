## MODIFIED Requirements

### Requirement: Duration presets are selectable when enabling caffeine mode
The system SHALL preserve no time limit and all supported finite duration presets: 5 minutes, 10 minutes, 15 minutes, 30 minutes, 1 hour, 2 hours, or 5 hours. It SHALL additionally accept explicitly confirmed custom schedules of 1 through 1440 integer minutes or a future absolute end time. The legacy preset command MUST retain its preset-only validation; invalid custom input MUST leave the current state unchanged.

#### Scenario: Enable no-limit caffeine mode
- **WHEN** the user selects the no-limit option and enables caffeine mode
- **THEN** the system enables caffeine mode without an expiry timestamp

#### Scenario: Enable finite caffeine mode
- **WHEN** the user selects the 10 minute option and enables caffeine mode
- **THEN** the system enables caffeine mode with a duration of 10 minutes and an expiry timestamp calculated by the backend

#### Scenario: Reject unsupported finite duration
- **WHEN** the legacy preset command requests a finite duration that is not one of the supported presets
- **THEN** the system MUST reject the request and leave the current caffeine state unchanged

#### Scenario: Enable a valid custom duration
- **WHEN** the user confirms a custom schedule of 45 minutes
- **THEN** the system enables caffeine mode for 45 minutes without requiring that value to be a preset

#### Scenario: Enable an absolute end time
- **WHEN** the user confirms a previewed future end time
- **THEN** the system enables caffeine mode with that fixed absolute deadline

#### Scenario: Reject invalid custom schedule
- **WHEN** a custom request contains zero, a fraction, an excessive duration, an expired timestamp, or an out-of-range timestamp
- **THEN** the system rejects the request and leaves the current caffeine state unchanged

### Requirement: Finite caffeine sessions expire automatically
The system SHALL automatically disable its native keep-awake request when a finite session reaches its authoritative expiry, including while all Awake interfaces are hidden. Duration sessions SHALL expire after their requested actual elapsed time; until sessions SHALL expire at the confirmed absolute deadline. Expiry MUST restore normal system energy rules without forcing sleep or handing off to an automatic keep-awake mode.

#### Scenario: Finite session reaches expiry
- **WHEN** caffeine mode is enabled for 5 minutes and the expiry time is reached
- **THEN** the system disables the native keep-awake behavior and reports caffeine mode as inactive

#### Scenario: No-limit session stays active
- **WHEN** caffeine mode is enabled with no time limit
- **THEN** the system MUST NOT schedule a duration-based automatic shutdown

#### Scenario: Manual disable before expiry
- **WHEN** caffeine mode is enabled for a finite duration and the user disables it before expiry
- **THEN** the system disables the native keep-awake behavior and ignores the pending expiry for that session

#### Scenario: Expire a hidden custom session
- **WHEN** all Awake interfaces are hidden and a custom duration or until session reaches expiry
- **THEN** the native keep-awake request stops without requiring the interface to reopen

### Requirement: Duration changes replace the active session
The system SHALL allow users to replace an active session with another preset or explicitly confirmed custom schedule. A new duration SHALL be measured from successful replacement; a new until session SHALL use its confirmed deadline. Replacing with no limit SHALL cancel any finite expiry. Older timers MUST NOT disable the replacement session.

#### Scenario: Switch from finite duration to another finite duration
- **WHEN** caffeine mode is enabled for 5 minutes and the user switches to 1 hour
- **THEN** the system recalculates the expiry timestamp from the switch time and keeps caffeine mode active

#### Scenario: Switch from finite duration to no limit
- **WHEN** caffeine mode is enabled for 30 minutes and the user switches to no limit
- **THEN** the system removes the expiry timestamp and prevents the previous finite timer from disabling the new no-limit session

#### Scenario: Stale timer wakes after duration switch
- **WHEN** an old finite session timer wakes after the user has switched to a newer session
- **THEN** the old timer MUST NOT disable the newer caffeine session

#### Scenario: Replace until with a custom duration
- **WHEN** an until session is running and the user confirms a custom duration of 45 minutes
- **THEN** the new expiry is measured from successful application and the former until task cannot stop it

#### Scenario: Replace a duration with until
- **WHEN** a duration session is running and the user confirms a future absolute end time
- **THEN** that deadline becomes authoritative and the former duration task cannot stop it

### Requirement: Caffeine status exposes duration and remaining time data
The system SHALL expose an authoritative snapshot distinguishing inactive, unlimited, duration and until states, including remaining time for finite sessions. Existing preset metadata SHALL remain available. Custom duration metadata MUST accept any supported integer minute value; until mode MUST NOT be confused with unlimited mode when duration minutes are absent. Remaining duration time MUST NOT depend on a mutable wall clock in the frontend.

#### Scenario: Snapshot for inactive caffeine mode
- **WHEN** caffeine mode is inactive
- **THEN** the snapshot reports enabled as false and includes no started time, duration, or expiry timestamp

#### Scenario: Snapshot for no-limit caffeine mode
- **WHEN** caffeine mode is active with no time limit
- **THEN** the snapshot reports enabled as true, includes a started time, and includes no duration or expiry timestamp

#### Scenario: Snapshot for finite caffeine mode
- **WHEN** caffeine mode is active for 2 hours
- **THEN** the snapshot reports enabled as true, includes a started time, duration of 120 minutes, and an expiry timestamp

#### Scenario: Snapshot for custom duration
- **WHEN** caffeine mode is active for a custom 45 minute duration
- **THEN** the snapshot identifies duration mode and reports 45 minutes and authoritative remaining time

#### Scenario: Snapshot for until
- **WHEN** caffeine mode is active until a confirmed end time
- **THEN** the snapshot identifies until mode, exposes its fixed deadline and remaining time, and does not report it as unlimited

### Requirement: Frontend presents duration controls and time feedback
The system SHALL preserve compact preset controls and elapsed/remaining feedback while adding a custom entry. Active custom duration values SHALL display their actual duration rather than falling back to no limit. Until sessions SHALL display the actual end date and local time. Preset checkmarks MUST reflect only matching active duration presets, and remaining time MUST NOT be duplicated.

#### Scenario: Caffeine mode is inactive
- **WHEN** the caffeine panel is shown while caffeine mode is inactive
- **THEN** the panel displays duration choices and an enable action

#### Scenario: Finite caffeine mode is active
- **WHEN** caffeine mode is active with a finite duration
- **THEN** the panel displays the selected duration, elapsed time, remaining time, and a disable action

#### Scenario: No-limit caffeine mode is active
- **WHEN** caffeine mode is active with no time limit
- **THEN** the panel displays no-limit status, elapsed time, and a disable action

#### Scenario: Present custom duration without false preset selection
- **WHEN** a custom 45 minute session is active
- **THEN** the panel displays 45 minutes and no nonmatching preset or no-limit choice is marked as the active schedule

#### Scenario: Present until after a time-zone change
- **WHEN** the time zone changes during an until session
- **THEN** the end-time label is reformatted for the new local date and time without changing the underlying deadline

## ADDED Requirements

### Requirement: Duration and until sessions preserve their distinct time semantics
The system SHALL measure duration using actual elapsed time independently of wall-clock adjustment, including system suspension. An until session SHALL retain the absolute deadline confirmed by the user; wall-clock changes MUST trigger an authoritative expiry recheck within a bounded interval while the system is running, and time-zone changes MUST affect only presentation. Resume MUST promptly recheck both modes before presenting an expired session as still valid.

#### Scenario: Adjust the wall clock during a duration
- **WHEN** the user changes the system clock forward or backward during a 45 minute duration
- **THEN** the requested actual elapsed interval remains 45 minutes

#### Scenario: Move the wall clock past an until deadline
- **WHEN** the system clock advances past the confirmed until deadline
- **THEN** the system stops its keep-awake request within the bounded native recheck interval without waiting for the original delay

#### Scenario: Move the wall clock backward before an until deadline
- **WHEN** the system clock moves backward before the confirmed until deadline
- **THEN** the deadline remains fixed and the system does not expire merely because the original monotonic wait completes

#### Scenario: Change the time zone
- **WHEN** the time zone changes while a finite session is active
- **THEN** neither the requested elapsed duration nor the confirmed absolute deadline is extended

#### Scenario: Resume after expiry
- **WHEN** the system resumes after the elapsed duration or absolute deadline has already been reached
- **THEN** the native keep-awake request is ended promptly and the next authoritative snapshot reports the inactive state
