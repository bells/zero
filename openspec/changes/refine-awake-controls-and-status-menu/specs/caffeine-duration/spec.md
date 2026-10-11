## MODIFIED Requirements

### Requirement: Frontend presents duration controls and time feedback
The system SHALL present surface-appropriate duration controls in the caffeine panel and show elapsed/remaining time feedback for the active session. Tray and main-window panels SHALL use one clear tool title, one current-state indication, and concise timing information without the POWER eyebrow or repeated normal-status explanatory sentences. Tray panels SHALL stay compact without a dial. Main-window panels SHALL fill the available workspace and retain a static circular elapsed-time display with fuller controls, sharing authoritative session behavior with the tray. In the default 400 by 500 logical pixel tray and the supported default/minimum main-window layouts, normal inactive, finite, and no-limit states SHALL expose all duration choices and the complete enable/disable action without requiring vertical scrolling in Chinese and English. Errors SHALL remain visible and accessible without making the primary action unreachable.

#### Scenario: Caffeine mode is inactive
- **WHEN** the caffeine panel is shown while caffeine mode is inactive
- **THEN** the panel displays duration choices and an enable action
- **AND** it shows normal-sleep status, zero elapsed time, and the selected pending duration without repeating that Zero Awake is off

#### Scenario: Finite caffeine mode is active
- **WHEN** caffeine mode is active with a finite duration
- **THEN** the panel displays the selected duration, elapsed time, remaining time, and a disable action
- **AND** remaining time and elapsed time each appear once per surface with a meaningful label and the primary action is visible in the normal first viewport

#### Scenario: No-limit caffeine mode is active
- **WHEN** caffeine mode is active with no time limit
- **THEN** the panel displays no-limit status, elapsed time, and a disable action
- **AND** it does not repeat keep-awake explanatory sentences or imply a finite deadline

#### Scenario: Tray displays a normal session
- **WHEN** the Awake panel is selected in the default 400 by 500 tray with its normal host navigation and bottom actions in Chinese or English
- **THEN** all eight duration presets and the complete enable/disable button are visible without scrolling, clipping, or obscuring the host actions

#### Scenario: Main window displays Awake
- **WHEN** Awake is opened in the default 920 by 660 or minimum 760 by 520 main window with either sidebar mode
- **THEN** its single title, circular elapsed-time display, current duration, finite remaining time, duration presets, and primary action remain visible; the panel uses the full available workspace width and height instead of a tray-sized maximum width

#### Scenario: Error or enlarged text consumes extra space
- **WHEN** a command fails or enlarged text requires more room than the normal layout
- **THEN** the panel displays a localized accessible error when applicable and supports scrolling or reflow while retaining a reachable primary action and all duration choices

#### Scenario: User operates controls by keyboard or touch
- **WHEN** the user focuses or activates a duration option or the primary action
- **THEN** the control provides a meaningful localized name, visible focus, a non-color-only selected or current-state indication, and busy feedback that prevents duplicate actions
- **AND** the primary action has at least a 44 logical pixel target height and duration options have at least 36 logical pixels, increased to 44 for touch layouts
