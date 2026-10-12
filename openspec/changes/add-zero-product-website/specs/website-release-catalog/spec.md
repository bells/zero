## Purpose

为官网提供与真实公开发行产物一致的版本、平台、架构和工具配置目录，让用户选择适合的包、了解安装条件，并在尚无公开下载时获得明确可靠的试用说明。

## ADDED Requirements

### Requirement: Verified and versioned package catalog
The website SHALL identify each advertised package by version, channel, release visibility, build profile, included tools, operating system, architecture, installer format and verification date. Directly downloadable packages MUST have a matching public Zero release asset, exact download size and SHA-256, with signing or notarization conditions stated accurately.

#### Scenario: Published package is advertised
- **WHEN** a verified public release asset is present in the catalog
- **THEN** the download page displays its version, profile, included tools, platform, architecture, installer format, download size and checksum
- **AND** the direct link identifies that exact asset and shows applicable trial or signing conditions

#### Scenario: Inconsistent catalog data is supplied
- **WHEN** package data lacks required metadata or contradicts its declared profile or platform
- **THEN** website validation fails instead of rendering an apparently valid download choice

### Requirement: Package selection is explicit and safe
The website SHALL let visitors explicitly select operating system and available architecture/profile choices. Platform hints MUST NOT trigger downloads or infer processor architecture, and changing platform MUST remove stale incompatible package selections.

#### Scenario: Visitor changes operating system
- **WHEN** a visitor changes from macOS to Windows
- **THEN** only catalogued Windows package choices and their actual links are offered
- **AND** previous macOS architecture and asset selections do not remain active

#### Scenario: Platform or architecture is unknown
- **WHEN** a visitor's platform is unknown or the visitor uses Linux or a mobile browser
- **THEN** the page allows browsing all actually available desktop packages and explains current platform availability
- **AND** it does not start a download or silently choose Apple Silicon versus Intel

### Requirement: Profile and tool availability consistency
The website SHALL recommend standard for ordinary tool use only when a suitable public standard package exists, and SHALL describe core as containing no bundled tools. The set of delivered features MUST match the selected package rather than the full development configuration.

#### Scenario: Standard and core are both available
- **WHEN** a visitor compares standard and core for the same platform
- **THEN** standard lists its actual bundled tools and core clearly lists none
- **AND** File is not listed as included in a standard package that excludes it

### Requirement: Honest unavailable and trial states
The website SHALL show usable repository/release or trial-instruction links when no suitable public package exists. Draft releases, expiring authenticated build artifacts and unavailable assets MUST NOT be offered as ordinary stable direct downloads.

#### Scenario: Only draft or build artifacts exist
- **WHEN** the repository has no verified public release asset for the requested platform
- **THEN** the page states that no public package is currently available for that choice and links to actual trial or release information
- **AND** any build-artifact instructions explain login and expiry constraints

#### Scenario: One platform has no package
- **WHEN** another platform has a public package but the visitor's chosen platform does not
- **THEN** the selected platform displays its unavailable state without redirecting to an incompatible installer

### Requirement: Reliable downloads without runtime API dependency
Essential download and trial information SHALL be present in the static page and MUST NOT depend on client-side GitHub API requests. Maintained direct download links SHALL use HTTPS and permitted public Zero release destinations, and link verification failures MUST be reported before a catalog update is accepted for publication.

#### Scenario: GitHub API is unavailable
- **WHEN** a visitor's browser cannot access the GitHub API or has no API credentials
- **THEN** the website still displays its catalogued version and usable download or trial links

#### Scenario: Asset link is invalid at publication verification
- **WHEN** a catalog update references a missing, private, draft or mismatched release asset
- **THEN** publication verification reports the failed entry and the update is corrected or the affected package is marked unavailable
- **AND** a broken asset is not accepted as a valid ordinary download
