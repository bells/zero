## ADDED Requirements

### Requirement: Tray geometry is controlled by a restricted host boundary
The system SHALL apply content-driven tray geometry through a host-owned boundary that accepts layout requests only from the tray surface, validates finite positive dimensions and current layout sessions, and constrains size and placement to host policy. Plugin content SHALL NOT choose a target native window, monitor bounds or arbitrary position.

#### Scenario: Valid current tray request
- **WHEN** the current tray layout session submits its desired content height
- **THEN** Rust applies bounded geometry and returns the accepted generation and applied height

#### Scenario: Unauthorized or invalid request
- **WHEN** another window calls the layout boundary or a request contains invalid dimensions, an obsolete session or an older generation
- **THEN** the request cannot change native geometry and returns a typed failure or an explicitly stale response

#### Scenario: Native operation fails
- **WHEN** the native size or placement operation fails
- **THEN** the last usable panel geometry is retained or restored and the frontend receives a typed error without an unbounded retry loop

#### Scenario: Full workspace remains independent
- **WHEN** a plugin is opened in the standalone main window
- **THEN** tray content-height limits do not constrain the main workspace
