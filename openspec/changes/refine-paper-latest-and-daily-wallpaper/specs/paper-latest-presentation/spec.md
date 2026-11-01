## Purpose

Make each opening of Zero Paper show the newest available Bing image without mistaking an automatic cache selection for deliberate history browsing. Preserve truthful image dates, usable cached content, and clear refresh feedback across Paper surfaces.

## ADDED Requirements

### Requirement: Opening Paper starts a latest-following presentation session
The system SHALL start a new presentation session when a hidden Paper surface is shown or the user enters Paper from another tool. Each new session SHALL initially select the newest valid cached entry and SHALL follow the newest entry returned by refresh until the user deliberately browses history. Starting Zero alone SHALL NOT be treated as opening Paper. A background refresh, ordinary focus change, or rerender within a visible Paper session SHALL NOT start another session.

#### Scenario: Cached default must not pin an old image
- **WHEN** Paper opens with October 28 as the newest cached image and refresh subsequently returns a newer October 31 image before the user browses history
- **THEN** the preview advances from October 28 to October 31 even though October 28 remains in the history

#### Scenario: Paper is reopened after history browsing
- **WHEN** the user hides Paper or leaves for another tool after browsing history and later opens Paper again
- **THEN** the new session defaults to the newest available image rather than retaining the prior session's historical selection

#### Scenario: Focus changes without leaving Paper
- **WHEN** an already visible Paper view loses and regains ordinary keyboard focus without a hide or tool-navigation transition
- **THEN** its current presentation session and history selection remain intact

#### Scenario: Zero starts without opening Paper
- **WHEN** Zero starts while Paper is not visible and daily automatic wallpaper change is off
- **THEN** Paper does not start a remote refresh or preview decode solely because Zero started

### Requirement: Deliberate history browsing survives refresh within a session
The system SHALL distinguish user-selected history from automatically selected cached content. After deliberate history navigation, refresh SHALL preserve the selected identity while it remains available. If it disappears from the retained history, selection SHALL fall back to the newest available entry. Cached default selection SHALL NOT receive this user-intent protection.

#### Scenario: User navigates while opening refresh is pending
- **WHEN** the user selects an older image before the opening refresh completes and that image remains in the returned history
- **THEN** refresh preserves the user's image rather than switching to the newly returned latest image

#### Scenario: Selected history entry expires
- **WHEN** the deliberately selected image is removed from the bounded history after refresh
- **THEN** Paper selects the newest available entry and keeps navigation usable

#### Scenario: Late completion belongs to an earlier opening
- **WHEN** refresh or preview work completes after its Paper session has been hidden, disposed, or superseded
- **THEN** that completion cannot overwrite the newer session's selection or preview

### Requirement: Return to latest and immediate refresh have distinct effects
Paper SHALL offer accessible localized actions for returning to the latest available entry and checking for updates immediately. Return to latest SHALL reset the current session to latest-following mode without applying desktop wallpaper. Immediate refresh SHALL bypass successful-refresh reuse, share already-running equivalent work, and preserve deliberate history selection. Neither action SHALL itself enable automatic wallpaper change or bypass an existing manual override.

#### Scenario: User returns to latest from history
- **WHEN** the user activates Return to latest
- **THEN** Paper selects the newest available entry, follows later updates in that session, and does not apply wallpaper merely because selection changed

#### Scenario: User requests an immediate refresh
- **WHEN** the user activates Refresh now inside the normal successful-refresh reuse interval
- **THEN** Paper performs or joins an actual update check and exposes pending and completed status without issuing duplicate equivalent requests

#### Scenario: Refresh happens with automatic change off
- **WHEN** the user refreshes Paper while automatic wallpaper change is off
- **THEN** metadata and preview can update while the system desktop remains unchanged

### Requirement: Freshness feedback preserves publication dates and separates outcomes
Paper SHALL show the selected image's real Bing China-market publication date, falling back to its existing source date when publication metadata is unavailable. It SHALL separately communicate checking progress, last completed check time, latest available publication date, recoverable refresh failure, and desktop-application outcome. A successful check without a current-day image SHALL NOT be presented as a network failure or a successful current-day wallpaper update. A failed check SHALL NOT advance the last successful refresh time.

#### Scenario: Bing has not supplied today's image
- **WHEN** a successful check returns only images published before the current China-market day
- **THEN** Paper retains the latest available image, shows its actual date, and explains that a newer daily image is not yet available without inventing a release time

#### Scenario: Refresh fails while cached images exist
- **WHEN** Bing is unreachable or returns invalid data while cached content is usable
- **THEN** Paper keeps that content browsable and shows a retryable failure with the last check time without relabeling the old image as today's

#### Scenario: Metadata succeeds but applying wallpaper fails
- **WHEN** the latest metadata is available but the operating system rejects the wallpaper change
- **THEN** Paper distinguishes successful data refresh from failed desktop application and does not report wallpaper-application success

### Requirement: Paper controls fit their surfaces and remain accessible
Paper SHALL keep tray and dedicated quick surfaces compact, place the daily automation setting and detailed status in the main window's Paper settings, and expose Chinese and English labels, visible focus, keyboard operation, and appropriate status announcements. Hidden views SHALL stop presentation-only work and release their preview resources without cancelling a separately enabled native automation workflow.

#### Scenario: User operates Paper without a pointer
- **WHEN** the user navigates to Return to latest, Refresh now, history, download, or apply controls with a keyboard
- **THEN** each control has a readable accessible name, visible focus, and the same behavior as pointer activation

#### Scenario: Hidden Paper has daily automation enabled
- **WHEN** Paper is hidden while daily automation remains enabled
- **THEN** presentation-only requests are stopped or ignored while native daily checks continue according to their own lifecycle

#### Scenario: A narrow quick surface is used
- **WHEN** Paper is displayed at the tray's compact width in either supported UI language
- **THEN** the image, date, essential actions, and actionable error state remain usable without horizontal overflow
