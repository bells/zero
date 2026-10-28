## Purpose

Let users configure a one-off Awake session by a custom duration or a local end time, preview and confirm it without disturbing the current session, and reuse confirmed inputs without automatically resuming keep-awake behavior.

## ADDED Requirements

### Requirement: Custom editor supports duration and local end time
The system SHALL provide a custom editor with duration and until modes. Duration MUST accept integer totals from 1 through 1440 minutes using hours and minutes. Until MUST accept hours and minutes and resolve the next future occurrence using the local calendar, with an explicit actual end-date and remaining-time preview.

#### Scenario: Configure a custom duration
- **WHEN** the user enters 0 hours and 45 minutes
- **THEN** the editor previews a 45 minute session and allows confirmation

#### Scenario: Reject invalid duration
- **WHEN** the user enters zero total minutes, a fractional value, or a total exceeding 24 hours
- **THEN** confirmation is prevented with an actionable error and the active session remains unchanged

#### Scenario: Resolve a clock time across midnight
- **WHEN** the local time is 23:00 and the user selects 01:00
- **THEN** the editor previews tomorrow at 01:00 and the remaining two hours under an unchanged local time zone

#### Scenario: Resolve daylight saving time
- **WHEN** the target local clock time is repeated or skipped by a daylight saving transition
- **THEN** the system resolves the next valid occurrence, advances a nonexistent time to a valid local instant, and displays the actual resolved date and clock time before confirmation

### Requirement: Editing is isolated from the active session
The system SHALL keep custom drafts separate from the active session. Only explicit Start or Apply confirmation SHALL enable or replace a session; cancellation and navigation MUST NOT change native keep-awake behavior. Confirmation MUST apply the previewed target without silently rolling an expired preview into the following day.

#### Scenario: Cancel a draft
- **WHEN** the user changes either mode or input values and cancels
- **THEN** the existing running session or inactive state remains unchanged

#### Scenario: Confirm a replacement
- **WHEN** Awake is running and the user confirms a custom duration of 45 minutes
- **THEN** a new 45 minute session begins from successful application and replaces the previous expiry

#### Scenario: Preview expires while editing
- **WHEN** the previewed absolute end time is no longer future at confirmation
- **THEN** the system does not start that session, updates the preview, and requires another confirmation

#### Scenario: Apply fails
- **WHEN** applying a custom schedule fails
- **THEN** the editor shows an error and reports the authoritative session state without claiming that the draft is active

### Requirement: Custom scheduling is available through existing Awake surfaces
The tray panel and main window SHALL provide custom scheduling. The Awake native context menu SHALL provide a localized custom action that opens the main window on Awake with the editor expanded. This action MUST NOT enable Awake and MUST NOT appear in another tool's menu.

#### Scenario: Open from native menu
- **WHEN** the user chooses Custom from the Awake context menu while the main window is hidden or not mounted
- **THEN** the main window opens on Awake and expands the editor after the navigation target becomes available

#### Scenario: Repeated native navigation preserves editing
- **WHEN** the user invokes the native Custom action while an unsaved custom draft is already open
- **THEN** that draft remains available without changing the active session

#### Scenario: Operate the compact editor accessibly
- **WHEN** the editor is used in the default tray size in Chinese or English using the keyboard
- **THEN** the user can reach labeled inputs, preview, errors, confirmation and cancellation with visible focus and without clipped essential actions

### Requirement: Confirmed inputs persist without restoring a session
The system SHALL remember successfully confirmed custom inputs and the last mode, but MUST NOT persist an active session or an absolute historical deadline as a resume instruction. Cancelling a draft MUST NOT overwrite the remembered input. Restarting Zero MUST leave Awake inactive, and the status-bar primary enable action SHALL continue to start an unlimited session.

#### Scenario: Reopen custom duration
- **WHEN** the last successfully confirmed duration was 45 minutes and the user reopens the custom editor
- **THEN** 45 minutes is offered as a draft without starting a session

#### Scenario: Reopen custom until after its former deadline
- **WHEN** the user reopens a remembered local clock time after the old session has ended
- **THEN** the editor offers a newly resolved preview that requires confirmation and does not reuse the old absolute deadline or start automatically

#### Scenario: Restart and use the primary toggle
- **WHEN** Zero restarts after a custom session and the user then enables Awake using the status-bar primary toggle
- **THEN** no session runs before that action and the action starts an unlimited session

#### Scenario: Saving input fails after successful application
- **WHEN** a session is successfully applied but remembering the custom input fails
- **THEN** the actual session remains active and the user sees that application succeeded but saving the input failed
