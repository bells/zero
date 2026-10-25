## Purpose

Make screenshot startup measurable through the first usable frozen image, while ensuring that pointer movement is never needed to reveal capture.

## ADDED Requirements

### Requirement: Capture reveals independently of pointer input
After a supported trigger, capture SHALL reveal a decoded frozen image and accept selection without further mouse movement. It MUST NOT count an empty or stale overlay as ready.

#### Scenario: Pointer remains stationary
- **WHEN** the user starts capture from menu, shortcut or main and does not move the pointer
- **THEN** the current frozen capture becomes visible and selectable automatically, or a bounded explicit failure is shown

### Requirement: Startup evidence covers the whole interaction
Measurements SHALL distinguish first/repeated captures and entry points, including native preparation, media readiness and reveal. Diagnostics MUST contain only fixed phase identifiers and approved numeric metadata, never user content or identifying window metadata. Optimization claims MUST distinguish native measurements, mocks, builds and unexecuted device checks.

#### Scenario: Compare startup before and after a change
- **WHEN** capture performance is reported
- **THEN** evidence names the build/platform, entry point, pointer condition, timing boundaries and missing checks
