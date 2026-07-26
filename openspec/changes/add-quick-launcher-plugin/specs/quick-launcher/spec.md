## ADDED Requirements

### Requirement: Zero Launch is registered as the fourth bundled tool
The system SHALL register Zero Launch as an enabled bundled webview plugin with stable name `zero.launch`, short ID `quick-launcher`, author `bells`, version `1.0.0`, and macOS/Windows platform declarations.

#### Scenario: Fresh registry is initialized
- **WHEN** Zero initializes a plugin registry that has no Zero Launch record
- **THEN** the registry adds `zero.launch` after the existing screenshot, caffeine, and Bing wallpaper bundled tools without altering their records

#### Scenario: Existing registry is migrated
- **WHEN** Zero loads a valid older registry containing the first three bundled tools and user lifecycle choices
- **THEN** the system adds the missing Zero Launch record while preserving every existing enabled, disabled, health, and permission state

#### Scenario: Bundled defaults are restored
- **WHEN** the user restores bundled plugins after removing or disabling Zero Launch
- **THEN** the registry restores and enables `zero.launch` through the same lifecycle behavior as the other bundled tools

### Requirement: Users can search from the plugin panel or a floating launcher
The system SHALL expose the same Zero Launch search experience in its main plugin panel and in a single reusable floating `launcher` window invoked by `CommandOrControl+Shift+Space`.

#### Scenario: User opens the bundled plugin
- **WHEN** the user selects Zero Launch from Zero plugin navigation
- **THEN** the plugin panel focuses a search input and can query the current application and system-setting index

#### Scenario: User invokes the global shortcut
- **WHEN** Zero Launch is enabled and the user presses `CommandOrControl+Shift+Space`
- **THEN** Zero shows or reuses one centered floating Launcher window, clears stale transient state, and focuses its search input

#### Scenario: Shortcut registration conflicts
- **WHEN** the operating system refuses to register the Zero Launch shortcut
- **THEN** Zero remains operational, keeps the plugin panel available, and exposes a diagnostic explaining that shortcut activation is unavailable

#### Scenario: Plugin is disabled
- **WHEN** the user disables Zero Launch while its shortcut or floating window is active
- **THEN** Zero unregisters the shortcut, hides the Launcher window, and prevents further launcher activation until the plugin is enabled again

### Requirement: Search results combine applications and system settings
The system SHALL present matching application and system-setting items in one ranked list with an official or fallback icon, primary title, descriptive subtitle, item type, and available action state.

#### Scenario: Application result is displayed
- **WHEN** an installed application matches the query
- **THEN** the result shows its display name, installed bundle or shortcut description, icon or application fallback glyph, and either a running indicator or launch affordance

#### Scenario: System setting result is displayed
- **WHEN** a supported system setting matches the query
- **THEN** the result shows its localized title, a localized system-settings subtitle, a settings icon or fallback glyph, and an open affordance

#### Scenario: Result icon cannot be loaded
- **WHEN** the native icon provider cannot decode or return an item's icon
- **THEN** the result remains selectable and displays a type-appropriate fallback without treating the search as failed

#### Scenario: No item matches
- **WHEN** a non-empty query has no application or setting match
- **THEN** the view displays a localized empty state and does not retain an invalid selection

### Requirement: Launcher interaction is keyboard complete
The system SHALL support `ArrowUp`, `ArrowDown`, `Enter`, and `Escape` without requiring pointer input and SHALL expose equivalent accessible pointer actions.

#### Scenario: User moves through results
- **WHEN** multiple results are visible and the user presses `ArrowDown` or `ArrowUp`
- **THEN** selection moves to the next or previous visible item, wraps at the list boundary, and keeps the selected row visible

#### Scenario: User activates a result
- **WHEN** a result is selected and the user presses `Enter`
- **THEN** the system performs the same guarded activation as clicking that result and prevents duplicate activation while it is in flight

#### Scenario: User dismisses the floating window
- **WHEN** the floating Launcher window has focus and the user presses `Escape`
- **THEN** Zero hides the window without quitting the application or changing the index

#### Scenario: Floating window loses focus
- **WHEN** focus moves from the floating Launcher to another application and no activation is pending
- **THEN** Zero hides the Launcher window and clears transient selection safely

#### Scenario: Keyboard focus is visible
- **WHEN** a keyboard user tabs to the input, result list, refresh action, or retry action
- **THEN** every interactive control exposes an accessible name and visible focus indication

### Requirement: Activating an application focuses or launches it truthfully
The system SHALL focus a reliably identified running application and otherwise launch its indexed entry, and SHALL report the actual action rather than claiming focus or launch without operating-system confirmation.

#### Scenario: Indexed application is running
- **WHEN** the user activates an application with a reliable running instance and focusable window
- **THEN** the system brings that application to the foreground, returns action `focused`, records successful use, and hides the floating Launcher

#### Scenario: Indexed application is not running
- **WHEN** the user activates an installed application with no running instance
- **THEN** the system launches the validated indexed entry, returns action `launched`, records successful use, and hides the floating Launcher

#### Scenario: Windows denies foreground focus
- **WHEN** Windows identifies a running application but refuses the foreground transition
- **THEN** the system returns a truthful `focus_denied` or successful `launchedFallback` outcome and MUST NOT report `focused`

#### Scenario: Application disappeared after search
- **WHEN** the selected application was uninstalled or its indexed target is no longer valid before activation
- **THEN** the system performs no arbitrary fallback execution, returns a retryable stale/not-found error, and refreshes or invites refresh of the result set

#### Scenario: Activation fails
- **WHEN** the operating system rejects application launch or activation
- **THEN** the Launcher remains usable, displays a localized structured error, and does not increment usage frequency

### Requirement: Users can open supported system settings directly
The system SHALL allow a selected catalog setting to open only through the host-maintained platform mapping for its stable setting ID.

#### Scenario: macOS setting is activated
- **WHEN** a user selects a supported setting on macOS
- **THEN** the system opens the mapped `x-apple.systempreferences:` destination and reports action `openedSetting`

#### Scenario: Windows setting is activated
- **WHEN** a user selects a supported setting on Windows
- **THEN** the system opens the mapped `ms-settings:` destination and reports action `openedSetting`

#### Scenario: Setting mapping is unavailable
- **WHEN** the selected setting is not supported on the current platform or its destination cannot be opened
- **THEN** the system leaves the Launcher usable and returns a structured unsupported or open-failed error without opening an unvalidated URI

### Requirement: Successful use influences future ranking without overriding relevance
The system SHALL persist successful activation count and last-used time locally and SHALL apply bounded frequency, recency, and running-state boosts after textual match relevance.

#### Scenario: Frequently used application matches
- **WHEN** two items have comparable textual match quality and one has materially higher successful usage or more recent use
- **THEN** the frequently or recently used item ranks first

#### Scenario: Exact match competes with frequent weak match
- **WHEN** one item exactly or prefix-matches the query and another only weakly matches but has high usage
- **THEN** the exact or prefix match ranks ahead of the weak match

#### Scenario: Activation fails
- **WHEN** an attempted app or setting activation returns failure
- **THEN** neither usage count nor last-used time is updated for that item

#### Scenario: Query is empty
- **WHEN** the user opens Launcher with an empty query
- **THEN** the view shows a bounded set of recent/frequent applications and common settings with deterministic ordering

### Requirement: Platform support and asynchronous states are explicit
The system SHALL expose initializing, cache-ready, refreshing, ready, degraded, unsupported, empty, activating, and error states without blocking navigation to other Zero plugins.

#### Scenario: Cached results are refreshing
- **WHEN** cached index entries are visible while a background scan runs
- **THEN** the user can continue searching and activating still-valid items while the view indicates refresh activity

#### Scenario: Current desktop is unsupported
- **WHEN** Zero Launch runs on Linux or a mobile target in the first release
- **THEN** the system reports the platform as unsupported and MUST NOT represent an empty application list as successful support

#### Scenario: Stale search response completes
- **WHEN** an older query completes after a newer query or after the view is disposed
- **THEN** the older response does not replace current results or update disposed React state

#### Scenario: Panel becomes narrow
- **WHEN** the plugin panel width cannot fit all subtitle and status content
- **THEN** result rows truncate or reflow without horizontal overflow while the primary title and action remain operable
