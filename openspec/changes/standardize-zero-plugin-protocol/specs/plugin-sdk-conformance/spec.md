## Purpose

Establish the developer-facing SDK and conformance guarantees for Zero plugins, including truthful separation of public Web capabilities from bundled native adapters and evidence required before claiming stable platform support.

## ADDED Requirements

### Requirement: SDK use does not grant native host authority
The public SDK SHALL provide typed registration, activation context, cancellation, disposal and method-specific Bridge results without requiring React or direct Tauri access. React integration SHALL be optional. Unsupported operations and transport failures SHALL surface as explicit typed failures.

#### Scenario: A plugin uses the SDK without React
- **WHEN** a plain TypeScript Web plugin registers and calls a supported storage operation
- **THEN** it can execute through its bound session without importing React or Tauri APIs

#### Scenario: A plugin registers an undeclared command
- **WHEN** registration includes an identifier absent from its validated manifest
- **THEN** the host rejects that contribution and does not create a shortcut or native action

### Requirement: Bundled metadata is consistent while native boundaries remain intact
The five bundled tools SHALL expose consistent identity, versions and contributions to both the frontend and native catalog without changing canonical IDs or user data. Shared metadata MUST NOT make bundled native privileges available to external packages or eagerly load tool code.

#### Scenario: A bundled descriptor is changed
- **WHEN** an author changes a plugin-owned metadata field
- **THEN** frontend and native catalog conformance checks detect divergence before the application can ship

#### Scenario: File metadata participates in the common catalog
- **WHEN** the File tool is listed or managed through the shared protocol
- **THEN** its separate engine signature approval, capability scope, version leases and platform-specific provider behavior remain enforced

### Requirement: Protocol conformance has shared positive and negative examples
The SDK and host SHALL be verified against the same manifest and wire fixtures, including legacy cases, version boundaries, permission denial, unsafe paths, unknown methods, cancellation and stale sessions. The distribution SHALL include a minimal third-party Web example using only public APIs and clearly distinguish it from native bundled examples.

#### Scenario: An author packages the example
- **WHEN** the documented supported host installs and opens the packaged example after permission approval
- **THEN** it performs a public API operation, survives disable and re-enable and can be uninstalled without affecting the bundled tools

#### Scenario: A fixture has different language interpretations
- **WHEN** authoring validation and native validation disagree about a documented version range or serialized payload
- **THEN** conformance fails and the affected protocol cannot be declared stable until the mismatch is resolved

### Requirement: Stability and platform claims match runtime evidence
Stable API 1.0 and supported-platform claims SHALL require actual packaged plugin runtime verification in addition to schema, source, unit and build checks. Validation reports SHALL distinguish automated checks, native manual results, resource measurements and outstanding device work.

#### Scenario: Only source and build checks passed
- **WHEN** schema checks, compilation and unit tests pass without native plugin loading on a target platform
- **THEN** the report labels that platform's runtime and performance checks as pending and does not claim them from manifest metadata

#### Scenario: Repeated plugin lifecycle is measured
- **WHEN** ten load, disable and uninstall cycles are exercised on a supported device
- **THEN** the report records terminal host-resource counts, process-tree CPU/RSS and activation samples, and distinguishes observed results from proposed budgets
