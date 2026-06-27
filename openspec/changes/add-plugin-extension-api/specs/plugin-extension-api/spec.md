## ADDED Requirements

### Requirement: Plugin manifests are versioned and validated
The system SHALL define a plugin `manifest.json` contract that requires `name`, `version`, `author`, `main`, and `permissions`, and MAY include display metadata, host/API compatibility, contribution points, runtime metadata, and supported platforms.

#### Scenario: Valid MVP manifest is accepted
- **WHEN** a plugin package contains a `manifest.json` with valid `name`, `version`, `author`, package-relative `main`, and supported `permissions`
- **THEN** the system accepts the manifest as valid and can convert it into a normalized plugin record

#### Scenario: Required manifest field is missing
- **WHEN** a plugin manifest omits `name`, `version`, `author`, `main`, or `permissions`
- **THEN** the system rejects the manifest with a validation error that identifies the missing field

#### Scenario: Main path escapes package root
- **WHEN** a plugin manifest declares a `main` path that is absolute or escapes the extracted plugin directory
- **THEN** the system rejects the manifest and MUST NOT activate or execute that entrypoint

#### Scenario: Manifest targets an incompatible host API
- **WHEN** a plugin manifest declares a ZTool or Extension API range that does not include the running host
- **THEN** the system marks the plugin as incompatible and MUST NOT activate its entrypoints

#### Scenario: Manifest declares unsupported permission
- **WHEN** a plugin manifest includes a permission that the current Extension API version does not support
- **THEN** the system rejects or ignores that permission with a validation result that explains the unsupported permission

### Requirement: Extension contribution points drive host-visible capabilities
The system SHALL expose plugin capabilities through manifest contribution points for views, commands, settings, activation events, and user-facing metadata when those optional fields are present.

#### Scenario: Plugin contributes a primary view
- **WHEN** an enabled plugin contributes a primary view for the main plugin workspace
- **THEN** the shell displays the plugin in navigation and can open its declared view surface

#### Scenario: Plugin contributes commands
- **WHEN** an enabled plugin contributes commands with stable command identifiers and titles
- **THEN** the host can list those commands and dispatch them through the Extension API without relying on hard-coded app switch statements

#### Scenario: Plugin contributes settings
- **WHEN** an enabled plugin contributes settings with keys, types, defaults, and labels
- **THEN** the preferences surface can present those settings as plugin-owned configuration without editing core preferences code for that plugin

#### Scenario: Activation event is reached
- **WHEN** a user opens a contributed view or executes a contributed command whose activation event is declared by the plugin
- **THEN** the host activates that plugin before invoking the requested contribution

### Requirement: Extension API calls are permission-scoped
The system SHALL expose a typed Extension API bridge that only permits plugin actions allowed by the plugin's declared and approved permissions.

#### Scenario: Plugin calls an allowed host API
- **WHEN** an activated plugin calls a host API covered by its approved permissions
- **THEN** the host executes the request and returns a structured success or failure result

#### Scenario: Plugin calls an undeclared host API
- **WHEN** an activated plugin calls a host API that is not declared or not approved for that plugin
- **THEN** the host denies the request and returns a structured permission error

#### Scenario: Plugin attempts direct native IPC
- **WHEN** third-party plugin code attempts to call internal Tauri commands or native APIs outside the Extension API bridge
- **THEN** the system prevents the call from reaching unrestricted native capabilities

#### Scenario: Permission vocabulary changes across API versions
- **WHEN** a plugin targets an older Extension API version with a permission that has been renamed or removed
- **THEN** the host reports a compatibility or migration error instead of granting an unknown permission

### Requirement: Plugin entrypoints are host-mediated
The system SHALL activate plugin `main` entrypoints only through host-controlled runtime rules, permission checks, and failure handling.

#### Scenario: Web entrypoint loads through isolated surface
- **WHEN** an installed plugin's `main` entrypoint resolves to a supported web asset
- **THEN** the host loads it through an isolated extension surface without giving it direct Tauri API access

#### Scenario: Binary or script entrypoint requests execution
- **WHEN** an installed plugin's `main` entrypoint resolves to a supported binary or script runtime
- **THEN** the host checks approved permissions and execution policy before launching it without shell-string interpolation

#### Scenario: Entrypoint runtime is unsupported
- **WHEN** an installed plugin declares or implies a runtime that the current host does not support
- **THEN** the system marks the plugin as incompatible or failed and MUST NOT execute the entrypoint

### Requirement: Third-party plugin views are isolated from the host shell
The system SHALL render third-party plugin views in an isolated extension surface that protects host navigation, preferences, DOM state, and native permissions from plugin failures.

#### Scenario: Plugin view crashes during render
- **WHEN** a third-party plugin view throws an error or fails to load
- **THEN** the host keeps the shell usable, marks the plugin view as failed, and exposes recovery actions such as reload, disable, or uninstall

#### Scenario: Plugin tries to modify host shell DOM
- **WHEN** third-party plugin code attempts to directly modify host shell DOM outside its extension surface
- **THEN** the system prevents that modification from affecting host navigation or system actions

#### Scenario: Plugin view sends a bridge message
- **WHEN** a plugin view sends a well-formed Extension API message to the host
- **THEN** the host validates the sender plugin identity, enabled state, activation state, and permissions before handling the message

### Requirement: Plugin developer packages are self-contained and locally validatable
The system SHALL define a `.zplugin` package format that contains `manifest.json`, declared entrypoint assets, optional documentation, and package metadata needed for validation before installation.

#### Scenario: Package contains all declared assets
- **WHEN** a local `.zplugin` package includes every manifest-declared entrypoint asset and package metadata
- **THEN** the validator reports the package as installable for the current host when compatibility and permission checks pass

#### Scenario: Package is missing a declared asset
- **WHEN** a plugin package manifest points to an entrypoint asset that is absent from the package
- **THEN** the validator rejects the package with an asset validation error

#### Scenario: Developer validates a plugin before install
- **WHEN** a developer or user runs validation against a local `.zplugin` package or development folder
- **THEN** the system returns manifest, compatibility, permission, entrypoint, and asset validation results without installing the plugin
