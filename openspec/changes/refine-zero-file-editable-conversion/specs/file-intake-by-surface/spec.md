## Purpose

Give Zero File a reliable intake action in the transient tray panel and support both dragging and choosing files in the persistent main window, with one shared reviewed conversion queue.

## ADDED Requirements

### Requirement: Tray intake describes and activates native file selection
The tray File panel SHALL present file selection as its primary intake action, SHALL support native multi-file selection of PDF and DOCX, and MUST NOT instruct users to drag files into a panel that hides on external focus loss. All primary intake text and accessible names SHALL match the action in Simplified Chinese and English.

#### Scenario: Empty tray File panel
- **WHEN** users open File in the tray with an empty queue
- **THEN** the intake says “选择 PDF 或 DOCX 文件” or “Choose PDF or DOCX files”, indicates multi-selection and review before conversion, and does not show a drag invitation

#### Scenario: Keyboard activates tray intake
- **WHEN** users focus the intake and activate it with Enter or Space
- **THEN** the native PDF/DOCX multi-file picker opens and the selected valid files are added for review without starting conversion

#### Scenario: User cancels the native picker
- **WHEN** users cancel the File picker
- **THEN** the queue remains unchanged, the intake becomes usable again and no conversion error is presented

### Requirement: Main-window intake supports both dragging and choosing
The main-window File panel SHALL explicitly offer drag-and-drop and native file selection, SHALL show meaningful drag feedback, and SHALL apply the same validation and direction detection to both intake paths.

#### Scenario: User drops files into main
- **WHEN** users drag valid PDF and DOCX files onto File in the main window
- **THEN** the panel shows drop feedback, adds reviewed jobs with the opposite target formats and waits for an explicit conversion action

#### Scenario: User clicks the main intake
- **WHEN** users activate the main-window intake displaying “拖入或选择 PDF / DOCX 文件” or its English equivalent
- **THEN** the same native multi-file selection workflow opens with the same validation behavior

### Requirement: Intake preserves focus policy and shared job lifetime
Native file selection SHALL remain protected from premature tray dismissal while its dialog is active. Normal external focus loss SHALL still hide the tray. Changing visible surfaces or closing the tray MUST NOT cancel, duplicate or reorder accepted native jobs.

#### Scenario: Picker temporarily owns focus
- **WHEN** the tray opens the native File picker and transfers focus to that dialog
- **THEN** the picker workflow completes or cancels without a premature tray dismissal interrupting intake

#### Scenario: External focus hides the tray
- **WHEN** users focus another application without an active protected native dialog
- **THEN** the tray hides under the existing focus policy and the authoritative conversion queue remains intact

#### Scenario: Users move from tray to main
- **WHEN** users open main after adding or starting jobs through the tray
- **THEN** main shows the same current jobs and their states, with its drag-or-choose intake wording
