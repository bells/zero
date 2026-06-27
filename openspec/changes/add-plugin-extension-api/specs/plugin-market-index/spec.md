## ADDED Requirements

### Requirement: Market index is loaded from a preset GitHub-hosted JSON source
The system SHALL support a preset `market.json` URL that describes available plugins without requiring a custom marketplace backend.

#### Scenario: Market refresh succeeds
- **WHEN** the user refreshes the plugin market and the preset `market.json` URL returns a valid index
- **THEN** the system stores a market snapshot and displays the listed plugins as install candidates

#### Scenario: Market refresh fails
- **WHEN** the preset `market.json` URL cannot be reached or returns invalid JSON
- **THEN** the system keeps the app usable and shows a market refresh error without changing installed plugins

#### Scenario: Cached market snapshot exists
- **WHEN** market refresh fails after a previous valid market snapshot was cached
- **THEN** the system MAY show the cached snapshot with a stale/offline indicator

### Requirement: Market entries point to GitHub Release plugin packages
The system SHALL model each market plugin entry as metadata that includes plugin identity, version, author, repository URL, release URL, download URL for a `.zplugin` asset, permissions, and optional checksum.

#### Scenario: Market entry has valid release metadata
- **WHEN** a market entry includes required plugin metadata, a GitHub repository URL, a release URL, and a `.zplugin` download URL
- **THEN** the system can present that entry to the user with install information

#### Scenario: Market entry is missing download URL
- **WHEN** a market entry omits the release asset download URL
- **THEN** the system marks that market entry invalid and MUST NOT offer install for it

#### Scenario: Market entry includes checksum
- **WHEN** a market entry includes a checksum for the release asset
- **THEN** the system uses that checksum to verify the downloaded package before installation

### Requirement: Users can install plugins from the market
The system SHALL allow users to install a market-listed plugin by downloading its `.zplugin` release asset, validating it, and passing it through the normal plugin lifecycle install flow.

#### Scenario: Install market plugin succeeds
- **WHEN** the user selects install for a valid market entry and accepts its requested permissions
- **THEN** the system downloads the `.zplugin` asset, validates its checksum when provided, validates its `manifest.json`, extracts it under `~/.ztool/plugins/`, persists its registry record, and shows it in plugin navigation

#### Scenario: Download fails
- **WHEN** the release asset download fails
- **THEN** the system leaves the registry unchanged and surfaces a download error to the user

#### Scenario: Checksum verification fails
- **WHEN** the downloaded release asset checksum does not match the market entry checksum
- **THEN** the system rejects the package, deletes the failed download or staging files, and leaves the registry unchanged

#### Scenario: Manifest and market metadata disagree
- **WHEN** the downloaded package manifest name, version, or author conflicts with the selected market entry
- **THEN** the system rejects the install unless a future trusted update/alias policy explicitly allows the mismatch

### Requirement: Git-based market does not require backend marketplace features
The system SHALL keep the MVP market limited to static index discovery and GitHub Release asset installation.

#### Scenario: User browses MVP market
- **WHEN** the user opens the plugin market in the MVP
- **THEN** the system shows plugins from the static `market.json` index without requiring login, accounts, ratings, reviews, or paid marketplace services

#### Scenario: Market source has no search API
- **WHEN** the static market index contains multiple plugins
- **THEN** the system can filter the loaded snapshot locally without calling a backend search service
