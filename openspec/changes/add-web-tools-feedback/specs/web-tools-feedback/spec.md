## Purpose

Provide an optional bilingual feedback area for Zero's online tools so visitors can report problems, suggest improvements and request new tools without an account, while seeing only reviewed feedback and identifiable maintainer responses.

## ADDED Requirements

### Requirement: Scoped bilingual feedback entry points
The Chinese and English online-tools directories and timestamp, JSON, Base64 and diff tool pages SHALL expose a localized feedback entry point. Directory feedback SHALL address the overall toolbox and new-tool requests; each tool page SHALL select its own stable thread. Equivalent language routes MUST share one thread independently of locale, URL base and interface language. Desktop documentation pages SHALL remain outside this feature's initial scope.

#### Scenario: Visitor changes language for the same tool
- **WHEN** a visitor opens feedback on the Chinese JSON tool and then visits its English equivalent
- **THEN** both views select the same JSON feedback thread with interface text in the corresponding language
- **AND** original feedback text is preserved without automatic translation

#### Scenario: Visitor requests a new tool
- **WHEN** a visitor opens feedback from the tools directory
- **THEN** the form identifies the overall toolbox as its subject and explains that new-tool suggestions are welcome
- **AND** submitting there does not attach the feedback to an arbitrary existing tool

### Requirement: Account-free bounded text submission
Visitors SHALL be able to submit feedback without registration, login, nickname or email. Only the feedback body SHALL be required. The body MUST contain 1–2000 Unicode code points after trimming; optional nickname MUST be at most 40 code points and a supplied email MUST pass syntax validation and be at most 254 bytes. Empty nickname SHALL display a localized guest label. The form SHALL explain that feedback is sent to the service and becomes public after review, while email remains private. Feedback SHALL be displayed as literal text, including markup-like samples, without attachments, rich rendering, external media or automatic link previews.

#### Scenario: Visitor submits without personal details
- **WHEN** a visitor submits a valid body with empty nickname and email
- **THEN** the service accepts it for review without requiring an account or contact information
- **AND** the interface confirms receipt for moderation rather than public publication

#### Scenario: Text includes markup or exceeds limits
- **WHEN** a visitor submits HTML-like or Markdown-like text within the allowed limits
- **THEN** any approved display preserves it as inert text without loading its referenced resources
- **AND** an oversized or invalid submission is rejected with a localized explanation while preserving the current in-memory form

### Requirement: Reviewed public list and maintainer responses
The feedback area SHALL display only approved top-level feedback and authorized maintainer responses in the selected thread. It MUST identify maintainer responses using server-authoritative identity rather than visitor-supplied names. Top-level feedback SHALL be paginated newest first with at most 20 entries per page; response reads MUST also be bounded. Visitors MUST NOT create replies, nested discussions or owner identities. The first release SHALL omit voting, attachments, automatic email notifications and automatic translation.

#### Scenario: Feedback awaits moderation
- **WHEN** a submitted item has not been approved
- **THEN** neither its body nor its private metadata appears in public lists, counts or direct public reads
- **AND** the visitor is told that it awaits review without a promise of response time or acceptance

#### Scenario: Maintainer responds to an approved suggestion
- **WHEN** an authenticated maintainer publishes a response to an approved top-level item
- **THEN** it appears beneath that item with a maintainer label
- **AND** visitors cannot impersonate the response through nickname, email or forged request fields

### Requirement: Recoverable feedback interaction
The feedback area SHALL distinguish loading, empty, received-for-review, invalid input, rate limit, timeout and unavailable states in both languages. It MUST NOT display successful receipt until persistence is confirmed. It MUST NOT automatically retry an uncertain submission. Failed submissions SHALL preserve the current in-memory form, while closing or leaving the feedback area SHALL not create persistent drafts. A duplicate retry of the same submission attempt MUST NOT create multiple records.

#### Scenario: Connection fails during submission
- **WHEN** a submission times out before the visitor knows its result
- **THEN** the UI explains the uncertain result, keeps the draft available for an explicit retry and does not claim success
- **AND** retrying that same attempt is handled idempotently

#### Scenario: Service is unavailable while a tool is in use
- **WHEN** loading or submitting feedback fails
- **THEN** a localized retry or unavailable state is shown only within the feedback area
- **AND** the existing tool input, result, cancellation, copying and navigation remain usable

### Requirement: Accessible optional expansion and honest configuration states
Opening feedback SHALL expand it within the current page without resetting the tool. The entry control and feedback UI SHALL support keyboard access, visible focus, accessible names and status announcements, light/dark appearance, reduced motion, 44 CSS-pixel targets, 320 CSS-pixel widths and 200 percent zoom. Closing the region SHALL restore focus to its trigger. When feedback is disabled or unconfigured, the website MUST NOT load the service or show a working submission form; it SHALL provide accurate localized availability information and preserve the existing repository support link. Essential tool content and navigation SHALL remain available without client scripts.

#### Scenario: Keyboard visitor opens and closes feedback
- **WHEN** a visitor activates feedback by keyboard and later closes it
- **THEN** the region and its frame are meaningfully labeled, controls are reachable and focus returns to the trigger on close
- **AND** content remains usable at narrow widths and increased zoom without page-level horizontal overflow

#### Scenario: Service configuration or JavaScript is absent
- **WHEN** the feature is not enabled or client scripts cannot run
- **THEN** the page makes no false claim that it can receive feedback and retains readable tool guidance and support navigation
- **AND** a GitHub support link is not described as an account-free submission alternative
