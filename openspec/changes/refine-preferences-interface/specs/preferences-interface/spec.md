## Purpose

Provide a readable and compact preferences interface that clearly distinguishes application settings, per-tool settings and extension management while preserving existing setting behavior.

## ADDED Requirements

### Requirement: Distinct preferences navigation
The system SHALL distinguish application settings, tool settings and extension management with localized names. The tools overview SHALL have an explicit overview label. Extension management SHALL appear without a duplicate same-name group heading.

#### Scenario: Browse settings categories
- **WHEN** the user opens preferences in Chinese or English
- **THEN** application and tool groups have meaningful labels and the overview and extension-management destinations are unambiguous

### Requirement: Full tool names preserve identity and search
The system SHALL display full tool names such as Zero Awake and Zero Snap in navigation, detail headers and search. Navigation names SHALL NOT narrow a tool to a single current function. Destination identifiers and search focus targets SHALL remain stable.

#### Scenario: Find a bundled tool setting
- **WHEN** the user searches by a full tool title or a setting keyword
- **THEN** the same tool settings remain reachable with the original focus targets

#### Scenario: Browse an installed tool
- **WHEN** an installed tool is listed in preferences
- **THEN** its full title remains readable and selectable in navigation

### Requirement: Compact responsive settings presentation
The system SHALL use consistent readable typography, compact desktop navigation with no extra gap between destinations, larger coarse-pointer targets, visible keyboard focus and independently scrollable navigation and content. Single-section pages SHALL avoid repeating their page title as a visible section heading. Controls and actions SHALL remain reachable at reduced widths and heights.

#### Scenario: Use preferences in a short desktop window
- **WHEN** preferences is viewed at the supported minimum main-window size
- **THEN** all destinations and settings remain reachable through keyboard navigation and scrolling

#### Scenario: Use constrained or touch navigation
- **WHEN** the viewport requires a single-pane flow or a coarse pointer is in use
- **THEN** navigation retains usable targets and provides distinct return-to-settings and return-to-tools actions

#### Scenario: Read a single-section page
- **WHEN** the user opens General, Keyboard Shortcuts or Tools overview
- **THEN** the page has one visible main title and an accessible name for its settings section
