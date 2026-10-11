## Purpose

Let Zero Snap recognize the original text inside a chosen screenshot region, then view, edit and explicitly copy the result without capturing interface chrome or retaining private OCR history.

## ADDED Requirements

### Requirement: Screenshot OCR reuses region selection
When OCR is available, the Snap menu and main view SHALL expose Screenshot OCR and the editor SHALL expose recognition of the current committed selection. OCR entry SHALL open the existing selection flow with explicit recognition confirmation rather than silently performing an image-copy action. Recognition SHALL use original frozen pixels within that region; the UI SHALL explain that annotations do not modify this source.

#### Scenario: User selects Screenshot OCR
- **WHEN** the user invokes that action and selects a region
- **THEN** the editor offers explicit OCR confirmation and no image or text is automatically copied

#### Scenario: Existing edited screenshot is recognized
- **WHEN** the user activates OCR with a valid committed region and existing annotations
- **THEN** only the region's original pixels are recognized and annotation or toolbar content is excluded as explained by the action hint

#### Scenario: Region is invalid or unavailable
- **WHEN** no committed region exists or its session is stale
- **THEN** recognition is unavailable or fails with actionable guidance without reading other media

### Requirement: Snap OCR results are editable and explicitly copied
After recognition handoff, the capture overlay SHALL close and the main Snap view SHALL present progress followed by editable recognized text. Copy SHALL write the user-visible edited text only on an explicit action. The UI SHALL preserve keyboard access and localized loading, failure, empty-result and cancellation states.

#### Scenario: Successful recognition and copy
- **WHEN** a supported selected region contains text and the user edits the result then activates Copy
- **THEN** the clipboard contains the edited text and the view confirms the actual native copy outcome

#### Scenario: Empty recognition
- **WHEN** recognition finishes with no text in the region
- **THEN** the view explains that no text was detected, offers a new capture and does not replace the clipboard with empty content

#### Scenario: Worker fails or user cancels
- **WHEN** recognition fails, times out or is cancelled
- **THEN** the main view shows the appropriate localized state, permits a new capture and ignores late success from that request

### Requirement: Result visibility and retention are scoped
Only the owning Snap result view SHALL read its current OCR result. Results SHALL remain memory-only, with one latest result retained no longer than ten minutes and cleared on explicit clear, replacement, plugin stop or application exit. Closing main SHALL cancel running Snap recognition; switching tools MUST NOT expose or overwrite another job's result.

#### Scenario: New request replaces an old result
- **WHEN** the user starts a new Snap OCR request or clears the result
- **THEN** old text and temporary input are released and a late old notification cannot overwrite the new result

#### Scenario: Main closes during recognition
- **WHEN** the user closes the result window while its request is running
- **THEN** the request is cancelled and no delayed completion reopens a result window or changes the clipboard
