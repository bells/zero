## Purpose

Provide common event and cached health contracts for Zero's bundled tools, host workflows and isolated extensions. Each integration retains its authoritative business state, platform support and permission boundaries while supplying safe, attributable information useful for diagnosing failures across operation stages.

## ADDED Requirements

### Requirement: Tool diagnostics use a common host contract
Each bundled plugin SHALL provide safe operation events and cheap existing-state health snapshots through the common diagnostic contract. A new plugin SHALL be integrable through plugin-owned adapters and host composition without requiring the host core to import its concrete implementation or importing peer plugins.

#### Scenario: New tool integrates diagnostics
- **WHEN** a tool registers an event catalog and cached snapshot adapter through composition
- **THEN** the common facility can attribute its safe events and include its existing state without adding concrete-tool dependencies to the core

### Requirement: Event ownership preserves authoritative business state
Native owners SHALL record each operation terminal result once, with frontend integration recording only additional UI/transport failures. Existing typed errors and state responses SHALL remain authoritative. Cancellation, disablement, missing initialization and platform non-support SHALL be distinguishable from operational failure rather than repeatedly classified as errors.

#### Scenario: Native failure reaches the frontend
- **WHEN** a recorded native failure is returned to the initiating frontend
- **THEN** the frontend displays the existing user error without recording a duplicate raw exception

#### Scenario: User cancels a tool operation
- **WHEN** a supported operation is cancelled through its existing workflow
- **THEN** its diagnostic outcome identifies cancellation and does not imply a tool defect

#### Scenario: Unsupported capability is inspected
- **WHEN** a tool snapshot describes a capability unavailable on the current platform
- **THEN** it explicitly reports unsupported without claiming support from its manifest or generating repeated failure events on reads

### Requirement: Host lifecycle and background failures are diagnosable
The host SHALL record safe stages and outcomes for migration/bootstrap, window actions, shortcuts/status-bar/autostart, registry/market/package validation and plugin lifecycle. Background failure, permission denial and cleanup failure SHALL remain visible even when no foreground tool command initiated them, without preserving private payloads.

#### Scenario: Plugin cleanup fails after authorization revocation
- **WHEN** a lifecycle cleanup step fails after the host revokes a plugin's authority
- **THEN** a host-attributed stage/category is recorded, authorization stays revoked and diagnostic collection does not depend on the plugin reporting its own failure

#### Scenario: Shortcut registration fails
- **WHEN** the host cannot register a tool shortcut
- **THEN** the original shortcut state remains authoritative and the same safe failure category appears in support diagnostics

### Requirement: Snap diagnostics preserve media and platform boundaries
Snap SHALL report safe stages for capture permission/start, target-enumeration degradation, native session/commit, copy/save/pin and cleanup. Diagnostics SHALL distinguish the macOS custom flow, Windows system launcher and unsupported platforms without collecting media, titles, coordinates or authorization leases.

#### Scenario: Capture permission is denied
- **WHEN** native capture cannot proceed because permission is unavailable
- **THEN** diagnostics identify the permission and capture stage while excluding image content and window titles

#### Scenario: Screenshot output fails
- **WHEN** a copy, save or pin operation fails
- **THEN** its native outcome and phase are recorded without exposing the chosen path or media token

### Requirement: Awake diagnostics track native resource outcomes
Awake SHALL report enable/disable, expiry, backend failure and shutdown cleanup outcomes with cached active/backend state. It MUST NOT include process output, process arguments, environment values or persistent device identifiers.

#### Scenario: Native power backend ends unexpectedly
- **WHEN** the owned macOS child or Windows power operation fails unexpectedly
- **THEN** diagnostics identify the backend/category and resulting authoritative state without raw process output

#### Scenario: Keep-awake duration expires
- **WHEN** the configured keep-awake interval ends normally
- **THEN** the recorded result identifies normal expiry rather than failure

### Requirement: Paper diagnostics distinguish network cache and application stages
Paper SHALL report metadata fetch, image download, cache/preview work, wallpaper apply/export and cleanup stages using safe endpoint kinds, status codes, counts and outcomes. Diagnostics MUST NOT include images, full remote URLs, response bodies or user save paths.

#### Scenario: Network refresh fails with cached data available
- **WHEN** metadata refresh fails while a previous usable cache remains
- **THEN** diagnostics identify the network stage and safe error category while preserving the original cached-data behavior

#### Scenario: Wallpaper application fails
- **WHEN** the platform wallpaper backend cannot apply a downloaded image
- **THEN** diagnostics distinguish the apply failure from successful fetch/download without revealing the image or file path

### Requirement: Launch diagnostics preserve query privacy and existing bounds
Launch SHALL report initialization/index/cache/watcher, shortcut conflict and launch/focus/system-setting outcomes while preserving existing bounded diagnostic state. Cached health SHALL describe indexing/watch availability and counts without application inventory, search queries, recent history or arbitrary paths.

#### Scenario: Watcher or cache write fails
- **WHEN** the native indexer detects a watcher or cache persistence failure
- **THEN** the existing tool state and common diagnostics reflect its safe category without recording filesystem paths

#### Scenario: User searches for an application
- **WHEN** a user submits a search query or opens a search result
- **THEN** diagnostics may describe a controlled operation outcome or latency but never persist the query or application history

### Requirement: File diagnostics explain provider and engine stages
File SHALL distinguish capability/provider availability, package identity/policy/signature/assets, engine creation/readiness, job validation/execution/cancellation, output validation and cleanup. Health SHALL identify the actual provider/engine version and approved or debug-fallback state without weakening signed-package approval or exposing document data and authorization credentials.

#### Scenario: Built-in engine fails to load
- **WHEN** the built-in provider cannot load because of policy, package integrity, window creation or readiness failure
- **THEN** diagnostics report the specific failed stage alongside the existing user error rather than inferring a generic reinstall root cause

#### Scenario: Debug fallback is in use
- **WHEN** a debug-only source engine fallback supplies a provider
- **THEN** its snapshot explicitly identifies dev fallback and does not claim that a signed release package was approved or repaired

#### Scenario: Engine reports conversion failure
- **WHEN** an authorized engine session reports a failed conversion
- **THEN** the native owner records a controlled failure category and stage without copying unrestricted engine diagnostics, document content or lease/session identifiers

#### Scenario: About reads File state before initialization
- **WHEN** File has not initialized its provider or engine
- **THEN** diagnostics report the existing initialization state and do not create a hidden engine or re-run provider discovery

### Requirement: Isolated engines retain their existing narrow transport
File engine diagnostic results SHALL travel only through the existing Rust-authorized engine job/session boundary. The engine MUST NOT receive general log filesystem, global diagnostic read, clipboard or support-link permissions.

#### Scenario: Engine requests a global diagnostic action
- **WHEN** the isolated File engine attempts a global read, copy or directory command
- **THEN** the host refuses that command while authorized job-result reporting remains available through the existing narrow channel

### Requirement: External diagnostic emission is authenticated and write-only
An isolated Web plugin SHALL emit diagnostics only through a typed `diagnostics.emit` Bridge method with explicit approved `diagnostics.write` permission. The host SHALL validate the current caller, session, generation, package owner and live grants before admitting an event, assign its true identity/source and forbid global diagnostics access. Input SHALL be limited to bounded severity, event code, phase and outcome without free messages or arbitrary metadata.

#### Scenario: Authorized plugin emits an event
- **WHEN** a ready live plugin session with approved diagnostics.write permission submits valid diagnostic input
- **THEN** the host records an event attributed to that plugin and marked self-reported, returning only a typed acknowledgment

#### Scenario: Plugin attempts identity spoofing
- **WHEN** a plugin submits host identity, another plugin identity or unsupported diagnostic fields
- **THEN** the request is refused and no event is persisted under a spoofed owner

#### Scenario: Permission or generation changes during a request
- **WHEN** diagnostics.write is revoked, the plugin is disabled or its session generation changes before admission
- **THEN** the host rejects admission and does not enqueue the now-unauthorized event

#### Scenario: Legacy plugin has no diagnostic grant
- **WHEN** an existing package has not explicitly requested and obtained diagnostics.write approval
- **THEN** the new method is denied without automatically migrating ui.message or other permissions into the diagnostic grant

### Requirement: External emission is bounded and compatibility-safe
External event codes and phases SHALL be constrained to documented lengths and character sets. Each plugin SHALL be limited to 60 events per minute with a burst of 10; overflow SHALL return a typed rate-limit result without blocking host workflows. Diagnostic support MUST NOT open the unapproved public plugin runtime or alter business behavior when the method is unavailable on an older host.

#### Scenario: Plugin floods the diagnostic method
- **WHEN** a plugin exceeds its diagnostic budget
- **THEN** additional events receive a controlled rate-limit result, host counters expose the loss and other tools remain responsive

#### Scenario: Host does not implement the method
- **WHEN** the SDK receives an unavailable-method result
- **THEN** its diagnostic helper reports that result without breaking the original plugin operation or bypassing the Bridge through direct native commands

#### Scenario: Public runtime remains disabled
- **WHEN** diagnostic support is added to the development plugin profile
- **THEN** existing public-runtime activation restrictions and independent release gates remain enforced

### Requirement: Existing performance instrumentation remains separate
Common diagnostics SHALL preserve the existing performance event schema, trace opt-in and historical evidence. Opening About or enabling temporary verbose diagnostics MUST NOT implicitly enable detailed performance measurement or rewrite tracked performance evidence.

#### Scenario: User requests a normal support summary
- **WHEN** About generates diagnostics with performance tracing disabled
- **THEN** the summary uses existing safe state and events without starting performance measurement
