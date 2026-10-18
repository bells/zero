## Purpose

Provide a consistent local batch lifecycle for image watermarking, conversion and compression, with bounded resources, recoverable per-image failures and explicit user-controlled previews and exports.

## ADDED Requirements

### Requirement: Shared explicit batch workflow
All three image tools SHALL accept multiple local files, apply one shared set of settings per batch, expose per-item status and allow individual previews. Selecting files MUST NOT start full-resolution processing automatically. Successful results SHALL show source/output formats, dimensions, byte sizes and actual size changes. Settings changes MUST invalidate previous results for export until reprocessing, while preserving source files for retry.

#### Scenario: Visitor changes settings after a batch succeeds
- **WHEN** a visitor changes quality, size, format or watermark settings
- **THEN** previous results cease to be current downloadable outputs and the sources remain available
- **AND** newly processed previews and exports reflect one consistent current settings revision

### Requirement: Independent failures cancellation and stale-result rejection
A failed image SHALL NOT stop the remaining batch. Visitors SHALL be able to cancel the batch and retry failed items without discarding other current successful results. Cancellation MUST stop current and unstarted processing; completed current results SHALL remain available. Clear or leaving the page MUST stop processing and release application-owned file/result/preview state. Cancelled, timed-out or obsolete work MUST NOT restore previews or enable exports after a newer revision or clear action.

#### Scenario: One image fails among valid images
- **WHEN** a batch contains a damaged image and valid supported images
- **THEN** the damaged image receives a localized failure reason while valid images continue
- **AND** retrying failed items does not erase successful current results

#### Scenario: A cancelled task completes late
- **WHEN** a visitor cancels or clears work and an obsolete completion arrives
- **THEN** that completion cannot replace current state or create an active download
- **AND** cancellation and navigation remain responsive during expensive image work

### Requirement: Published bounded resource use
The image tools SHALL publish and enforce finite limits on file bytes, pixels, edge dimensions, batch count, aggregate source/result bytes, previews, per-item processing time and ZIP creation. Detectable violations MUST be rejected before the corresponding expensive allocation or operation. Default output MUST preserve dimensions; only explicit resize settings SHALL reduce them. The tools MUST NOT silently downscale or upload files as a fallback. Limits SHALL be based on recorded desktop/mobile sample measurements before release; existing Base64 limits MUST remain scoped to that tool.

#### Scenario: A large image exceeds the active safety policy
- **WHEN** a selected image or batch exceeds a published byte, dimension or cumulative limit
- **THEN** processing is refused with a specific localized explanation while existing valid results remain accessible
- **AND** the tool neither silently reduces resolution nor sends the image to a service

#### Scenario: Work exceeds its processing time limit
- **WHEN** image processing exceeds its published time bound
- **THEN** that item stops with a recoverable timeout state and other valid items can continue
- **AND** retry, cancellation and navigation remain available without activating an obsolete result

### Requirement: Local ephemeral processing and lazy resources
Files, filenames, metadata, watermarks, settings and results MUST stay in current-page memory and MUST NOT be uploaded, placed in URLs, logged, sent to telemetry or persisted to site storage. Downloads SHALL require an explicit user action. Codec/archive resources SHALL load from the site only when needed; tool operation MUST NOT require third-party runtime resources or feedback acceptance. Existing automatic-entry budgets of executable JS gzip at most 50 KiB and first-viewport resources at most 1 MiB SHALL remain applicable; interaction-loaded resources SHALL be measured separately.

#### Scenario: Visitor processes synthetic private images without feedback
- **WHEN** a visitor imports, processes, previews and clears images containing private markers without opening feedback
- **THEN** network, URL, storage and application log observation shows no tool content or metadata and no feedback connections
- **AND** clearing releases application-owned preview/download resources without promising secure erasure of browser-managed recovery data

### Requirement: Safe individual and successful-result archive downloads
Visitors SHALL be able to download each current successful result and a ZIP containing only current successful results. Names SHALL use a sanitized source basename, operation suffix and actual output extension, with collision-safe names and no directory traversal. A ZIP request SHALL identify successful/failed counts, remain bounded and cancellable, and leave individual downloads available on archive failure. An all-failed batch MUST NOT produce an empty success archive. A separately labeled original-file action SHALL distinguish unchanged source bytes from processed outputs.

#### Scenario: Duplicate names and partial failure occur
- **WHEN** two successful sources share a basename and another item fails
- **THEN** the ZIP contains uniquely named valid outputs for the successful items only
- **AND** the page reports the failed item and does not silently represent the archive as containing the complete batch

#### Scenario: Archive creation fails or is cancelled
- **WHEN** ZIP creation exceeds its bounds, fails or is cancelled
- **THEN** a localized archive-specific status is shown and current individual downloads remain usable
- **AND** no truncated archive is reported as a successful download
