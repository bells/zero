## Purpose

Protect Awake sessions from battery drain through user-selected battery thresholds and system low-power-mode rules, with explicit power-source exemptions, session-local manual overrides and truthful status when protection is unavailable.

## ADDED Requirements

### Requirement: Battery protection is configured in Awake preferences
The system SHALL provide two independent battery protection switches in Preferences under Zero Awake: stop at or below a battery percentage, and stop in system low power mode. Both MUST default to off. The threshold SHALL default to 10 percent and accept values from 10 through 90 in increments of 5. These controls MUST NOT be added to the session main page or tray panel.

#### Scenario: First use
- **WHEN** no battery policy has been saved and the device supports both rules
- **THEN** both switches are off and the threshold is 10 percent

#### Scenario: Configure threshold
- **WHEN** the user enables threshold protection and selects 25 percent in Awake preferences
- **THEN** the saved policy uses 25 percent and clearly displays that value

#### Scenario: Reject unsupported threshold
- **WHEN** a policy update contains a threshold outside 10 through 90 or not divisible by 5
- **THEN** the update is rejected without changing the saved or effective policy

#### Scenario: Discover battery settings
- **WHEN** the user searches preferences for battery or low power mode in Chinese or English
- **THEN** the relevant Awake settings can be reached and focused without adding policy controls to the session interface

### Requirement: Both protections apply only on battery power
Both battery rules SHALL apply only when the device is known to be powered by its battery. A known external power source SHALL exempt both rules regardless of whether the battery is actually charging. Disconnecting external power MUST promptly reevaluate the current session without creating a manual override.

#### Scenario: External power without charging
- **WHEN** the device is connected to external power but charging is paused at a charge limit
- **THEN** neither battery rule terminates or blocks an Awake session

#### Scenario: Disconnect below threshold
- **WHEN** a session started on external power without an override, threshold protection is enabled, and the device switches to battery power at or below the threshold
- **THEN** the session stops because of low battery

#### Scenario: No battery installed
- **WHEN** the device has no supported battery
- **THEN** the relevant battery controls are unavailable with an explanation and do not interfere with normal Awake operation

### Requirement: A deliberate low-battery start can override only the threshold
A successful manual start or confirmed replacement SHALL grant a session-local threshold override if threshold protection is enabled and applicable and the known battery level is already at or below the threshold. The interface MUST disclose the override. It MUST NOT bypass low power mode protection, be granted by a settings or power-source event, or survive the session ending.

#### Scenario: Start while already low
- **WHEN** a user manually starts Awake on battery power at 10 percent with a 10 percent threshold and no active low power mode restriction
- **THEN** the session starts with a visible threshold override and later battery changes do not trigger that threshold rule for this session

#### Scenario: Reach the exact threshold during an ordinary session
- **WHEN** a session started above its threshold without an override and the battery reaches exactly the configured threshold
- **THEN** threshold protection stops the session

#### Scenario: Keep override for the current session
- **WHEN** an overridden session continues through battery recovery, external power connection or policy changes
- **THEN** its threshold override remains scoped to that session and does not suppress low power mode protection

#### Scenario: Clear override at session end
- **WHEN** the overridden session ends and another session is started later
- **THEN** the earlier override does not carry over and the new manual request is evaluated against current conditions

### Requirement: Low power mode protection is checked before start and during a session
When enabled and applicable, low power mode protection SHALL reject a new Awake session if system low power mode is already active and SHALL stop an existing session when the mode becomes active. A threshold override MUST NOT bypass this rule. The system MUST explain the refusal or stop and MUST NOT change the system's low power mode setting.

#### Scenario: Start with low power mode already active
- **WHEN** a user attempts to start or replace an Awake session on battery power while the enabled low power mode rule matches
- **THEN** the new session request is refused with the reason and no new native keep-awake request is created

#### Scenario: Enable low power mode during a session
- **WHEN** system low power mode becomes active on battery power during a session with this protection enabled
- **THEN** the session stops even if it has a threshold override

### Requirement: Saved policy changes are evaluated without unconditional interruption
After a policy update is successfully saved, the system SHALL immediately reevaluate an active session and stop it only if the newly effective rules match. An existing session threshold override SHALL be preserved, and policy edits MUST NOT grant an override. A failed save MUST retain the former policy and report failure without applying the unsaved draft.

#### Scenario: Raise threshold above current charge
- **WHEN** a session without an override is on battery power at 20 percent and the user successfully changes its enabled threshold to 25 percent
- **THEN** the session stops after the new policy becomes effective

#### Scenario: Change policy without matching a stopping rule
- **WHEN** the user lowers the threshold below current battery charge or disables a rule and no effective rule matches
- **THEN** the active session continues without resetting its timing

#### Scenario: Change threshold for an overridden session
- **WHEN** the user changes the threshold during a session with a threshold override
- **THEN** that override remains effective and the threshold edit alone does not terminate the session

#### Scenario: Policy save fails
- **WHEN** saving a policy change fails
- **THEN** the previous policy remains effective and the preferences page reports that the change was not saved

### Requirement: Protective stops terminate the session without automatic recovery
A protective stop SHALL release only Zero's native keep-awake request, cancel session timing and clear its override, without forcing system sleep. The authoritative state SHALL expose the stop reason after the session ends, and the main and tray interfaces SHALL show it. Power recovery, policy disabling and low power mode exit MUST NOT resume an ended session or clear its protective stop reason.

#### Scenario: Stop a timed session for low battery
- **WHEN** an unoverridden duration or until session matches the enabled threshold rule
- **THEN** the native request and pending timer are stopped and the interface reports low battery as the reason

#### Scenario: Remain stopped after recovery
- **WHEN** a session ended for battery protection and the user connects external power, recovers charge or exits low power mode
- **THEN** the session remains ended and its last protective stop reason remains available

#### Scenario: Fail to stop the native request
- **WHEN** a protection action fails to release the native keep-awake request
- **THEN** the system reports the actual active state and an actionable error rather than claiming a successful protective stop

#### Scenario: Race with expiry or a replacement
- **WHEN** a battery event races with expiry or a newer manually confirmed session
- **THEN** an already ended generation cannot stop the newer session, repeat termination or overwrite its authoritative state

### Requirement: Unknown or unsupported power state is represented honestly
The system SHALL distinguish no battery, unsupported capability and temporary read failure. Unsupported controls MUST be unavailable with an explanation. Temporary read failure MUST NOT be treated as normal power state, zero battery or a reason to stop an active session; protection unavailability SHALL be visible and reads SHALL be retried with bounded resource use. Recovery MUST reevaluate the policy without retroactively granting a manual threshold override.

#### Scenario: Read fails while Awake is running
- **WHEN** an enabled protection cannot temporarily determine the required battery or mode state
- **THEN** the current session is not stopped solely because of the read failure, the interface reports protection temporarily unavailable, and the system retries

#### Scenario: Read fails during a manual start
- **WHEN** a manual start otherwise succeeds but the necessary power state cannot be determined within the read timeout
- **THEN** the session is not falsely described as protected, the unavailable state is visible, and no threshold override is granted from unknown data

#### Scenario: Recover a low battery reading
- **WHEN** valid readings return and an active unoverridden session now matches a protection rule
- **THEN** the session stops according to that rule without treating data recovery as a manual start

#### Scenario: Unsupported system mode capability
- **WHEN** the platform cannot report the required system low power mode state
- **THEN** that rule is shown as unsupported rather than reported as a known inactive mode

### Requirement: Protection remains effective independently of visible interfaces
The system SHALL evaluate battery protection for all active session types even when the main window, preferences and tray panel are hidden. Plugin disable, Awake exit and application exit MUST release monitoring resources and pending actions; inactive sessions MUST NOT retain unnecessary background polling. Input-memory and policy updates MUST preserve each other's saved fields, and restarting MUST restore policy values without restoring a session or override.

#### Scenario: All interfaces hidden
- **WHEN** an enabled battery rule becomes applicable while an unlimited, preset, custom-duration or until session runs with all interfaces hidden
- **THEN** the native session is stopped and later interface reads show its authoritative stop reason

#### Scenario: Disable or quit Awake
- **WHEN** Awake is disabled or exited during monitoring
- **THEN** owned monitoring and pending protection actions are cancelled and cannot affect a future session

#### Scenario: Preserve other saved Awake preferences
- **WHEN** the user updates battery protection and later confirms a custom input, or performs those actions in the reverse order
- **THEN** each update preserves the other settings and unrelated plugins' preferences

#### Scenario: Restart with saved protection
- **WHEN** Zero restarts after a protected or overridden session
- **THEN** the saved battery policy is restored while Awake remains inactive with no restored override
