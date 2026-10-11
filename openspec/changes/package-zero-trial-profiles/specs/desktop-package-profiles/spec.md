## ADDED Requirements

### Requirement: Compile selected package profiles

The host SHALL provide core without bundled tools and standard with only Awake, Paper, Snap and Launch. Excluded tool modules SHALL be absent from the compiled frontend and native tool command registrations, startup tasks and state. Both profiles SHALL omit File engine assets. The default development build SHALL retain five tools.

#### Scenario: Build core and standard from one revision

- **WHEN** core and standard are built for the same platform and architecture
- **THEN** core exposes no bundled tools and standard exposes exactly four tools, with neither containing File engine resources

### Requirement: Preserve data across profile changes

The host SHALL retain application identifier and storage paths. Registry records for excluded first-party tools SHALL remain persisted but unavailable in the running profile. Restore SHALL only restore compiled bundled modules.

#### Scenario: Replace full with core and then restore full

- **WHEN** an existing five-tool registry is opened and saved by core
- **THEN** core exposes none of those tools and the saved registry retains their enabled state and data for subsequent full builds

### Requirement: Produce downloadable measured trial artifacts

Packaging SHALL name installers by version, profile, platform, architecture and format. It SHALL report byte sizes and SHA-256 for each installer, and installed macOS app bytes separately. A manual GitHub Actions run SHALL expose downloadable artifacts without creating a version tag or publishing a Release. A version-tag run SHALL attach both profiles to a Draft Release and SHALL reject replacement of published release assets.

#### Scenario: Compare manual build downloads

- **WHEN** a manual workflow builds both profiles
- **THEN** each supported platform/architecture has distinct core and standard downloads with size and checksum reports

#### Scenario: Tag differs from application version

- **WHEN** a version tag does not match package, Tauri and Cargo version
- **THEN** packaging fails before uploading installers
