## Purpose

Give Zero Snap a compact native status-bar action menu consistent with Zero Awake, while preserving precise tool targeting, accessible actions and existing direct screenshot entry points.

## ADDED Requirements

### Requirement: Snap uses the native system action menu
On macOS, activating the visible Snap glyph with either mouse button SHALL present the same native menu style used by Awake's right-click menu, anchored to that exact tool on that display. The menu MUST NOT show the former large green action card, start capture merely by opening, or change other tools' menus.

#### Scenario: Snap glyph opens its action menu
- **WHEN** the user left-clicks or right-clicks Snap in the macOS status bar
- **THEN** a native menu exposes localized Screenshot and Screenshot OCR actions followed by a separator and the clearly identified existing Zero application exit action
- **AND** unrelated recording or translation placeholders are absent

#### Scenario: Keyboard and dismissal
- **WHEN** the user navigates the open menu with the keyboard or dismisses it with Escape or an outside click
- **THEN** native focus, selection and dismissal work and the Snap highlight clears without starting an action

#### Scenario: Grouped item on another screen
- **WHEN** Snap is among grouped tool glyphs on a non-primary display
- **THEN** the menu targets Snap's cell and remains usable on that display without highlighting or dispatching an adjacent tool

### Requirement: Menu actions reflect actual capability and hand off once
The menu SHALL show the registered screenshot shortcut accurately, SHALL disable OCR when the effective OCR capability is unavailable, and SHALL dispatch a selected action once after dismissing the menu and hiding peer transient surfaces. Capture failure SHALL give actionable localized host feedback without requiring the closed menu to remain visible.

#### Scenario: Customized screenshot shortcut
- **WHEN** the user changes the screenshot shortcut or disables its registration
- **THEN** the menu displays the current registered accelerator or omits it rather than displaying a hardcoded shortcut

#### Scenario: OCR is unavailable
- **WHEN** the current platform or language configuration has no usable OCR provider
- **THEN** Screenshot remains available and Screenshot OCR is disabled with an explanation available in Snap's main view

#### Scenario: Screenshot action is selected
- **WHEN** the user selects Screenshot
- **THEN** the menu and peer transient surfaces dismiss before the frozen screenshot is acquired and a single screenshot session is requested

#### Scenario: Capture startup fails
- **WHEN** permission denial or capture preparation prevents startup
- **THEN** the user receives localized recovery guidance and can retry without a partial editor or persistent pressed highlight

### Requirement: Direct and platform fallback entries remain compatible
Existing global screenshot shortcuts and main-window screenshot actions SHALL continue to start capture directly. Windows SHALL retain its system screenshot launcher; absence of the macOS menu MUST NOT imply Windows custom-overlay or OCR support.

#### Scenario: Global screenshot shortcut
- **WHEN** the registered screenshot shortcut is invoked
- **THEN** capture starts directly without first showing the Snap menu

#### Scenario: Windows screenshot entry
- **WHEN** the user starts Screenshot on Windows
- **THEN** the system launcher remains the screenshot path and unsupported OCR is reported through actual capability
