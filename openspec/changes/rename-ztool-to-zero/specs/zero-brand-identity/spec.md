## ADDED Requirements

### Requirement: Product presents the Zero identity
The system SHALL present `Zero` as the current product name in all end-user application surfaces and current product documentation.

#### Scenario: User opens an application surface
- **WHEN** the user opens the tray, main, preferences, about, capture, pin, or launcher surface
- **THEN** every product-name reference on that surface uses `Zero` and no current-brand reference uses `ZTool`

#### Scenario: User reads current product documentation
- **WHEN** the user reads the README, product description, or current user-facing documentation
- **THEN** the product is identified as `Zero`

### Requirement: Bundled tools use the Zero family names
The system SHALL use the exact branded names `Zero Launch`, `Zero Snap`, `Zero Awake`, and `Zero Paper` as the primary display names of the four bundled tools in every supported locale.

#### Scenario: Bundled tools are listed
- **WHEN** the tray panel, main window, preferences, about surface, status-bar settings, or plugin manager lists bundled tools
- **THEN** the quick launcher is named `Zero Launch`, screenshot is named `Zero Snap`, caffeine is named `Zero Awake`, and Bing wallpaper is named `Zero Paper`

#### Scenario: User opens a bundled tool
- **WHEN** the user opens any bundled tool panel or its dedicated window
- **THEN** the visible title uses that tool's exact Zero family name while descriptive copy and actions remain localized

#### Scenario: Current documentation describes bundled tools
- **WHEN** current product or feature documentation names a bundled tool
- **THEN** it uses the corresponding Zero family name and may include the underlying capability in descriptive text

### Requirement: Mutable project metadata uses the zero namespace
The system SHALL use `zero` as the canonical mutable project namespace while retaining `com.watson.ztool` only as the stable Tauri bundle identifier for upgrade continuity.

#### Scenario: Application packages are built
- **WHEN** frontend and Rust application packages are built
- **THEN** the npm and Cargo package names are `zero`, the Rust library crate is `zero_lib`, and the visible Tauri product name is `Zero`

#### Scenario: Operating system resolves an upgrade
- **WHEN** a Zero build upgrades an existing installation
- **THEN** the Tauri bundle identifier remains `com.watson.ztool` so the operating system treats it as the same application identity

#### Scenario: Developer inspects compatibility documentation
- **WHEN** current developer documentation mentions `com.watson.ztool`
- **THEN** it identifies the value as a retained immutable compatibility identifier rather than the current product name

### Requirement: First-party plugin identifiers canonicalize to Zero
The system SHALL use `zero.launch`, `zero.snap`, `zero.awake`, and `zero.paper` as the canonical first-party plugin identifiers and SHALL normalize their known legacy identifiers at persistence and interaction boundaries.

#### Scenario: Fresh registry is initialized
- **WHEN** the plugin registry initializes without legacy state
- **THEN** bundled records and contribution IDs use only the canonical `zero` identifiers

#### Scenario: Legacy first-party identifier is read
- **WHEN** persisted registry, status-bar, preference, or selection state contains a known `ztool.*` first-party identifier
- **THEN** the system maps it to the corresponding canonical `zero` identifier without changing unrelated third-party identifiers

#### Scenario: Canonical state is written
- **WHEN** migrated or newly changed plugin state is persisted
- **THEN** the system writes canonical `zero` identifiers and does not create new legacy first-party identifiers

### Requirement: Existing local data migrates without destructive loss
The system SHALL migrate existing `~/.ztool` application data to `~/.zero` and `ztool.preferences.v1` preferences to `zero.preferences.v1` idempotently and non-destructively.

#### Scenario: Only legacy data exists
- **WHEN** Zero starts and a supported legacy data unit exists without a canonical equivalent
- **THEN** the system copies and normalizes that data into canonical storage before the owning subsystem uses it

#### Scenario: Canonical and legacy data both exist
- **WHEN** the same supported data unit exists in both canonical and legacy storage
- **THEN** the canonical value wins and the legacy value is not allowed to overwrite it

#### Scenario: Migration runs more than once
- **WHEN** the migration runs after canonical data has already been created
- **THEN** it completes without duplicating, resetting, or changing valid canonical state

#### Scenario: Migration unit fails
- **WHEN** a legacy data unit cannot be parsed or copied and no canonical value is usable
- **THEN** the owning subsystem reports a recoverable diagnostic, preserves the legacy source, and does not silently replace it with default state

#### Scenario: Rollback data is retained
- **WHEN** migration succeeds
- **THEN** the system leaves legacy data and the legacy preference key intact for rollback

### Requirement: Extension manifests support the Zero host key
The system SHALL treat `engines.zero` as the canonical extension host-version field and SHALL continue accepting `engines.ztool` as a legacy alias for Extension API v1 packages.

#### Scenario: New extension declares Zero compatibility
- **WHEN** an extension manifest contains a supported `engines.zero` value
- **THEN** both Rust and TypeScript validation accept the host-version declaration

#### Scenario: Legacy extension declares ZTool compatibility
- **WHEN** an Extension API v1 manifest contains only a compatible `engines.ztool` value
- **THEN** installation and loading remain supported

#### Scenario: Both host keys are present
- **WHEN** an extension manifest contains both `engines.zero` and `engines.ztool`
- **THEN** validation uses `engines.zero` as the authoritative host-version declaration

#### Scenario: New manifest guidance is rendered
- **WHEN** a developer follows current plugin examples or publishing guidance
- **THEN** generated and documented manifests use `engines.zero` and do not instruct authors to add `engines.ztool`

### Requirement: Rebrand preserves bundled-tool behavior
The system SHALL preserve the existing functional behavior, shortcuts, platform support, IPC payload shapes, and error handling of all four bundled tools while their names and first-party identifiers change.

#### Scenario: User invokes a bundled tool through an existing entry point
- **WHEN** the user invokes a bundled tool through its panel, global shortcut, status-bar item, or dedicated window
- **THEN** the same domain operation runs with the same supported input and result behavior as before the rebrand

#### Scenario: Frontend invokes native behavior
- **WHEN** a renamed tool calls an existing Tauri command
- **THEN** the frontend and Rust continue to exchange the existing explicitly typed payload shape without an `any` or untyped compatibility payload

#### Scenario: Platform does not support a tool operation
- **WHEN** Zero Launch, Zero Snap, Zero Awake, or Zero Paper reaches an existing unsupported platform path
- **THEN** it retains the existing defensive error or degraded-state behavior under the new visible name
