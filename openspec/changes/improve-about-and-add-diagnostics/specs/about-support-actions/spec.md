## Purpose

Provide an accessible dedicated Zero About surface that identifies the installed application and gives users explicit project and support actions. Users can open trusted links, locate local logs and preview diagnostic information without disrupting their current tool or silently sharing data.

## ADDED Requirements

### Requirement: About identity reflects the running application
The About surface SHALL display Zero identity, the running application's actual package version, runtime information and plugin count. Detailed plugin state counts SHALL be secondary and localized, while About SHALL remain separate from tool content.

#### Scenario: Installed version changes
- **WHEN** the user opens About after installing a different Zero version
- **THEN** the displayed version matches the running package metadata without requiring a separately edited UI version string

#### Scenario: Plugin details are expanded
- **WHEN** the user expands plugin details
- **THEN** the surface shows localized state counts from the current catalog and preserves the selected tool context in other surfaces

### Requirement: Project actions open fixed trusted destinations
The About surface SHALL offer GitHub and Website actions that open `https://github.com/bells/zero` and `https://www.usezero.cn/` through the native external opener. These actions MUST NOT accept a caller-supplied URL or navigate the tool WebView away from Zero.

#### Scenario: User opens the project repository
- **WHEN** the user activates GitHub
- **THEN** the system requests the fixed repository URL in the external browser and leaves Zero's current surfaces intact

#### Scenario: User opens the future website
- **WHEN** the user activates Website
- **THEN** the system opens the configured usezero.cn destination without claiming that the website is complete or performing a background connectivity probe

#### Scenario: External opener fails
- **WHEN** the operating system cannot open a project destination
- **THEN** the initiating action displays a localized retryable error while local diagnostics remain usable

### Requirement: About provides explicit local support actions
The About surface SHALL expose Open Log Directory, Copy Diagnostics and Report Issue as a support group. Diagnostic preview, refresh, clear and temporary verbose controls SHALL be reachable in its expandable diagnostic details without introducing another top-level tool or window.

#### Scenario: User requests diagnostic copy without a preview
- **WHEN** the user first activates Copy Diagnostics before a preview exists
- **THEN** the system generates and expands a redacted preview, explains its content scope and waits for an explicit copy action before writing the clipboard

#### Scenario: User copies a reviewed snapshot
- **WHEN** the user activates copy for a valid displayed preview
- **THEN** the clipboard receives exactly that preview's text and the UI announces localized success

#### Scenario: Preview expired or collection failed
- **WHEN** the displayed snapshot has expired or a new preview cannot be generated
- **THEN** the system requests refresh or shows a localized failure and does not replace the clipboard with unreviewed or empty text

### Requirement: Issue reporting keeps submission under user control
Report Issue SHALL open the fixed repository issue-creation chooser. It MUST NOT automatically submit an issue, upload logs or include diagnostic content in the destination query string.

#### Scenario: User reports an issue
- **WHEN** the user activates Report Issue
- **THEN** the external browser opens `https://github.com/bells/zero/issues/new/choose` and the user chooses whether to paste or submit diagnostic information

### Requirement: Support UI remains accessible at compact sizes
All About labels, state counts and feedback SHALL support Chinese and English. Actions SHALL have visible keyboard focus, logical tab order, accessible names, at least 40 CSS-pixel target height and local pending/success/error announcements. All content SHALL remain reachable through reflow or internal scrolling at the supported minimum window size and increased text scale.

#### Scenario: Compact About surface
- **WHEN** About is rendered at its minimum supported dimensions or enlarged text scale
- **THEN** grouped actions reflow as needed and diagnostic actions remain reachable without horizontal clipping or overlap

#### Scenario: Keyboard operation and asynchronous feedback
- **WHEN** the user tabs to and activates a support action while an operation is pending
- **THEN** focus remains visible, unsafe duplicate activation is prevented and completion or failure is announced near the action

#### Scenario: Application language changes
- **WHEN** the resolved language becomes Chinese or English
- **THEN** About identity descriptions, detailed counts, support actions and diagnostic feedback use the resolved language
