## Purpose

Give users an explicit, persistent choice of qualified local conversion provider for each direction, with predictable defaults, stable running jobs and deliberate recovery when the selected engine becomes unavailable or fails.

## ADDED Requirements

### Requirement: Provider choices are direction-specific and default to built-in conversion
File SHALL offer provider choices separately for PDF-to-DOCX and DOCX-to-PDF. Only providers supporting that direction and current platform SHALL be selectable; known supported but unavailable providers SHALL have an accurate unavailable state and reason. A direction without a saved preference SHALL select its built-in provider, even when that provider is unavailable and an external provider is installed. Installing an external provider MUST NOT silently change selection. Unsupported directions MUST NOT be advertised as convertible.

#### Scenario: Fresh installation has LibreOffice but unavailable built-in export
- **WHEN** no preference exists and the built-in provider is unavailable for a direction
- **THEN** File shows the selected built-in provider and its reason, offers supported local alternatives, and requires explicit selection before using an alternative

#### Scenario: PDF-to-DOCX has only a qualified built-in engine
- **WHEN** Word and LibreOffice are installed but are not supported for PDF-to-DOCX by File
- **THEN** they are not presented as selectable PDF-to-DOCX providers

### Requirement: Explicit choices persist without storing document content
The application SHALL remember each direction's validated provider choice across panel lifecycles and application restarts. It SHALL NOT persist file paths, extracted text or queue contents as part of provider preferences. Unknown or cross-platform provider identifiers SHALL be handled explicitly rather than passed to arbitrary native executables.

#### Scenario: User selects Word and restarts Zero
- **WHEN** a user selects a supported local Word provider for DOCX-to-PDF and restarts the application
- **THEN** that direction retains the choice while the session-only conversion queue remains empty

#### Scenario: Saved provider is no longer supported
- **WHEN** stored preferences contain an obsolete or unsupported provider identifier
- **THEN** File discloses the invalid choice, uses the documented built-in default for future unstarted jobs, and does not automatically run another external application

### Requirement: Starting a batch freezes its provider choices
Starting queued jobs SHALL bind each started item to the selected provider for its direction. Later preference changes SHALL affect only jobs not included in an already started batch. Running and batch-bound jobs SHALL retain their provider identity until completion, cancellation or explicit retry. Capability or preference changes MUST NOT silently reroute a bound job.

#### Scenario: Selection changes while a batch runs
- **WHEN** users change DOCX-to-PDF selection after starting two queued DOCX jobs
- **THEN** both batch-bound jobs retain their original provider and future unstarted jobs use the updated preference

#### Scenario: One direction in a mixed queue is unavailable
- **WHEN** a mixed queue is started and only one direction's selected provider is available
- **THEN** eligible jobs can run, unavailable items retain clear non-completed state, and no item silently uses another provider

### Requirement: Failure recovery never switches engines implicitly
A failed or unavailable selected provider SHALL preserve its identity and structured error. Changing provider and retrying SHALL require an explicit user action, bind the retry to the newly selected provider, and retain output collision protection. Missing installation, Word activation, automation denial, export failure and timeout SHALL remain distinguishable. Changing provider SHALL NOT make invalid, corrupt or password-protected input automatically retryable.

#### Scenario: Word automation is denied while LibreOffice is installed
- **WHEN** a Word job fails because automation permission is denied
- **THEN** the job reports the permission reason and does not launch LibreOffice or the built-in engine automatically

#### Scenario: User explicitly retries using another engine
- **WHEN** users choose an available alternative and request retry of an eligible failed job
- **THEN** the retry uses that provider, exposes the new provider identity and commits only validated collision-free output

#### Scenario: Selected application is uninstalled before execution
- **WHEN** a batch-bound provider disappears before its job executes
- **THEN** the job reports provider unavailability without silently changing the batch selection

### Requirement: Selection is accessible and consistent across surfaces
The main File workspace SHALL provide labeled, keyboard-operable provider selection and unavailable guidance in Chinese and English. The tray SHALL show the effective selection concisely and provide access to configuration without duplicating a large configuration workspace. Both surfaces SHALL share authoritative preference and job updates; language changes SHALL NOT change selection or queue identity.

#### Scenario: User changes selection in main while tray has existing jobs
- **WHEN** a supported selection is changed in the main workspace
- **THEN** the tray reflects the updated preference while existing batch-bound jobs retain their original engine labels
