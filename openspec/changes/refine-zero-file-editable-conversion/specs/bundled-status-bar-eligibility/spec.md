## Purpose

Keep bundled tools' native status-bar entries consistent with their declared capabilities and preferences, so users see only supported quick actions while retaining ordinary tool navigation.

## ADDED Requirements

### Requirement: Bundled status entries require an explicit contribution
The host SHALL expose native status-bar entries and fallback direct actions for bundled tools only when they explicitly declare a supported status-bar contribution. It MUST NOT synthesize a generic status entry for a bundled tool with absent or empty contributions. The primary Zero entry SHALL remain available under the existing host settings.

#### Scenario: File declares no status-bar contribution
- **WHEN** Zero loads the bundled File tool without status-bar contributions
- **THEN** File has no native status-bar cell or fallback direct action, and preferences correctly describe the missing capability

#### Scenario: Old visibility preference enables File
- **WHEN** persisted status-bar preferences contain an enabled File entry but File contributes no status-bar item
- **THEN** no File status-bar entry is created, and unrelated tool visibility choices are preserved

#### Scenario: Other bundled tools declare approved actions
- **WHEN** enabled Snap, Awake, Paper, and Launch tools declare supported status-bar contributions
- **THEN** their existing visibility, order, collapse, actions and state feedback continue to apply

#### Scenario: Installed extension retains its existing compatibility behavior
- **WHEN** an installed non-bundled extension has no explicit status-bar contribution
- **THEN** this change preserves its existing status-entry compatibility policy rather than applying the bundled-tool rule to it

### Requirement: Removing an ineligible cell preserves remaining navigation and hit regions
The system SHALL keep the status-bar preview, tooltips, highlights and click targets consistent with the currently eligible visible items. Omitting File from status-bar actions MUST NOT remove it from enabled ordinary tray/main tool navigation or supported system-search launch entries.

#### Scenario: Refresh removes a previously synthesized File cell
- **WHEN** the macOS grouped item refreshes after File becomes ineligible
- **THEN** the group has no blank File slot or stale File hover/click/highlight region and adjacent tools still receive their own actions

#### Scenario: User opens File through ordinary navigation
- **WHEN** File is enabled and visible in the host tool navigation
- **THEN** users can select File in the tray or main window and use existing supported system-search entries regardless of its lack of status-bar capability

#### Scenario: Windows uses fallback tool actions
- **WHEN** Zero renders its single-icon Windows tray and fallback actions
- **THEN** File has no synthesized direct-action button while its ordinary File navigation remains available
