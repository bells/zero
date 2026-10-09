## Purpose

Provide a full settings view within Zero's existing main window so users can adjust preferences, navigate categories, and return to their tools without managing an additional native window or losing working context.

## ADDED Requirements

### Requirement: Preferences uses the existing main window
The system SHALL display preferences as a full settings view in main with a visible settings identity and return-to-tools action. Preferences SHALL NOT open as a separate native window or modal overlay. All existing preferences entry points SHALL reach this same view.

#### Scenario: Open preferences from main
- **WHEN** the user activates preferences in main
- **THEN** that same native window displays settings without opening an additional window

#### Scenario: Open preferences from tray with no main window
- **WHEN** the user activates tray preferences and main has not yet been created
- **THEN** main opens focused in settings, the tray hides, and the settings destination is delivered after the view is ready

#### Scenario: Reopen preferences while main exists
- **WHEN** a user opens preferences from an external shell entry point while main is hidden or displaying a tool
- **THEN** the existing main is shown and focused in settings without creating a duplicate settings window

#### Scenario: Rapidly request different main destinations
- **WHEN** tools and settings requests arrive before main finishes initialization
- **THEN** the latest requested destination is shown without an older delayed request replacing it

### Requirement: Settings retains categories search and immediate feedback
The system SHALL reuse existing General, Status Bar, Keyboard Shortcuts, Tools, per-tool, and Extensions destinations, localized search, immediate-apply behavior, and contextual pending/saved/error feedback. Regular widths SHALL display a settings category sidebar and the selected content pane; constrained widths SHALL retain a usable navigation-to-content flow and distinguish returning to categories from returning to tools.

#### Scenario: First enter settings
- **WHEN** the user first enters settings during a main window session
- **THEN** General is selected with searchable categories and the existing settings controls available

#### Scenario: Search and apply a preference
- **WHEN** the user searches a localized setting and changes it
- **THEN** its destination and control can be reached and the same immediate save or error feedback is shown

#### Scenario: Revisit settings during the session
- **WHEN** the user returns to settings after using tools in the same main session
- **THEN** the previous settings destination and search context are retained, with unavailable destinations resolved safely

#### Scenario: Constrained window height or width
- **WHEN** main has limited width or settings content exceeds its height
- **THEN** settings navigation and content remain reachable by keyboard and scrolling and the return-to-tools action remains available

### Requirement: Leaving settings restores valid tool context
The system SHALL preserve selected tool, sidebar preference, tool input and scroll context when entering settings and restore them when returning to tools. Hidden tool views SHALL NOT continue unnecessary presentation polling. Accepted native work SHALL continue, and settings changes that invalidate the previous selection SHALL trigger the existing valid-tool fallback.

#### Scenario: Return to a tool with pending input
- **WHEN** a user enters settings from a tool with pending input and then returns to tools
- **THEN** the same tool, pending input, sidebar mode, and scroll context are restored with usable focus

#### Scenario: Background work finishes while settings is shown
- **WHEN** an accepted native job runs or completes while main displays settings
- **THEN** its state remains available on return without cancelling or restarting that job

#### Scenario: Previously selected tool becomes unavailable
- **WHEN** the user hides, disables, or removes the previously selected tool through settings and returns to tools
- **THEN** the host shows the existing valid-tool fallback without restoring a stale selection

#### Scenario: Open Zero returns to tools
- **WHEN** main displays settings and the user activates open Zero from tray
- **THEN** main is focused in its tools view and restores valid tool context
