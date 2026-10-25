## Purpose

Let users configure independent Snap capture and capture OCR shortcuts with reliable persistence and truthful registration state.

## ADDED Requirements

### Requirement: Independent editable Snap shortcuts
Settings SHALL support recording, clearing and resetting capture and capture OCR bindings. Capture defaults to Alt+A (Option+A on macOS); OCR defaults to unassigned. Accepted changes SHALL apply immediately and survive restart. Menus and tool descriptions SHALL reflect the effective binding. Launch remains read-only.

#### Scenario: Configure OCR and restart
- **WHEN** a user saves a valid OCR shortcut and restarts Zero
- **THEN** that binding invokes OCR rather than ordinary capture, and settings/menu display the saved value

#### Scenario: Clear or reset a binding
- **WHEN** the user clears either Snap binding or resets it
- **THEN** clear unregisters that action and reset restores its specified default, without altering the other action

### Requirement: Registration updates preserve a working binding
Zero MUST reject invalid, duplicate or unavailable bindings with a localized error, preserving the previous effective binding and persisted value. Unsupported, unassigned, disabled and conflict states SHALL be distinguishable. A registration failure MUST NOT terminate the application.

#### Scenario: New binding conflicts
- **WHEN** replacement registration fails or conflicts with another Zero action
- **THEN** the old shortcut remains usable, persistence is unchanged, and the user sees the failure

#### Scenario: Plugin is disabled
- **WHEN** Snap is disabled
- **THEN** both Snap bindings are unregistered and neither may start capture or OCR
