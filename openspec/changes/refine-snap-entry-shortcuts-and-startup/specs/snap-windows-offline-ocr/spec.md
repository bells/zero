## Purpose

Provide a Windows-specific OCR selection flow and bundled Chinese/English recognition without changing ordinary system screenshot behavior.

## ADDED Requirements

### Requirement: Windows OCR selects a frozen single display
OCR SHALL freeze the entry display, allow a selection and require explicit recognition confirmation by button or Enter. Shortcut entry uses the pointer display; Escape cancels. Ordinary Windows capture SHALL continue to launch the system tool. Windows OCR MUST NOT advertise unsupported annotation/editor actions.

#### Scenario: Select text on a secondary display
- **WHEN** the user invokes OCR on a secondary display and confirms a selection
- **THEN** recognition uses the matching frozen pixels and scale/origin, then opens an editable result in Zero

#### Scenario: Cancel selection
- **WHEN** the user presses Escape before recognizing
- **THEN** capture resources are released and the clipboard is unchanged

### Requirement: Bundled offline printed Chinese and English recognition
The Windows installation SHALL include the engine and resources required for local printed Chinese/English OCR, without Python, external OCR programs, language-pack installation or runtime downloads. Images and text MUST stay local. Missing/corrupt assets MUST fail clearly rather than claim availability.

#### Scenario: First recognition while offline
- **WHEN** an intact Windows installation recognizes a supported Chinese/English sample without a network connection
- **THEN** it returns editable text without installing additional components

### Requirement: Results and resource limits preserve existing OCR semantics
OCR SHALL preserve bounded input, worker admission, cancellation, deadlines and stale-result rejection. The result SHALL allow editing and only write the clipboard after explicit Copy. Logs MUST NOT include recognized text or screenshots.

#### Scenario: Edit before copying
- **WHEN** recognition succeeds and the user edits the text
- **THEN** Copy uses the edited result and no earlier automatic clipboard write occurs
