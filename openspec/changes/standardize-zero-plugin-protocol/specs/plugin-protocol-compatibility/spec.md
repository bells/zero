## Purpose

Define the observable compatibility and trust rules for Zero's new plugin manifest profile, while preserving explicit legacy behavior and keeping host, API, plugin and schema versions independent.

## ADDED Requirements

### Requirement: Manifest profiles have explicit identity and trust
The host SHALL recognize schemaVersion 2 as the public Web profile, require its documented fields, reject unknown fields and unsafe package paths, and require name and id to identify the same plugin. Third-party packages MUST NOT acquire bundled or first-party trust by declaring metadata. Contribution identifiers SHALL be unique and scoped to their plugin, and all command, view, shortcut and activation references SHALL resolve within that plugin.

#### Scenario: A well-formed Web package is inspected
- **WHEN** a package declares schemaVersion 2, webview runtime, a safe packaged HTML main and valid contribution references
- **THEN** the host returns a normalized manifest and a separate compatibility result without executing plugin code

#### Scenario: A package claims privileged identity
- **WHEN** an external package claims runtime bundled, a reserved zero.* identity without the applicable first-party verification, or first-party conversion authority
- **THEN** the host rejects the claim and does not grant native privileges

#### Scenario: A contribution or entry is invalid
- **WHEN** a manifest contains an unknown field, unresolved command reference, duplicate contribution, URL entrypoint, traversal or escaping symlink
- **THEN** the host rejects it with a field-specific diagnostic before activation

### Requirement: Compatibility uses specified SemVer semantics
The host SHALL independently check plugin version validity, host engines and API engines using SemVer 2.0.0 versions and the documented range subset. Version ranges SHALL support complete exact versions, caret, tilde and whitespace-separated AND comparators, require an upper bound for v2 and reject unsupported syntax. Stable ranges MUST exclude prereleases unless a comparator explicitly opts into that prerelease core. Build metadata MUST NOT change precedence.

#### Scenario: Compatible versions differ from the manifest text
- **WHEN** a host supporting API 1.2.0 and host 0.2.3 evaluates engines.api ^1.0.0 and engines.zero >=0.2.0 <0.3.0
- **THEN** both ranges pass without requiring string equality

#### Scenario: A breaking host version is installed
- **WHEN** host 0.3.0 evaluates engines.zero ^0.2.0
- **THEN** it refuses activation and reports the actual host version and required range

#### Scenario: Prerelease and build metadata are checked
- **WHEN** API 1.1.0-beta.1 is checked against ^1.0.0 or API 1.0.0+build7 is checked against 1.0.0
- **THEN** the prerelease is rejected and the build-metadata version matches

#### Scenario: Versions or ranges are malformed
- **WHEN** version 01.2.3, 1.0.0-, 1.0.0-a..b, range ^1.0, wildcard *, OR syntax or an unbounded v2 range is supplied
- **THEN** validation fails consistently across authoring tools and host checks

### Requirement: Every activation boundary revalidates compatibility
The host SHALL evaluate schema, host API, platform, runtime and permission support during install, startup discovery, enable and session activation. An incompatible record SHALL remain recoverable and visible to management, but MUST NOT execute or become ready merely because enabled is requested. Diagnostics SHALL distinguish required and actual versions and unsupported capabilities without automatically downgrading the protocol.

#### Scenario: An installed plugin becomes incompatible after upgrade
- **WHEN** the host starts or enables a plugin whose engines no longer match
- **THEN** the plugin remains inactive with an actionable diagnostic while host settings and other plugins remain available

#### Scenario: Platform metadata exceeds runtime capability
- **WHEN** a manifest declares a platform but a requested operation or runtime provider is unavailable there
- **THEN** the host returns an unsupported capability result rather than claiming that the operation works

### Requirement: Legacy adaptation preserves data and authority
The host SHALL parse manifests without schemaVersion through an explicit legacy profile, preserve canonical identity and existing data, accept engines.ztool as an alias only when engines.zero is absent, and keep legacy API string 1 distinct from the new API 1.0.0 contract. Adaptation MUST NOT increase permissions, rewrite signed engine payloads or imply SDK conformance.

#### Scenario: A legacy plugin is discovered
- **WHEN** a package without schemaVersion declares engines.api 1 and engines.ztool
- **THEN** it is identified as legacy, its host range is normalized for evaluation and its original package and approved grants are preserved

#### Scenario: Both host aliases exist
- **WHEN** a legacy manifest contains both engines.zero and engines.ztool
- **THEN** engines.zero is authoritative and no contradictory combined range is invented

#### Scenario: A signed File package is inspected
- **WHEN** its metadata is adapted for catalog display
- **THEN** signature and engine approval checks still use the established signed payload semantics and no new approval is inferred

### Requirement: Public permission grants are bounded and versioned
Public Web v1 SHALL expose only the documented ui.message, storage.plugin and network operations. Network permission SHALL require explicit HTTPS origins and remain subject to host redirect, address, timeout and byte limits. Grants SHALL be bound to plugin identity, package digest and approved scopes. Unknown permissions, missing providers and requests outside grants MUST fail explicitly.

#### Scenario: An update adds access
- **WHEN** an update changes its package digest and adds permissions or network origins
- **THEN** the host requires approval for the proposed package and access changes before enabling them and preserves the previous working version if declined

#### Scenario: A known method has no implementation
- **WHEN** an authorized plugin calls a method whose provider is unavailable
- **THEN** it receives an api.unavailable failure rather than a successful undefined result

#### Scenario: A network redirect escapes the grant
- **WHEN** a request redirects to a private address or an origin outside its approved scope
- **THEN** the host rejects that hop and does not expose the response

### Requirement: Package intake is bounded before activation
Package download and extraction SHALL enforce documented byte and entry limits while processing data, verify expected market package digests before activation, and remove failed staging artifacts. Local package approval SHALL bind to the computed package digest. Package intake MUST NOT execute installation scripts.

#### Scenario: A server streams an oversized package
- **WHEN** a response without a trustworthy Content-Length exceeds the compressed package limit
- **THEN** the host stops reading at the limit, cleans staging and leaves the active registry unchanged

#### Scenario: Extracted content exceeds its bound
- **WHEN** the package expands beyond cumulative output or entry-count limits, or its expected digest does not match
- **THEN** the host rejects it before activation and removes only that operation's staging data
