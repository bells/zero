## Purpose

Keep each desktop tool independently buildable, distributable, configurable and removable while allowing it to use controlled shared host capabilities. Independence includes business ownership, resource isolation and versioned contracts, rather than merely placing static tool code in different directories.

## ADDED Requirements

### Requirement: Each tool owns its package and domain behavior
Each tool SHALL own its manifest, interface, domain rules, workflows, settings and migrations, localization, static resources, version, build entry and tests. A tool SHALL build from its own source, the public SDK and declared versioned library dependencies without requiring another tool's source or the application's private modules. Installing one tool SHALL NOT require installing a peer tool.

#### Scenario: Build one tool independently
- **WHEN** an author builds one tool with its source, public SDK and locked declared dependencies
- **THEN** the build produces that tool's valid versioned package without compiling or embedding another Zero tool

#### Scenario: Update one tool's domain behavior
- **WHEN** one tool changes domain behavior while continuing to use supported host capabilities
- **THEN** it can be released and installed independently without rebuilding or replacing other tools or the host

#### Scenario: Tool imports a private implementation
- **WHEN** a tool imports a peer tool or a private host implementation instead of a declared public contract
- **THEN** package verification rejects that build boundary violation before distribution

### Requirement: Native access uses explicit versioned permissioned capabilities
Tools SHALL access native functions only through explicit public contracts with matching cross-boundary types, stable capability versions and declared permissions. The host SHALL remain authoritative for system resources, execution state, resource limits and lifecycle cleanup. A plugin name or installation origin SHALL NOT enable unrestricted native commands or dynamically load Rust code.

#### Scenario: Approved plugin invokes a supported capability
- **WHEN** a live plugin session requests an available capability with valid arguments and approved permissions
- **THEN** the host executes the bounded operation under that session's resource ownership and returns a typed result or explicit error

#### Scenario: Plugin invokes undeclared or revoked capability
- **WHEN** a plugin lacks a required grant or its session has been disabled or replaced
- **THEN** the request is refused before side effects and cannot obtain authority by claiming another tool's identity

#### Scenario: Domain policy differs between tools
- **WHEN** tools choose different workflows or default rules over the same system capability
- **THEN** their package-owned policies remain independent and the shared host capability does not select business behavior by hardcoded tool identity

### Requirement: Tool lifetime is independent from its interface lifetime and peer tools
Native work SHALL have explicit tool and generation ownership independent of a tool window. Closing a window SHALL preserve intentionally persistent approved work. Disabling or uninstalling a tool SHALL revoke new requests and clean up its owned native resources under bounded policies without stopping another tool's resources. Late work from a revoked generation SHALL NOT commit side effects.

#### Scenario: Hide Awake while a power lease is active
- **WHEN** the user closes or hides Awake's interface while its approved keep-awake task is active
- **THEN** the task continues under host ownership until expiry, cancellation, disable or uninstall

#### Scenario: Disable one tool while another is running
- **WHEN** the user disables one installed tool while a peer tool has an active task
- **THEN** the disabled tool loses its contributions, sessions and owned background resources
- **AND** the peer task and its resources continue unaffected

#### Scenario: Late response after an update
- **WHEN** an operation from a replaced plugin generation completes after revocation
- **THEN** it cannot commit a result or regain current tool resources

### Requirement: Scheduled plugin business work remains package owned
The host SHALL schedule approved plugin events independently of visible tool windows and SHALL execute the package's declared background entry under a bounded isolated session when needed. The scheduler SHALL NOT implement individual tools' business rules. Background execution SHALL use live permissions and SHALL NOT display approval dialogs or silently expand grants.

#### Scenario: Daily Paper event with no visible interface
- **WHEN** an enabled Paper schedule becomes due while its interface is closed
- **THEN** the host wakes Paper's package-owned background entry to perform the approved wallpaper workflow
- **AND** the bounded background session is released after completion, failure or cancellation

#### Scenario: Scheduled execution times out
- **WHEN** a background occurrence exceeds its execution limit
- **THEN** the host revokes its session, reports the timeout and prevents late commits without leaving plugin JavaScript permanently running

#### Scenario: Recover a scheduled occurrence after restart
- **WHEN** the host recovers an incomplete scheduled occurrence after a process interruption
- **THEN** retries retain its occurrence identity and provider side effects are protected against duplicate commit
- **AND** missed occurrences are coalesced rather than triggering unbounded replay

#### Scenario: Disabled scheduled tool
- **WHEN** a scheduled tool is disabled or uninstalled before its next event
- **THEN** its background entry is not invoked and other tools' schedules remain active

### Requirement: Five tools retain supported functionality after package migration
Awake, Paper, Launch, Snap and File SHALL each have an independent package migration and verification result. Packaged behavior SHALL retain the existing supported platform boundaries, user configuration and protected data flows. A source build or install success SHALL NOT be reported as evidence of native functional acceptance.

#### Scenario: Use Snap from a core-installed package
- **WHEN** a compatible Snap package is installed on macOS
- **THEN** capture, supported editing, copy/save and pin workflows operate through authorized media and window ownership
- **AND** Windows support remains accurately limited to its supported system screenshot flow until separately implemented and verified

#### Scenario: Use Launch from a core-installed package
- **WHEN** a compatible Launch package searches and activates an application
- **THEN** it uses host-issued indexed identities and does not supply arbitrary paths, commands or URIs for execution

#### Scenario: Use Paper from a core-installed package
- **WHEN** a compatible Paper package downloads and applies wallpaper
- **THEN** the operation respects approved network scope, cache limits, cancellation and wallpaper file ownership

#### Scenario: Use File from a core-installed package
- **WHEN** File is offered for a platform with an approved compatible engine
- **THEN** real conversion, cancellation, engine leases and output verification retain that platform's supported behavior and engine approval boundary

#### Scenario: Partial migration completion
- **WHEN** only some tools or platforms have passed native package acceptance
- **THEN** release records identify exactly those verified combinations and the overall five-tool migration remains incomplete
