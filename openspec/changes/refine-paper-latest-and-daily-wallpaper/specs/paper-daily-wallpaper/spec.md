## Purpose

Let users explicitly opt into reliable daily Bing wallpaper changes while Zero is running. Keep scheduling, persistent manual choices, deduplication, failures, and plugin lifecycle authoritative across views and application restarts without adding an independent system daemon.

## ADDED Requirements

### Requirement: Daily wallpaper change is an opt-in persisted Paper setting
The system SHALL provide a localized Daily automatic wallpaper change setting in Paper's main-window tool preferences. It SHALL default to off for existing installations and fresh installations, persist immediately through the native owner, and remain independent of Paper navigation visibility, status-bar visibility, and global launch-at-login. Enabling it SHALL immediately request the latest available wallpaper once; failure to fetch or apply SHALL leave a successfully saved setting enabled with explicit failure feedback. Failure to save the setting SHALL retain the last confirmed setting and SHALL NOT start newly requested automation.

#### Scenario: Existing installation has no Paper automation settings
- **WHEN** the user upgrades or opens Paper settings with no persisted automation preference
- **THEN** daily automatic change is off and the existing desktop wallpaper is not changed

#### Scenario: User turns daily change on
- **WHEN** the setting is successfully changed from off to on on a supported enabled Paper plugin
- **THEN** Zero checks for and attempts to apply the latest available image immediately, reports the actual result, and leaves global launch-at-login unchanged

#### Scenario: Initial application fails after the setting is saved
- **WHEN** enabling was persisted successfully but the network, image validation, or system wallpaper operation fails
- **THEN** the setting remains enabled, the failure is shown, and only retryable failures enter bounded retry

#### Scenario: Setting persistence fails
- **WHEN** the native owner cannot save an attempted setting change
- **THEN** the UI restores the last confirmed value, presents an actionable error, and does not activate the rejected setting

#### Scenario: Settings are invalid or unsupported
- **WHEN** persisted settings or required automation safety state are corrupt, unreadable, or have an unsupported version
- **THEN** Zero does not automatically apply wallpaper, preserves the data, and reports the problem rather than silently treating it as a fresh enabled configuration

### Requirement: Native daily checks work independently of Paper visibility
When daily change and the Paper plugin are enabled, Zero SHALL check asynchronously at application startup, when the Bing China-market day changes, and after system resume, with bounded periodic reconciliation and retry. Scheduling SHALL use the zh-CN feed's UTC+08:00 market day independently of UI language and the machine's local timezone. Closing Paper SHALL NOT stop daily automation. Exiting Zero SHALL stop it; the system SHALL NOT install another daemon or change launch-at-login to satisfy this feature.

#### Scenario: Zero restarts with daily change enabled
- **WHEN** Zero starts with a valid enabled setting and an enabled Paper plugin
- **THEN** the native workflow checks for updates without requiring a Paper view and respects persisted deduplication and manual-override state

#### Scenario: Zero runs across China-market midnight
- **WHEN** the China-market day changes while Zero continues running
- **THEN** an update check becomes due without requiring the user to reopen Paper

#### Scenario: Computer resumes after missed days
- **WHEN** the system resumes after one or more daily checks were missed
- **THEN** Zero checks the newest available image and does not replay applications for each missed day

#### Scenario: Resume notifications are unavailable
- **WHEN** native resume observation cannot be registered
- **THEN** bounded reconciliation still checks within its documented interval after execution resumes and the missing observation does not block Paper

#### Scenario: Zero is not running
- **WHEN** Zero has exited
- **THEN** daily changes stop until Zero runs again and no Paper-specific background process remains installed

### Requirement: Daily automation applies only validated eligible images and deduplicates success
Automatic system changes SHALL use the existing native image-validation and wallpaper boundary. Normal daily checks SHALL apply only a current China-market-day image different from Paper's most recently successfully applied image, rather than reapplying an old image to satisfy a wall-clock date. The explicit off-to-on action SHALL attempt the newest available image even if it is from an earlier day, while still avoiding a duplicate of the most recent successful application. Successful image identity and publication-day state SHALL persist across restart; failed application SHALL NOT be recorded as success. Concurrent checks and applications SHALL NOT race to apply the same image.

#### Scenario: Today's image is not yet available
- **WHEN** a normal daily check succeeds but its newest image predates the current China-market day
- **THEN** the current desktop remains unchanged, the real latest date is reported, and a later bounded check remains due

#### Scenario: Explicit enabling finds only an earlier image
- **WHEN** the user turns automation on and the newest validated available image is from an earlier market day
- **THEN** Zero attempts that image once with its real date and continues waiting for the current-day release

#### Scenario: Multiple triggers return the same image
- **WHEN** startup, resume, a visible refresh, and a timer identify the image most recently successfully applied by Paper
- **THEN** no duplicate system wallpaper application occurs, including after an application restart

#### Scenario: Metadata is newer than the valid image bytes
- **WHEN** the current-day image metadata is available but its download or validation fails
- **THEN** Zero does not apply partial or invalid bytes, does not mark application success, and preserves the previous desktop while exposing the failure

#### Scenario: Wallpaper application fails
- **WHEN** the system wallpaper backend rejects an eligible image
- **THEN** Zero reports a structured application error and does not advance successful-application state

### Requirement: A successful manual Paper choice is protected until the next market day
When the user successfully applies a historical wallpaper through Paper while daily automation is enabled, Zero SHALL preserve that manual choice for the rest of the current China-market day. For this protection, a historical image is one older than the current market day or older than the latest available entry. Browsing, downloading, preview selection, failed manual application, and metadata refresh SHALL NOT create or clear this protection. The protection SHALL survive Zero restart, expire at the next China-market midnight, and never be bypassed by ordinary checks or Refresh now. Explicitly switching daily automation off and then on SHALL clear the prior protection as a new request to apply the latest available image. Manual application and automation SHALL be serialized so that a queued automatic application cannot overwrite an accepted manual choice afterwards.

#### Scenario: User manually applies an older image
- **WHEN** Paper successfully applies a historical image while daily change is enabled
- **THEN** Zero records the override until the next China-market midnight and automatic checks do not replace it that day

#### Scenario: Restart happens during a manual override
- **WHEN** Zero restarts before the recorded manual protection expires
- **THEN** startup checks preserve the manual wallpaper

#### Scenario: Manual protection expires before a daily image is available
- **WHEN** the next China-market day begins but its image is not available yet
- **THEN** Zero retains the desktop and resumes bounded checks until an eligible image is available

#### Scenario: A queued automatic job races manual application
- **WHEN** an automatic application has been prepared and the user requests a manual historical application
- **THEN** their system side effects are serialized and the successful manual choice remains the final wallpaper for the protected day

#### Scenario: User only browses history
- **WHEN** the user selects or downloads an older image without applying it successfully
- **THEN** automatic daily change continues and no manual override is recorded

#### Scenario: User explicitly reenables automation
- **WHEN** the user turns daily change off and then successfully turns it on again during a protected day
- **THEN** the new enabling request clears the prior protection and attempts the newest available image subject to successful-image deduplication

### Requirement: Automatic change stops safely with plugin and setting lifecycle
Disabling daily change, disabling Paper, or exiting Zero SHALL invalidate queued automatic applications. The native owner SHALL recheck current authorization before a system wallpaper side effect and SHALL prevent stale work from publishing a successful automation result for a disabled generation. A system call already started SHALL be allowed to finish and its actual outcome SHALL remain truthful. Reenabling Paper SHALL restore a persisted enabled daily setting once while respecting manual protection and deduplication. Hiding Paper from navigation or the status bar SHALL NOT disable its enabled daily setting.

#### Scenario: User turns the setting off during a download
- **WHEN** the setting is disabled before a prepared automatic image reaches its system application step
- **THEN** that operation does not change the desktop and no later timer from the prior generation can apply it

#### Scenario: Paper is disabled and enabled again
- **WHEN** Paper is disabled while automation is enabled and later enabled again
- **THEN** automation stops while disabled, the preference is retained, and at most one reconciled workflow resumes on reenabling

#### Scenario: Tool icons are hidden
- **WHEN** the user hides Paper's navigation or status-bar entry while leaving the plugin and daily setting enabled
- **THEN** daily automation continues without reopening a Paper surface

#### Scenario: Settings change after a native call has begun
- **WHEN** automation is disabled after the operating system wallpaper call has already started
- **THEN** Zero reports the actual outcome of that call and schedules no further automatic application

### Requirement: Retry and status remain bounded and truthful
The system SHALL coalesce equivalent concurrent refreshes, use bounded retry intervals for recoverable failures or an unpublished daily image, and expose last completed check, last successful refresh, last successful application, manual-pause state, and next check when applicable. It SHALL NOT create catch-up bursts after sleep or clock changes. Unsupported platforms and nonretryable errors SHALL not enter a tight retry loop. A successful metadata refresh SHALL NOT by itself count as a successful desktop application.

#### Scenario: Network remains unavailable
- **WHEN** several scheduled checks fail with retryable network errors
- **THEN** Zero preserves existing cache and desktop, reports the failure, and spaces further attempts according to the documented bounded retry policy

#### Scenario: System clock jumps
- **WHEN** the wall clock or timezone changes while Zero is running
- **THEN** Zero recomputes the China-market day and future due time without reapplying an already successful image or replaying missed intervals

#### Scenario: Platform cannot set wallpaper
- **WHEN** the current platform reports wallpaper application unsupported
- **THEN** Paper keeps browsing and downloading usable, explains the automation limitation, and performs no repeating unsupported system calls

#### Scenario: Required state cannot be persisted after a manual change
- **WHEN** the OS reports manual application success but its manual-protection state cannot be saved
- **THEN** Zero reports both the actual desktop success and persistence failure, blocks further automatic application, and does not claim that restart protection was saved
