## ADDED Requirements

### Requirement: Launcher native APIs require declared and approved permissions
The system SHALL add `system.apps.read`, `system.apps.execute`, `system.window.focus`, and `system.settings.open` to the Rust and TypeScript permission vocabularies and MUST deny each launcher method unless the calling plugin is enabled and all permissions required by that method are declared and approved.

#### Scenario: Approved plugin scans or searches applications
- **WHEN** an enabled plugin calls `launcher.scanApps` or `launcher.search` with approved `system.apps.read`
- **THEN** the host returns a bounded typed snapshot or search result from the launcher service

#### Scenario: Approved plugin launches or focuses an application
- **WHEN** an enabled plugin calls `launcher.launchOrFocus` with both `system.apps.execute` and `system.window.focus` declared and approved
- **THEN** the host resolves the indexed item and returns the actual focused/launched outcome

#### Scenario: One activation permission is missing
- **WHEN** a plugin calls `launcher.launchOrFocus` without either approved `system.apps.execute` or approved `system.window.focus`
- **THEN** the host rejects the call with `permission.denied` before invoking a platform adapter

#### Scenario: Approved plugin opens a setting
- **WHEN** an enabled plugin calls `launcher.openSystemSetting` with approved `system.settings.open`
- **THEN** the host resolves the setting ID through its catalog and opens only the mapped platform destination

#### Scenario: Plugin is disabled
- **WHEN** a disabled plugin invokes any launcher method
- **THEN** the host rejects the request before reading the index, probing processes, launching an app, focusing a window, or opening settings

### Requirement: Launcher APIs accept host-issued identifiers instead of execution targets
The system SHALL accept a stable indexed `itemId` and applicable index `revision` for activation and MUST NOT accept a caller-supplied executable path, bundle identifier, command line, shortcut target, or URI as an execution destination.

#### Scenario: Valid current application ID is activated
- **WHEN** an authorized caller submits an application item ID present in the referenced current index revision
- **THEN** the host resolves its private launch identity and performs the requested launch-or-focus operation

#### Scenario: Valid current setting ID is activated
- **WHEN** an authorized caller submits a supported system-setting item ID
- **THEN** the host resolves the private URI from the built-in platform catalog and opens it

#### Scenario: Stale item no longer exists
- **WHEN** the submitted revision or item ID no longer resolves after an index refresh
- **THEN** the host returns stable error `launcher.item_stale` and performs no fallback path or URI execution

#### Scenario: Caller submits an arbitrary target
- **WHEN** a launcher payload contains a path, Bundle ID, command line, or URI where only an item ID is allowed
- **THEN** request validation rejects the payload and no operating-system action occurs

### Requirement: Launcher IPC contracts are explicit, bounded, and symmetric
The system SHALL define serializable Rust request, result, snapshot, item, activation, icon, and error structures with matching TypeScript interfaces and camelCase wire fields.

#### Scenario: Valid search request crosses IPC
- **WHEN** TypeScript sends a valid `QuickLauncherSearchInput`
- **THEN** Rust deserializes its documented fields and returns a `QuickLauncherSearchResult` matching the TypeScript contract

#### Scenario: Valid activation result crosses IPC
- **WHEN** a platform activation succeeds
- **THEN** Rust serializes the item ID, actual action, usage count, and activation time using the documented TypeScript field names and enum values

#### Scenario: Request payload is malformed
- **WHEN** a request has missing fields, wrong field types, unsupported enum values, an oversized query, invalid limit, or unknown method
- **THEN** the host rejects it with a stable validation error without panicking or invoking a platform operation

#### Scenario: Result limit is excessive
- **WHEN** a caller requests more results than the configured host maximum
- **THEN** the host rejects or clamps the request according to the documented contract and never returns an unbounded application list

#### Scenario: Platform operation fails
- **WHEN** scanning, running-state probing, icon extraction, activation, or setting opening fails
- **THEN** the response identifies the operation, stable error code, human-readable message, retryability, and platform support without exposing sensitive command-line data

### Requirement: Extension Bridge authorizes all permissions required by a method
The system SHALL map each Extension API method to a set of required permissions and SHALL verify caller identity, plugin state, declared permissions, and approved permissions before dispatch.

#### Scenario: Multi-permission method is fully approved
- **WHEN** `launcher.launchOrFocus` is requested by the same enabled plugin identity as the ExtensionSurface and both required permissions are approved
- **THEN** the Bridge dispatches exactly one typed request to the launcher host service

#### Scenario: Plugin identity does not match
- **WHEN** a request claims a plugin name different from the ExtensionSurface record
- **THEN** the Bridge returns `plugin.identity` before evaluating the item or calling the launcher service

#### Scenario: Method is unsupported
- **WHEN** a plugin requests an unknown `launcher.*` method
- **THEN** the Bridge returns `method.unsupported` and performs no native operation

#### Scenario: Permission appears in a manifest
- **WHEN** a valid manifest declares any launcher permission
- **THEN** Rust validation, TypeScript validation, install/update permission review, registry persistence, and runtime Bridge authorization preserve the same exact permission value

### Requirement: Bundled and extension callers share one native launcher service
The system SHALL route bundled typed Tauri commands and approved Extension Bridge methods to the same Rust indexing, search, catalog, and activation services.

#### Scenario: Bundled panel searches
- **WHEN** `QuickLauncherPanel` invokes the typed search command
- **THEN** the command delegates to the managed launcher state and applies the same limits and ID semantics as the Bridge

#### Scenario: Extension searches
- **WHEN** an authorized isolated extension invokes `launcher.search`
- **THEN** the Bridge delegates to the same managed launcher state and cannot substitute a different scanner or execution path

#### Scenario: Service returns an error
- **WHEN** the shared launcher service returns a structured failure
- **THEN** both caller paths preserve its stable code and retryability while mapping it to their typed response envelope

### Requirement: Isolated extensions cannot bypass launcher authorization
The system MUST keep direct Tauri commands, application paths, usage files, cache files, process APIs, window APIs, and system-setting URIs unavailable to isolated plugin WebViews.

#### Scenario: Extension attempts direct Tauri invoke
- **WHEN** isolated plugin code tries to invoke an internal Zero Launch command
- **THEN** the extension surface cannot reach the unrestricted command and must use its approved message Bridge

#### Scenario: Extension attempts direct filesystem discovery
- **WHEN** isolated plugin code tries to enumerate application directories or read launcher cache files
- **THEN** the sandbox and capability policy deny that access

#### Scenario: Extension attempts arbitrary browser URI navigation
- **WHEN** isolated plugin code tries to open an unapproved system-settings or executable URI directly
- **THEN** the request is blocked or remains outside supported plugin behavior, and no launcher success response is produced

### Requirement: Launcher window commands are host-controlled
The system SHALL restrict creation, showing, hiding, focus, and shortcut handling for the `launcher` window to trusted host code and SHALL keep Tauri window capabilities synchronized with its label.

#### Scenario: Host shortcut shows the window
- **WHEN** the registered Zero Launch shortcut fires for an enabled bundled plugin
- **THEN** trusted Rust code shows and focuses the one `launcher` window without accepting plugin-provided window options

#### Scenario: Window already exists
- **WHEN** a second show request occurs while the `launcher` window exists
- **THEN** the host reuses the existing window and does not create a duplicate label or WebView

#### Scenario: Capability configuration omits the launcher window
- **WHEN** build-time or automated contract checks compare routed window labels with Tauri capabilities
- **THEN** the check fails until `launcher` is explicitly included with only the permissions required by the trusted UI
