## ADDED Requirements

### Requirement: Plugin registry discovers bundled and installed plugins
The system SHALL maintain a plugin registry that discovers bundled plugins, market-installed packages, local packages, development plugins, and persisted lifecycle state before rendering plugin navigation.

#### Scenario: First launch seeds bundled plugins
- **WHEN** ZTool starts with no existing plugin registry
- **THEN** the system registers bundled screenshot and caffeine plugins as installed and enabled by default

#### Scenario: Market-installed plugin is discovered on startup
- **WHEN** ZTool starts after a user has installed a plugin from the Git-based market
- **THEN** the system loads that plugin's registry record from `~/.ztool/plugins/` and includes it in plugin lifecycle state

#### Scenario: Local package plugin is discovered on startup
- **WHEN** ZTool starts after a user has installed a local `.zplugin` package
- **THEN** the system loads that plugin's registry record and includes it in plugin lifecycle state

#### Scenario: Invalid installed plugin is skipped
- **WHEN** an installed plugin has a missing manifest, invalid package files, unsafe main path, or incompatible host/API metadata
- **THEN** the system excludes the plugin from activation and reports a recoverable registry diagnostic

#### Scenario: Registry store is corrupted
- **WHEN** persisted plugin lifecycle state cannot be parsed
- **THEN** the system falls back to bundled plugin records, preserves host preferences/about access, and reports that plugin registry recovery occurred

### Requirement: Users can install plugin packages
The system SHALL allow users to install a local or market-downloaded `.zplugin` package after validating its manifest, compatibility, permissions, entrypoint path, archive contents, and duplicate identity constraints.

#### Scenario: Install valid package
- **WHEN** the user selects a valid `.zplugin` package and accepts its permission request
- **THEN** the system extracts the package under `~/.ztool/plugins/`, persists its registry record, enables it according to the install choice, and shows it in plugin navigation

#### Scenario: Install package with duplicate identity
- **WHEN** the user installs a package whose plugin name/id already exists in the registry
- **THEN** the system prevents accidental overwrite and requires an explicit update or replace flow before changing the existing plugin

#### Scenario: Install package with denied permissions
- **WHEN** the user declines the permissions requested by a valid plugin package
- **THEN** the system MUST NOT install or activate that plugin

#### Scenario: Install archive contains unsafe path
- **WHEN** a `.zplugin` archive contains an absolute path, parent-directory traversal, unsafe symlink, or file that would overwrite another plugin
- **THEN** the system rejects the package and leaves the current registry unchanged

#### Scenario: Install validation fails
- **WHEN** package validation fails during install
- **THEN** the system leaves the current registry unchanged and surfaces validation errors to the user

### Requirement: Users can uninstall plugins
The system SHALL allow users to uninstall active plugin records while preserving protected host surfaces and recoverability for bundled plugins.

#### Scenario: Uninstall market-installed plugin
- **WHEN** the user uninstalls a plugin installed from the Git-based market
- **THEN** the system disables the plugin, removes its active registry record, removes its extracted package assets from `~/.ztool/plugins/`, and removes it from shell navigation

#### Scenario: Uninstall local package plugin
- **WHEN** the user uninstalls a plugin installed from a local `.zplugin` package
- **THEN** the system disables the plugin, removes its active registry record, removes its extracted package assets from `~/.ztool/plugins/`, and removes it from shell navigation

#### Scenario: Uninstall bundled plugin
- **WHEN** the user uninstalls a bundled plugin such as screenshot or caffeine
- **THEN** the system removes that plugin from the active registry without deleting app-bundled assets and offers a way to restore bundled defaults

#### Scenario: Attempt to uninstall protected host surface
- **WHEN** the user attempts to uninstall preferences, about, quit, or other protected host surfaces
- **THEN** the system refuses because those surfaces are host capabilities rather than uninstallable plugins

#### Scenario: Uninstall active selected plugin
- **WHEN** the currently selected plugin is uninstalled
- **THEN** the shell selects another enabled plugin or displays an empty plugin state without crashing

### Requirement: Users can enable and disable installed plugins
The system SHALL allow users to enable or disable plugin records without deleting package assets or plugin-owned persisted data.

#### Scenario: Disable plugin
- **WHEN** the user disables an enabled plugin
- **THEN** the system deactivates that plugin's contributions, removes its commands and views from active navigation, and persists the disabled state

#### Scenario: Enable plugin
- **WHEN** the user enables a disabled compatible plugin
- **THEN** the system restores that plugin's active contributions and persists the enabled state

#### Scenario: All plugins are disabled or uninstalled
- **WHEN** no user-facing plugin remains enabled
- **THEN** the shell remains usable and displays an empty state with market install and restore-defaults actions

#### Scenario: Disabled plugin receives activation event
- **WHEN** an activation event is triggered for a disabled plugin
- **THEN** the system MUST NOT activate that plugin or execute its contributed commands

### Requirement: Plugin lifecycle state persists across restarts
The system SHALL persist installed plugins, disabled plugins, removed bundled plugins, approved permissions, source information, package path, and plugin health state across app restarts.

#### Scenario: Restart after market install
- **WHEN** the app restarts after a market plugin has been installed and enabled
- **THEN** the plugin remains installed, enabled, sourced from the market, and visible in shell navigation

#### Scenario: Restart after uninstall
- **WHEN** the app restarts after a plugin has been uninstalled
- **THEN** the plugin remains absent from active navigation unless restored or reinstalled

#### Scenario: Restart after disabling plugin
- **WHEN** the app restarts after a plugin has been disabled
- **THEN** the plugin remains disabled and its contributions remain inactive

#### Scenario: Permission approval persists
- **WHEN** a plugin with approved permissions is loaded after restart
- **THEN** the system uses the persisted approval state for the same plugin version and package identity

### Requirement: Plugin failures are isolated and recoverable
The system SHALL isolate plugin activation, rendering, command, execution, download, and validation failures so one plugin cannot prevent the host shell or other plugins from working.

#### Scenario: Plugin activation fails
- **WHEN** a plugin fails during activation
- **THEN** the system marks that plugin as failed, disables its active contributions for the current session, and keeps other plugins usable

#### Scenario: Plugin command fails
- **WHEN** a plugin command returns an error
- **THEN** the system surfaces that command error without marking the host shell as failed

#### Scenario: Plugin main execution fails
- **WHEN** a plugin binary or script entrypoint fails, times out, or is denied by execution policy
- **THEN** the system reports the failure for that plugin and keeps the host shell usable

#### Scenario: Failed plugin appears after restart
- **WHEN** a plugin previously failed and the app starts again
- **THEN** the system reports the previous failure state and allows the user to retry, disable, or uninstall the plugin

#### Scenario: User disables failed plugin
- **WHEN** the user disables a failed plugin
- **THEN** the system stops retrying its activation until the user enables it again
