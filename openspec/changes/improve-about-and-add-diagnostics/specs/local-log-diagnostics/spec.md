## Purpose

Define a bounded, local and privacy-preserving diagnostic facility owned by the Zero host. It records safe structured events, exposes the persistence health and produces reviewed support summaries without collecting user content or coupling tool operation to diagnostic storage availability.

## ADDED Requirements

### Requirement: Structured events have consistent attribution
The diagnostic facility SHALL record a schema version, timestamp, severity, source, stable event code, operation phase and outcome, host run identifier, applicable plugin identity and an optional diagnostic operation identifier. Host-authenticated identity SHALL take precedence over submitted values, and operation identifiers MUST NOT be authorization tokens or content-derived identifiers.

#### Scenario: Operation crosses frontend and native stages
- **WHEN** a tool operation exposes a diagnostic correlation identifier
- **THEN** accepted events for its frontend and native stages use that identifier while no credential, lease or original content identifier is included

#### Scenario: Malformed event arrives
- **WHEN** an input contains unknown fields, invalid levels, oversized data or unsafe metadata
- **THEN** the host rejects or removes disallowed fields according to the documented contract and does not persist the original payload

### Requirement: Diagnostic data is safe before persistence and sharing
Production and temporary verbose diagnostics MUST exclude screenshot pixels, clipboard content, document contents, filenames and absolute paths, window titles, search queries, application history, process arguments, raw provider output, network payloads, full URLs, credentials, authorization session identifiers and unrestricted exception messages or stacks. The facility SHALL accept only documented safe event fields and SHALL apply a second safety check when constructing shareable summaries.

#### Scenario: Error contains private data
- **WHEN** a native or frontend exception includes a synthetic secret, user path, document name or search query
- **THEN** the recorded event contains a controlled failure category and the forbidden value is absent from persisted logs, memory events and copied summaries

#### Scenario: Detailed mode is enabled
- **WHEN** additional Debug or Trace events are accepted during temporary verbose mode
- **THEN** the same field restrictions and redaction rules continue to apply

#### Scenario: Dependency emits a raw network error
- **WHEN** a dependency produces a log containing arbitrary URLs, headers or response content
- **THEN** that unrestricted record does not enter Zero's production diagnostic files or summaries

### Requirement: Diagnostic storage is local and bounded
The facility SHALL own only diagnostic files within canonical `~/.zero/logs/`, with user-private access where supported and without following escaping symbolic links. A persisted event SHALL be at most 4 KiB. Persistent storage SHALL contain at most one active file and five archives, each at most 4 MiB, with a total limit of 24 MiB and maximum retention of seven days. Restart and concurrent instances MUST NOT bypass these limits.

#### Scenario: Current period reaches its file budget
- **WHEN** persisted events reach the current hourly file's 4 MiB budget
- **THEN** further persistence for that period stops, bounded memory diagnostics remain available, dropped events are reported and persistence can resume in the next period

#### Scenario: Existing logs are present at startup
- **WHEN** Zero restarts with existing diagnostic files
- **THEN** existing sizes count toward the limits and expired or excess diagnostic archives are cleaned without deleting unrelated data

#### Scenario: Multiple Zero instances use the same log root
- **WHEN** another instance already owns the writer
- **THEN** a later instance reports its memory-only status rather than concurrently writing or rotating the same files

#### Scenario: Log root is an escaping link
- **WHEN** the configured canonical log root or an owned output file resolves outside the diagnostic directory through an unsafe symbolic link
- **THEN** persistence is refused, the application remains usable and the diagnostic status indicates the storage failure

### Requirement: Diagnostic processing has bounded load
Diagnostic processing SHALL use at most 200 recent in-memory events and 512 queued writer records. Queue saturation MUST NOT block UI-critical or tool operation threads. Repeated equivalent events SHALL be coalesced with observable repeat or loss counts; third-party emission SHALL additionally enforce per-plugin rate limits.

#### Scenario: Writer queue is saturated
- **WHEN** more records arrive than the writer can consume within its queue bound
- **THEN** excess records are dropped or coalesced, loss counters increase and the initiating tool continues under its existing success/error semantics

#### Scenario: Background failure repeats rapidly
- **WHEN** a source repeatedly emits the same plugin/code/outcome
- **THEN** the system limits persisted repetition and exposes the repeated-event count rather than continuously growing diagnostic state

### Requirement: Diagnostic availability does not determine tool availability
Safe collection SHALL be available before data migration and native state initialization. Initialization, disk-full, permission, writer or flush failures SHALL expose healthy, memory-only or degraded persistence status and MUST NOT terminate the application or convert successful tool work into failure. Graceful shutdown SHALL use a bounded flush interval and MUST NOT claim complete persistence after forced termination.

#### Scenario: Migration fails before windows exist
- **WHEN** the host encounters a migration or bootstrap failure after diagnostic initialization
- **THEN** an available bounded collector records a safe stage/category even if no About window or file sink exists

#### Scenario: Diagnostic disk write fails
- **WHEN** an active writer receives a permission or storage error
- **THEN** summaries report degraded persistence, safe memory collection continues and no recursive logging loop is created

#### Scenario: Graceful shutdown cannot flush everything
- **WHEN** a diagnostic flush exceeds its one-second shutdown budget
- **THEN** Zero proceeds with shutdown without claiming that all queued records reached disk

### Requirement: Diagnostic summaries are bounded read-only snapshots
Users SHALL be able to obtain a redacted summary of application/platform versions, catalog plugin identity/version/state, existing capability and health snapshots, persistence status, dropped counts and at most 50 recent warning/error events. Collection SHALL finish within a two-second total budget, identify timed-out or missing sections and produce at most 64 KiB. Collecting diagnostics MUST NOT activate tools, scan applications, discover providers, start hidden engines or perform network requests.

#### Scenario: Healthy snapshot is requested
- **WHEN** the About user requests diagnostic preview
- **THEN** the preview displays the safe summary scope, generation time, existing health state and any omissions without automatic upload or clipboard modification

#### Scenario: Snapshot source times out
- **WHEN** one health source cannot return within its allotted deadline
- **THEN** the preview includes available sections, explicitly identifies the missing section and remains within the total collection budget

#### Scenario: Disabled or uninitialized plugin is included
- **WHEN** the catalog includes a disabled or not-yet-initialized tool
- **THEN** the summary labels that state without initializing its services to gather additional information

### Requirement: Support commands enforce trusted caller and preview ownership
Global diagnostic preview, copy, clear, mode and directory actions SHALL be available only to the trusted About caller. Copy SHALL use an unexpired, caller-bound snapshot identifier and exactly its reviewed text. At most two preview snapshots of 64 KiB each SHALL be retained for five minutes; closing About or clearing logs SHALL invalidate them. External plugins and the isolated File engine MUST NOT access these global actions.

#### Scenario: Other surface requests global diagnostics
- **WHEN** a plugin window, File engine or another unauthorized caller invokes read, copy, clear, mode or directory actions
- **THEN** the host refuses the request without revealing log content or paths

#### Scenario: Caller supplies arbitrary text or path
- **WHEN** a copy or directory request supplies an unsupported text payload, foreign preview identifier or caller-selected path
- **THEN** the host rejects the request and performs no clipboard or file-manager action

### Requirement: Users can manage local diagnostic collection
The About user SHALL be able to open the fixed owned log directory, confirm clearing only diagnostic files and previews, and enable temporary verbose collection for no more than 15 minutes. Verbose mode SHALL reset on restart and MUST NOT enable the separate performance tracing facility. Clearing SHALL coordinate with the active writer and preserve all business data.

#### Scenario: User clears logs
- **WHEN** the user confirms Clear Logs
- **THEN** the system serializes cleanup with the writer, clears owned files, memory events and previews, resumes available collection and leaves registry, caches, captures and documents intact

#### Scenario: Directory open fails
- **WHEN** the log directory cannot be created or opened
- **THEN** the system returns a localized actionable failure rather than requesting another arbitrary path

#### Scenario: Verbose interval ends
- **WHEN** 15 minutes elapse or Zero restarts after verbose mode was enabled
- **THEN** normal collection resumes without persisting a permanent verbose preference
