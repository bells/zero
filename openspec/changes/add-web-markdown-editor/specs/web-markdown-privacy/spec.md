## Purpose

Keep Markdown content local by default while making the two intentional exceptions, opt-in browser drafts and authorized external images, explicit, bounded and isolated from other tools and feedback.

## ADDED Requirements

### Requirement: Local ephemeral content by default
Markdown source, selection, filenames, images, rendered results and export state MUST remain local and ephemeral unless the visitor explicitly enables browser drafts or exports/copies content. Tool code MUST NOT place this data in URLs, logs, telemetry or feedback, and MUST NOT require an account or conversion service. Initial/lazy resource loading requirements SHALL be explained without promising first-visit offline operation. Existing tools MUST retain their own ephemeral-content rules.

#### Scenario: Visitor edits a synthetic private document
- **WHEN** a visitor edits, previews and clears content with drafts disabled and images unauthorized
- **THEN** network/storage inspection shows no document content persisted or transmitted by tool code
- **AND** clearing or leaving releases associated application state and preview resources

### Requirement: Explicit single browser draft
The browser-draft switch SHALL default to off on a fresh visit. Only explicit opt-in SHALL permit retaining one bounded draft for this tool on the current site origin, shared by Chinese/English routes. The tool SHALL clearly expose save status, restoration and local-draft deletion. Disabling storage SHALL stop writes and delete the retained draft while preserving current in-memory source; deleting a draft MUST cancel pending writes that could recreate it. Stored drafts MUST NOT include external-image permissions, image bytes, exports or history. Other tabs changing the draft SHALL produce conflict feedback rather than silently overwrite a newer draft.

#### Scenario: Visitor opts into draft saving
- **WHEN** a visitor enables Save draft in this browser, edits and revisits the same-origin tool
- **THEN** the tool can restore the single validated draft with an explicit saved/restored status
- **AND** external images remain unauthorized after restoration

#### Scenario: Visitor deletes or disables the draft
- **WHEN** the visitor deletes the local draft or turns off draft saving while a save is pending
- **THEN** retained content is removed and the pending save cannot recreate it
- **AND** the current in-memory document remains available for editing or download

#### Scenario: Browser storage is unavailable or corrupt
- **WHEN** storage is blocked, quota is exhausted or a stored draft is malformed/over-limit
- **THEN** the tool shows an accurate unsaved/restore-error state without breaking editing or download
- **AND** it does not delete other tools' stored preferences or silently overwrite a draft changed in another tab

### Requirement: Inert raw HTML and safe destinations
Preview, HTML export, PDF conversion and draft restoration MUST treat source as untrusted. Raw HTML SHALL remain inert, with no execution of scripts, event handlers, forms, embedded frames or user CSS. Unsafe link/image protocols MUST be rejected; code content and filenames MUST be escaped for their output context. Supported Markdown links MUST not gain access to the originating editor window.

#### Scenario: Visitor pastes malicious document content
- **WHEN** source contains script tags, event handlers, an iframe, active CSS, javascript links or HTML within code
- **THEN** preview and exports preserve safe document text without executing the injected behavior
- **AND** restoring the same source from a draft applies the same restrictions

### Requirement: Per-document external image consent
External images SHALL initially appear as placeholders with no automatic network request. Only explicit current-document consent for the displayed image sources SHALL permit bounded HTTP(S) image requests. New sources after editing SHALL require new consent; document replacement, draft restoration and leaving SHALL revoke consent. Requests MUST omit credentials and referrer, enforce accepted formats/byte/dimension/time limits, and MUST NOT use server proxies or attach editor context. Redirects MUST NOT bypass the consented-source boundary.

#### Scenario: Visitor previews a remote image reference
- **WHEN** a document initially contains an external image URL
- **THEN** a placeholder appears and no image-origin request occurs
- **AND** only after consent can the bounded, credential-free image request occur

#### Scenario: Document changes after image consent
- **WHEN** the visitor adds a new source or restores/replaces the document
- **THEN** the new or restored sources remain blocked until the appropriate consent
- **AND** CORS, unsupported-type, limit or request failures remain visible without fallback uploading

### Requirement: Feedback and resource isolation
When optional feedback is enabled, embedding context MUST contain only the stable allowlisted thread ID and locale. Markdown content, source title/filename, image URLs, draft state, searches, selections and export/errors MUST NOT be forwarded. No feedback-origin request SHALL occur before activation, and feedback failure MUST NOT prevent editing, draft controls or downloads. Default-disabled feedback configuration MUST remain effective.

#### Scenario: Visitor opens feedback while editing private content
- **WHEN** a visitor opens the Markdown feedback panel after entering private content
- **THEN** the isolated panel receives only its allowlisted thread and locale
- **AND** disabling or failing feedback leaves document operations available
