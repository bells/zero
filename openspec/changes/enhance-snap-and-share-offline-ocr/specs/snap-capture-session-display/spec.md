## Purpose

Keep screenshot sessions and editor windows reliable across repeated activation and multiple displays, so frozen pixels, selection coordinates and the chosen physical screen remain consistent.

## ADDED Requirements

### Requirement: Only one live capture session owns the editor
The system SHALL coordinate capture preparation, reveal, editing and teardown as one authoritative session. Repeated starts MUST NOT replace an active session, create a duplicate editor label or show a not-yet-prepared frame. A new session SHALL start only after previous editor teardown is confirmed; stale callbacks MUST NOT close or clear a newer session.

#### Scenario: Multiple entries start capture concurrently
- **WHEN** menu, shortcut and main actions request capture while preparation or initial reveal is pending
- **THEN** they coalesce into the existing session and no second editor or blank first frame appears

#### Scenario: Capture is already being edited
- **WHEN** another capture request arrives during editing
- **THEN** the current editor receives focus while preserving its action, selection and target display

#### Scenario: Immediate restart after completion or cancellation
- **WHEN** the user starts again while the old editor is closing
- **THEN** at most one restart waits until its window label is released and no duplicate-label error occurs

#### Scenario: Old cleanup completes late
- **WHEN** an expired reveal timer or destroyed callback from an old session completes after a new one starts
- **THEN** it cannot close the new window, clear the new media or consume its output leases

#### Scenario: Teardown cannot be confirmed
- **WHEN** closing or destroying the old editor fails or exceeds its bounded wait
- **THEN** the system reports a retryable localized failure and does not build another editor with the occupied label

### Requirement: Capture targets one consistently resolved display
For macOS menu actions the system SHALL use the display of the activated Snap glyph; for direct entries it SHALL use the pointer display at request time, with a safe primary fallback when unavailable. Captured pixels, full-screen editor frame and window targets SHALL share this same frozen display geometry. One session SHALL select within one display rather than imply cross-display stitching.

#### Scenario: Snap is activated on the right-hand secondary display
- **WHEN** the user chooses Screenshot or Screenshot OCR on that display's Snap menu
- **THEN** the frozen pixels and complete overlay belong to that display, including its menu bar and Dock area

#### Scenario: Shortcut is invoked on a negative-origin display
- **WHEN** the pointer is on a display positioned left of or above the primary display
- **THEN** direct capture targets that display with correctly converted origin and local image coordinates

#### Scenario: Mixed pixel density
- **WHEN** the target display has a different scale from the primary display
- **THEN** selection dimensions, targeting and exported crop map to that display's actual source pixels without displacement or stretch

#### Scenario: Display changes during preparation
- **WHEN** the target display disappears or its geometry changes before reveal
- **THEN** preparation is safely cancelled or retried with a new coherent snapshot without mixing old media and new geometry

### Requirement: Reveal and cleanup preserve bounded private resources
The editor SHALL reveal only after frozen media is decoded and content is ready. Cancel, failure, expiry, plugin stop and application exit SHALL invalidate session permissions and release owned media and leases; failures SHALL restore a usable shell. Unselected screens MUST NOT leave extra screenshot files.

#### Scenario: Initialization or reveal fails
- **WHEN** the media cannot be decoded or the native overlay cannot reveal
- **THEN** the session is invalidated, private staged resources are cleaned and the user can retry from a usable shell
