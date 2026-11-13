## Purpose

Make screenshot startup measurable through the first usable frozen image, while ensuring that pointer movement is never needed to reveal capture.

## ADDED Requirements

### Requirement: Capture reveals independently of pointer input
After a supported trigger, capture SHALL reveal a decoded frozen image and accept selection without further mouse movement. It MUST NOT count an empty or stale overlay as ready.

#### Scenario: Pointer remains stationary
- **WHEN** the user starts capture from menu, shortcut or main and does not move the pointer
- **THEN** the current frozen capture becomes visible and selectable automatically, or a bounded explicit failure is shown

### Requirement: Shortcut capture preserves the visible desktop
On macOS, capture and capture-OCR shortcuts SHALL freeze the current desktop without first hiding Zero's visible shell windows. A visible tray panel SHALL be protected from automatic blur dismissal while that capture session is active. Completion, cancellation and startup failure SHALL release this protection and restore the original visible shell interaction. Existing button and native-menu capture entry points SHALL retain their dismiss-before-capture behavior.

#### Scenario: Shortcut with Zero windows open
- **WHEN** the user triggers a Snap shortcut while the tray or main window is visible
- **THEN** those windows remain in place for the frozen capture and the tray does not dismiss when the capture overlay takes focus

#### Scenario: Finish or abandon shortcut capture
- **WHEN** a shortcut capture completes, is cancelled or fails to start
- **THEN** the original shell window can resume interaction, a previously hidden tray is not opened, and normal tray blur dismissal resumes after the capture protection is released

#### Scenario: Start from an interface action
- **WHEN** the user starts capture from a button or native menu
- **THEN** Zero dismisses its visible shell windows before freezing the desktop as before

### Requirement: Startup evidence covers the whole interaction
Measurements SHALL distinguish first/repeated captures and entry points, including native preparation, media readiness and reveal. Diagnostics MUST contain only fixed phase identifiers and approved numeric metadata, never user content or identifying window metadata. Optimization claims MUST distinguish native measurements, mocks, builds and unexecuted device checks.

#### Scenario: Compare startup before and after a change
- **WHEN** capture performance is reported
- **THEN** evidence names the build/platform, entry point, pointer condition, timing boundaries and missing checks
