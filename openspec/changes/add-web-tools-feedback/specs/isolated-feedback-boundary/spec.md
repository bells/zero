## Purpose

Keep opt-in network feedback separate from Zero's locally processed tool content through origin isolation, minimal communication and measurable loading behavior, preserving tool privacy and usability even when the feedback service fails or is unavailable.

## ADDED Requirements

### Requirement: Explicit opt-in network loading
The website MUST NOT create feedback frames, fetch feedback data, preload feedback assets or initiate feedback-origin connections before explicit activation. Activation SHALL load feedback in a separate-origin embedded document; feedback runtime code MUST NOT execute in the tool document. The static website and tool computation MUST remain independent of the service, and the existing initial executable-JS gzip limit of 50 KiB and first-viewport resource limit of 1 MiB SHALL include all automatically loaded entry code.

#### Scenario: Visitor computes without opening feedback
- **WHEN** a visitor loads a directory or tool, processes input and does not activate feedback
- **THEN** there are no requests or preconnections to the feedback service or its providers
- **AND** tool content remains local and the original initial-resource budgets remain applicable

#### Scenario: Visitor explicitly opens feedback
- **WHEN** a visitor activates the feedback entry
- **THEN** only the configured separate-origin feedback document and its necessary service resources load
- **AND** no feedback runtime gains direct access to the parent tool document

### Requirement: Minimal context and bounded messages
The embedding URL SHALL contain only an allowlisted thread identifier and supported interface locale. It MUST NOT send the full parent URL, tool input/output, file metadata or bytes, search query, clipboard, form contents or drafts. Referrer transmission MUST be disabled. Any frame messages SHALL be restricted to a versioned allowlist for readiness, bounded size and safe error state; the parent MUST validate the exact sender origin, frame window and message schema. Unknown messages MUST NOT trigger navigation, content reads, storage access or arbitrary code.

#### Scenario: Private marker exists in an active tool
- **WHEN** synthetic private markers are present in input, output, file metadata and tool search while feedback is opened and used
- **THEN** markers remain absent from feedback URLs, requests, frame messages, service logs and feedback-origin storage
- **AND** only feedback text explicitly entered into the feedback form is eligible for submission

#### Scenario: A different frame sends a forged message
- **WHEN** an unexpected origin or frame sends a message or an accepted frame sends unsupported fields or invalid dimensions
- **THEN** the parent ignores it without reading tool data, navigating, persisting values or applying unbounded layout changes

### Requirement: Browser-enforced isolation and restricted resources
The embedded document MUST have a different origin from the website, a restrictive sandbox and an explicit accessible title. It MUST NOT receive top-navigation, popup, download, clipboard, device or parent-document privileges. Host policies SHALL limit frame sources and allowed embedding parents to approved origins. The feedback application MUST NOT load external avatar, analytics, advertising, emoji, font or user-supplied media resources. Anonymous use MUST NOT require cross-site cookies or persistent browser storage; visitor contact details and drafts MUST NOT be persisted in browser storage.

#### Scenario: Same-origin or invalid embedding configuration is supplied
- **WHEN** feedback is configured with the website origin, an insecure production origin or an origin outside the approved configuration
- **THEN** embedding remains disabled rather than degrading to executing comment code in the tool document

#### Scenario: Browser blocks third-party cookies and storage
- **WHEN** a visitor opens feedback with third-party cookies and storage unavailable
- **THEN** anonymous reading and submission work without an account or retained profile
- **AND** administrator authentication is handled outside the embedded visitor experience

### Requirement: Accurate privacy copy and unchanged local processing
The website SHALL distinguish locally processed tool content from actively submitted feedback and describe the public-review and private-contact boundaries before submission. Tool inputs, results, files and searches MUST remain excluded from site storage, URLs, logs and telemetry after feedback activation. Feedback privacy information MUST NOT promise network anonymity or absence of hosting-provider connection metadata. Tool functionality SHALL not depend on accepting the feedback connection.

#### Scenario: Visitor reads privacy information before submitting
- **WHEN** a visitor opens feedback from a tool that states its input is processed locally
- **THEN** the page explains that the separate feedback text is transmitted and stored for review while tool computation content stays local
- **AND** the service does not automatically prefill the body from tool data

### Requirement: Independent failure and measurable performance
Frame loading and feedback requests SHALL have bounded waits and localized recovery paths. Closing or retrying feedback MUST NOT reset tool state or cancel unrelated computation. Before activation, the existing mobile laboratory targets SHALL remain performance/accessibility at least 95, LCP at most 2.5 seconds and CLS at most 0.1. After activation, feedback payload, load behavior and failures SHALL be measured separately, and untrusted frame sizing MUST NOT take over the page.

#### Scenario: Feedback frame never becomes ready
- **WHEN** the frame fails, is blocked or exceeds its readiness timeout
- **THEN** the parent shows an actionable feedback-only error and permits explicit retry or close
- **AND** tool operations and their local state are preserved
