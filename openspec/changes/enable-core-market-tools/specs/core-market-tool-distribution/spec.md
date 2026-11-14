## Purpose

Allow ordinary users to install a core host and choose independently distributed tools from a market, while standard offers the same packages preinstalled. Preserve truthful compatibility, publisher identity, user choices, migration safety and per-platform release evidence throughout installation and updates.

## ADDED Requirements

### Requirement: Core supports installing tools without replacing the application
The core distribution SHALL contain no preinstalled tool packages and SHALL provide the shared native capabilities needed by packages it declares compatible. Users SHALL be able to install a compatible tool from the market and use its declared functionality without replacing core with standard.

#### Scenario: Fresh core installation
- **WHEN** a user starts a fresh core installation
- **THEN** the tool workspace shows no installed tools and provides a market entry point
- **AND** no absent tool registers shortcuts, status items, indexing, schedules or tool windows

#### Scenario: Install and use a compatible tool
- **WHEN** the user chooses a released compatible tool and approves its declared permissions
- **THEN** the system verifies and installs that package, exposes its declared contributions and executes its supported native function through the host
- **AND** no application replacement or installation of another tool is required

### Requirement: Standard preinstalls the same independently distributed packages
Standard SHALL use the same package bytes, versions, permission checks and runtime contracts as market installations of its preinstalled Snap, Awake, Paper and Launch tools. Preinstallation origin SHALL NOT grant additional native privileges. Explicit restoration SHALL use verified available preinstalled packages without downgrading an installed newer version.

#### Scenario: Compare standard and market installation
- **WHEN** the same tool version is supplied by standard and installed from the market into core
- **THEN** both use the same package digest and expose the same supported functionality and permission boundary

#### Scenario: Restart after uninstalling a preinstalled tool
- **WHEN** the user uninstalls a standard preinstalled tool and restarts Zero
- **THEN** the tool remains uninstalled until the user explicitly chooses installation or restoration

#### Scenario: Restore when a newer package is installed
- **WHEN** the user restores preinstalled tools and an installed tool is newer than the available preinstalled package
- **THEN** restoration preserves the newer package and the user's configuration

#### Scenario: Replace core with standard
- **WHEN** a user replaces core with standard after making tool installation choices
- **THEN** the application preserves those choices and offers an explicit action for additional recommended tools rather than automatically overwriting them

### Requirement: Packages declare and enforce actual host capabilities
Package compatibility SHALL include host version, API version, platform and required native capability version ranges. Incompatible entries SHALL explain the missing requirement and SHALL NOT execute. Market listing or successful package validation SHALL NOT override compatibility or runtime release gates.

#### Scenario: Old core lacks a required provider
- **WHEN** a package requires a capability absent from an installed host such as an older 0.1.0 core build
- **THEN** installation or activation is refused with required-versus-actual details and host-upgrade guidance
- **AND** the system does not claim the tool is ready or download native host code as an implicit workaround

#### Scenario: Capability version is incompatible
- **WHEN** a host provides a capability outside the package's declared supported range
- **THEN** the system reports that incompatibility before activating the package

### Requirement: Official market packages have verified identity and real release artifacts
An installable official market entry SHALL identify an existing versioned package, its SHA-256, supported platforms, permissions and verifiable publisher signature binding the tool ID, version and digest. Reserved official IDs SHALL only be installed with publisher authority recognized by the host. Publisher verification SHALL NOT authorize undeclared or unapproved permissions.

#### Scenario: Package claims an official identity without authority
- **WHEN** an imported or downloaded package claims a reserved official ID without a valid authorized publisher signature
- **THEN** installation is rejected without changing installed tools or user data

#### Scenario: Package bytes differ from signed digest
- **WHEN** a downloaded or offline-imported official package does not match its signed digest
- **THEN** the package is rejected and staging is cleaned up without replacing the current version

#### Scenario: File engine has not passed approval
- **WHEN** a File tool version requires an engine package lacking the existing required signature or release approval
- **THEN** that tool and engine combination is not offered as ready for use and cannot bypass the engine policy through ordinary plugin installation

#### Scenario: Market is offline or has no released packages
- **WHEN** the market cannot be refreshed or has no actual released packages
- **THEN** Zero remains usable and explains the offline or empty state without fabricating download candidates

### Requirement: Updates and migration preserve individual tool state
Installing, updating or migrating a tool SHALL preserve other tools and user data. Failed updates SHALL recover the previous verified package, approved grants and enabled intent. Market refresh SHALL NOT silently install, downgrade, enable or remove tools. App identity, stable tool IDs, stored configuration and shortcut overrides SHALL survive the transition from static tools.

#### Scenario: New package fails its readiness check
- **WHEN** a tool update commits a candidate package that fails activation readiness
- **THEN** the system restores the previous verified package and lifecycle intent and reports the failure
- **AND** unrelated tools continue to operate

#### Scenario: Old static record lacks an installed package
- **WHEN** new core reads a previous static tool record without a verified compatible package
- **THEN** it preserves that tool's configuration and enabled intent, reports that installation is needed and does not activate nonexistent or legacy static code

#### Scenario: Ambiguous historical absence
- **WHEN** migration cannot distinguish a previously uninstalled tool from one never present in a prior profile
- **THEN** it preserves data and requires explicit installation instead of assuming the user wanted restoration

#### Scenario: Restart during package migration
- **WHEN** Zero exits during a migration or update transaction
- **THEN** the next start recovers a consistent committed state or previous verified state without deleting user data or presenting a half-installed package as ready
