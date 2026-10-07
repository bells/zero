## Purpose

Provide a verifiable runtime lifecycle for isolated Zero Web plugins, with authenticated sessions, bounded host calls, revocable resources and consistent behavior across windows, updates and uninstall operations.

## ADDED Requirements

### Requirement: Plugin activation is lazy and session scoped
Enabling a plugin SHALL register validated declarations without executing installation hooks or eagerly starting all plugin code. A declared view or command SHALL activate only its required surface session. Each session SHALL activate once and independently own its disposable UI resources; native accepted jobs SHALL retain their host-owned lifecycle.

#### Scenario: Zero starts with enabled Web plugins
- **WHEN** the user has not opened their views or invoked their commands
- **THEN** their declarations are available but their scripts and presentation timers have not started

#### Scenario: A command opens its view
- **WHEN** a user invokes an approved declared command
- **THEN** the host opens or selects the referenced view, waits for readiness and dispatches the command once within that session

#### Scenario: A native job outlives a hidden panel
- **WHEN** the user hides the associated tool UI without disabling the tool
- **THEN** presentation work pauses while the accepted native job follows its existing cancellation and completion policy

### Requirement: Isolation policies are enforced on actual loaded assets
The host SHALL load third-party package assets through a session-scoped resource route and create a dedicated native WebView tool window and enforce caller, navigation and content-security policies on the actual response. Plugins MUST NOT import into the host JavaScript realm, access unrestricted Tauri commands, directly connect to remote resources, navigate to external content or read another plugin's assets.

#### Scenario: A valid plugin surface loads
- **WHEN** an enabled compatible plugin view is opened
- **THEN** its HTML, scripts and styles load under the restricted policy and its documented host API works without broadly relaxing the host CSP

#### Scenario: A resource request crosses its boundary
- **WHEN** a plugin requests another package, an expired session asset, an encoded traversal or a remote script
- **THEN** the request is denied and other plugin surfaces remain usable

### Requirement: Bridge authorization uses current host-owned sessions
Every Bridge request SHALL be bound to a host-issued session, generation, package and trusted caller surface, checked against live enabled and approved state, and validated against its method-specific payload. Self-reported plugin names and opaque origin strings MUST NOT authorize requests. Responses SHALL correlate request IDs and have an unambiguous success or structured error result.

#### Scenario: An unrelated WebView forges a request
- **WHEN** an unrelated WebView copies a plugin identifier or sends a request on an unbound channel
- **THEN** the host rejects it without invoking native work

#### Scenario: A revoked session replies late
- **WHEN** a plugin is disabled or updated while a request is pending
- **THEN** new and late requests from the old generation fail and late responses cannot mutate the current session

#### Scenario: A request is duplicated or overloaded
- **WHEN** a session repeats an in-flight or retained request ID or exceeds documented request count or payload limits
- **THEN** it receives a bounded error and the operation is not dispatched twice within the deduplication window

#### Scenario: A request is cancelled
- **WHEN** a caller cancels or the session deadline expires
- **THEN** the caller receives a terminal cancellation or timeout, cancellable native work is stopped and uncancellable late results cannot commit through the revoked session

### Requirement: Disable and uninstall revoke resources independently of hooks
The host SHALL reject new work before deactivation, enforce bounded cooperative cleanup and revoke session ports, registrations, owned timers and resource leases even when plugin hooks fail. Native adapters SHALL apply documented per-tool cleanup. Uninstall SHALL remove packages and owned transient caches while preserving user data unless the user explicitly requests its removal.

#### Scenario: Deactivation rejects or never completes
- **WHEN** a plugin's cleanup hook fails or exceeds the deadline
- **THEN** host authorization remains revoked, host-owned resources are reclaimed and a diagnostic is reported without requiring hook success

#### Scenario: Awake or Snap is disabled
- **WHEN** the user disables Awake or Snap
- **THEN** Awake stops its native keep-awake session and expiry owner, and Snap releases its shortcut and active capture while host-owned pinned windows retain their documented lifetime

#### Scenario: A File package is in use
- **WHEN** disable, update or uninstall encounters an active engine lease
- **THEN** the host rejects new jobs, drains or cancels according to the File policy and does not delete leased assets; if draining cannot finish in time it reports a recoverable busy result

#### Scenario: Default uninstall preserves plugin data
- **WHEN** the user uninstalls without selecting data deletion
- **THEN** the package and owned transient caches are removed, persisted plugin data and user-exported files remain, and no third-party uninstall script is executed

### Requirement: Updates are atomic and recoverable
Validation, permission review and staging SHALL complete before publishing an update. Concurrent lifecycle operations SHALL not overwrite newer state. Failed validation, persistence or activation SHALL preserve or restore the previous usable package, enabled intent and grants, and interrupted commits SHALL be recoverable without deleting unrelated data.

#### Scenario: An update cannot activate
- **WHEN** the staged package passes static checks but readiness fails
- **THEN** the host restores the previous package and grants, reports the failure and does not discard the previous version's assets

#### Scenario: Two lifecycle operations race
- **WHEN** update and disable target the same installed plugin concurrently
- **THEN** the host serializes or rejects the conflicting operation and no stale result re-enables the plugin

### Requirement: Host windows converge on authoritative lifecycle state
Committed registry changes SHALL publish a monotonically increasing revision, and host windows SHALL refresh from authoritative state without accepting older revisions or relying on stale permission snapshots. A reconnecting window SHALL recover via a full snapshot.

#### Scenario: Preferences disables a plugin shown in another window
- **WHEN** the disable operation commits
- **THEN** other windows remove or deactivate the affected contributions and the native Bridge rejects old sessions independently of UI refresh timing

#### Scenario: Events are repeated or reordered
- **WHEN** a window receives repeated or older registry notifications
- **THEN** it coalesces refresh work and does not regress its visible plugin state

### Requirement: Plugin windows cannot stall host UI or inherit host commands
Main and tray contributions SHALL be launch entries for host-created standalone WebView tool windows. The native invoke entry SHALL reject application commands from plugin windows except explicitly bound Bridge commands. Host capability sets MUST NOT include plugin window labels. Host revocation and destruction deadlines MUST NOT depend on plugin JavaScript timers.

#### Scenario: A plugin sends raw privileged IPC
- **WHEN** plugin code bypasses the SDK to invoke a host application or Tauri plugin command
- **THEN** the native caller gate or capability ACL rejects it without a privileged side effect

#### Scenario: Plugin JavaScript never yields
- **WHEN** a plugin executes an unbounded script
- **THEN** the host remains responsive and can revoke and destroy the affected WebView without a cooperative plugin response; platform support requires native verification of this behavior
