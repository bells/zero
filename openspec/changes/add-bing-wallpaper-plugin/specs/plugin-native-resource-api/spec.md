## ADDED Requirements

### Requirement: Native resource APIs require declared and approved permissions
The system SHALL map each native resource API method to a supported plugin permission and MUST deny a request unless the calling plugin is enabled and the permission is both declared and approved.

#### Scenario: Approved plugin invokes a native resource API
- **WHEN** an enabled plugin calls a supported method covered by its declared and approved permission
- **THEN** the host dispatches the request and returns a structured success or failure response to that plugin

#### Scenario: Permission is missing
- **WHEN** a plugin calls `network.fetch`, `storage.writeFile`, or `system.setWallpaper` without its required approved permission
- **THEN** the host rejects the call with a structured `permission.denied` error and performs no native operation

#### Scenario: Disabled plugin invokes an API
- **WHEN** a disabled plugin sends a native resource API request
- **THEN** the host rejects the request before accessing network, storage, or system wallpaper services

### Requirement: Host-mediated network fetch is bounded and policy-controlled
The system SHALL provide `network.fetch` under the existing `network` permission and MUST validate the request against host network policy before sending it from Rust.

#### Scenario: Allowed HTTPS request succeeds
- **WHEN** an approved plugin requests an HTTPS resource from a host allowed for that plugin and the response meets configured redirect, timeout, method, and size limits
- **THEN** the host returns the bounded response through the Extension API without exposing a direct WebView network capability

#### Scenario: Plugin requests an unsafe destination
- **WHEN** a plugin requests a non-HTTPS URL, loopback address, private network destination, disallowed host, or cross-protocol redirect
- **THEN** the host rejects the request before returning remote content

#### Scenario: Network operation times out or exceeds limits
- **WHEN** the remote request exceeds the configured timeout or response size limit
- **THEN** the host aborts the operation and returns a structured retryable network error

### Requirement: Plugin file writes are confined to plugin-owned storage
The system SHALL provide `storage.writeFile` under `storage.plugin` and MUST resolve every requested relative path inside the calling plugin's data root before writing bytes.

#### Scenario: Plugin writes a valid relative file
- **WHEN** an approved plugin writes bounded content to a normalized relative path in its data root
- **THEN** the host writes the file using a temporary file and atomic replacement and returns the plugin-relative result

#### Scenario: Plugin attempts path traversal
- **WHEN** a plugin supplies an absolute path, parent traversal, invalid separator form, or a path that resolves through a symbolic link outside its data root
- **THEN** the host rejects the request and MUST NOT create or modify a file outside the plugin data root

#### Scenario: Write exceeds resource limits
- **WHEN** a plugin attempts to write content larger than the configured per-request or storage limit
- **THEN** the host rejects the write with a structured quota error and leaves any existing destination intact

### Requirement: System wallpaper access is a distinct permissioned capability
The system SHALL add `system.wallpaper` to the Rust and TypeScript plugin permission vocabularies and SHALL expose `system.setWallpaper` only for validated local images owned by the calling plugin.

#### Scenario: Approved plugin sets a validated wallpaper
- **WHEN** an enabled plugin with approved `system.wallpaper` permission references a validated image inside its data root on a supported platform
- **THEN** the host invokes the platform wallpaper adapter and returns a result identifying the applied resource

#### Scenario: Plugin references an arbitrary local path
- **WHEN** a plugin asks to apply a file outside its data root or a file not validated as an image
- **THEN** the host rejects the request and does not call the operating system wallpaper API

#### Scenario: Permission appears in a manifest
- **WHEN** a valid manifest declares `system.wallpaper`
- **THEN** Rust validation, TypeScript validation, install permission review, registry persistence, and Extension Bridge authorization preserve the same permission value

### Requirement: Native resource IPC contracts are explicit and symmetric
The system SHALL define serializable Rust request, response, and error structures with matching TypeScript interfaces for native resource operations and SHALL avoid untyped payload access at the UI boundary.

#### Scenario: Valid request crosses the IPC boundary
- **WHEN** TypeScript sends a valid typed native resource request
- **THEN** Rust deserializes every required field with the documented casing and returns a response that conforms to the matching TypeScript interface

#### Scenario: Request payload is malformed
- **WHEN** a native resource request contains a missing field, wrong field type, unknown operation, or invalid identifier
- **THEN** the host rejects it with a stable error code and message without panicking

#### Scenario: Platform operation fails
- **WHEN** a Rust network, storage, or wallpaper adapter reports an error
- **THEN** the IPC response identifies the operation, stable error code, human-readable message, and whether retry is meaningful

### Requirement: Isolated plugins cannot bypass the native resource bridge
The system MUST keep third-party WebView network and native access isolated and SHALL treat the permissioned Extension API as the only supported path to native resource operations.

#### Scenario: Plugin attempts direct Tauri invocation
- **WHEN** isolated plugin code attempts to invoke an internal Tauri command instead of sending an Extension API message
- **THEN** the call cannot reach unrestricted application commands or native services

#### Scenario: Plugin attempts direct browser networking
- **WHEN** isolated plugin code attempts a direct fetch while its extension surface has `connect-src 'none'`
- **THEN** the request is blocked and the plugin must use an approved `network.fetch` bridge call

#### Scenario: Plugin identity does not match the bridge record
- **WHEN** a request claims a different plugin identity than the extension surface that sent it
- **THEN** the host rejects the request before evaluating its payload or permissions
