## Purpose

Define a server-authoritative, exportable feedback service that receives account-free submissions without exposing private contacts, publishes content only through authenticated review, and can be operated within verified hosting and cost limits independently of the static website.

## ADDED Requirements

### Requirement: Server-authoritative input and thread validation
The service SHALL accept only allowlisted thread identifiers and the defined text, optional nickname and optional email fields plus a bounded submission-attempt identifier. It MUST enforce the same field limits as the visitor form and a total body limit of 16 KiB regardless of the client used. Visitor-supplied parent IDs, owner roles, publication states or unexpected privileged fields MUST be rejected. All visitor-created items SHALL start as awaiting moderation. Literal text MUST NOT be executed or transformed into remote content.

#### Scenario: Caller bypasses the official form
- **WHEN** a direct request supplies an oversized body, an unknown thread or a forged publication, parent or owner field
- **THEN** the server rejects it before creating a public or privileged record
- **AND** errors do not reveal request contents, stack traces, database queries or credentials

### Requirement: Moderated visibility across all public reads
Public lists, reply queries, counts and direct-ID access SHALL expose only approved, nondeleted content for the requested thread. Pending and rejected content MUST NOT be returned through default provider routes, alternative endpoints, pagination or caches. Public objects MUST omit email and its hash, IP, user agent, authentication material and private moderation data. Hiding or deleting a parent SHALL hide its responses from public access as well.

#### Scenario: Unapproved item is queried through multiple routes
- **WHEN** an unauthenticated caller requests pending content through list, ID, count, reply or underlying provider endpoints
- **THEN** none of those responses discloses the content or its private metadata

#### Scenario: Approved feedback contains private contact data
- **WHEN** an item submitted with an email is approved
- **THEN** its public representation contains the approved text, display name, timestamp and authoritative author role without email or an avatar hash
- **AND** its email is available only through an authorized administration operation

### Requirement: Authenticated review and owner-only responses
Only authenticated administrators SHALL approve, reject, edit, hide or delete feedback, read contacts, export data or publish maintainer responses. Identity MUST be verified on the server and MUST NOT derive from a submitted nickname or email. Maintainer responses SHALL target approved top-level feedback in the same thread, SHALL be limited to one response level and SHALL obey text limits. Public visitor registration or first-user administrator claiming MUST be unavailable after controlled initialization. Unauthorized underlying provider routes MUST NOT bypass these restrictions.

#### Scenario: Visitor attempts to impersonate the owner
- **WHEN** a visitor supplies the maintainer's name/email or directly calls response, moderation, registration or export endpoints
- **THEN** no owner identity, permission or privileged data is granted
- **AND** mutation endpoints enforce authentication, authorization and relevant origin/CSRF checks independently of UI visibility

#### Scenario: Maintainer reviews and responds
- **WHEN** an authenticated administrator approves an item and publishes a valid response
- **THEN** that item and response become publicly readable with the response labeled as maintainer-authored
- **AND** automatic email notifications are not sent

### Requirement: Bounded abuse control and duplicate handling
The service SHALL enforce payload, pagination and shared rate limits across serverless instances. The initial per-source submission limit SHALL be at most five attempts per ten minutes, with a safe retry indication on rejection. Any application-retained source identifier MUST be short-lived and pseudonymized, expire within 24 hours and be derived only from trusted hosting metadata. A bounded idempotency mechanism SHALL prevent repeated requests for one submission attempt from creating multiple records. An operator-controlled write pause and deployment-specific global write budget MUST protect hosting quotas; CORS alone MUST NOT be treated as abuse prevention or authorization.

#### Scenario: Submissions exceed the allowed rate across instances
- **WHEN** a caller exceeds the submission limit while requests reach multiple function instances
- **THEN** the excess requests are rejected with rate-limit information before creating further records
- **AND** the calculation tools remain available independently

#### Scenario: Same attempt is retried or writes are paused
- **WHEN** a persisted submission is retried with its attempt identifier
- **THEN** no additional feedback record is created and no private record content is disclosed
- **AND** a global write pause prevents new submissions with an accurate unavailable response

### Requirement: Data minimization and portable administration
The application MUST NOT log feedback bodies, emails, private request payloads or tool data, or actively retain raw visitor IP/user-agent profiles. It MUST NOT send email or content to external avatar, analytics or anti-spam services. Authenticated administrators SHALL be able to export feedback, review state, thread association and owner-response relationships in a portable format, restore them in an isolated test environment, and delete feedback and contacts. Exports and backups containing contacts SHALL be treated as private and MUST NOT be published to the website or repository. Actual data, provider-log and backup retention and deletion procedures SHALL be documented before activation without claiming unimplemented automatic expiry.

#### Scenario: Maintainer exports and restores synthetic records
- **WHEN** an authenticated administrator exports a synthetic set of pending, approved and rejected items with responses and contacts
- **THEN** an isolated restore preserves thread associations, visibility state and response relationships
- **AND** unauthorized callers cannot download the export and public reads still omit contacts

### Requirement: Verified cost and deployment activation
Feedback SHALL remain disabled until actual hosting-plan eligibility, intended site use, storage/compute quotas, quota-exhaustion behavior, data region, backup/retention procedure and administrator initialization have been recorded and verified. Initial activation MUST incur no additional paid subscription or require a self-managed persistent server. The system MUST NOT automatically create paid resources or upgrade plans. Production and preview feedback data SHALL be isolated; preview MUST NOT write to the production service by default. Missing or failed qualification SHALL leave feedback disabled and require renewed selection rather than weakening the accepted contract.

#### Scenario: Free hosting is incompatible with the site's use
- **WHEN** the actual hosting terms or existing account configuration cannot support the accepted scope without additional payment
- **THEN** the feedback feature remains disabled and no paid upgrade occurs automatically
- **AND** the implementation records the blocker for a new selection decision

#### Scenario: Preview or rollback is activated
- **WHEN** a preview site is opened or the production feedback feature is rolled back
- **THEN** preview cannot create production feedback by default, and rollback can stop public submissions without deleting stored records
- **AND** the static tools continue to operate
