## ADDED Requirements

### Requirement: Bing wallpaper is registered as the third bundled tool
The system SHALL register the Bing wallpaper tool as an enabled bundled plugin with stable identity `zero.paper`, short ID `bing-wallpaper`, author `bells`, and the permissions required for host-mediated network, plugin storage, and system wallpaper access.

#### Scenario: Fresh installation seeds the plugin
- **WHEN** Zero initializes a plugin registry without an existing Bing wallpaper record
- **THEN** the registry includes an enabled `zero.paper` record and the shell can show it with the other bundled tools

#### Scenario: User hides or disables the plugin
- **WHEN** the user changes the Bing wallpaper plugin visibility or enabled state
- **THEN** the shell persists that preference through the existing plugin host without affecting screenshot, caffeine, preferences, or about surfaces

### Requirement: Cached wallpaper content is shown before remote refresh
The system SHALL load valid metadata and images from `~/.zero/data/wallpaper/` before attempting a remote refresh, and SHALL refresh Bing data asynchronously after activation without clearing usable cached content.

#### Scenario: Plugin activates with valid cache
- **WHEN** the plugin activates and the cache contains valid wallpaper entries
- **THEN** the system displays the cached entries immediately and starts a background refresh

#### Scenario: Plugin activates without cache
- **WHEN** the plugin activates and no valid cached entry exists
- **THEN** the system shows a loading state until at least one remote item is available or a recoverable error is returned

#### Scenario: Remote refresh fails with valid cache
- **WHEN** Bing cannot be reached or the response is invalid while valid cached entries exist
- **THEN** the system keeps the cached entries browsable, marks the snapshot as stale, and presents a retryable error without replacing the content with an empty state

### Requirement: The plugin retains the newest ten valid wallpaper entries
The system SHALL merge unique Bing records and valid cached records by stable wallpaper identity, sort them from newest to oldest by Bing date, retain at most 10 entries, and remove only obsolete cache files owned by the wallpaper index.

#### Scenario: Bing returns ten new entries
- **WHEN** a refresh returns 10 valid unique records and their images are cached successfully
- **THEN** the snapshot and cache index contain those 10 records in newest-first order

#### Scenario: Bing returns fewer than ten entries
- **WHEN** a refresh returns fewer than 10 valid unique records
- **THEN** the system preserves still-valid older cached records to fill the history up to 10 without duplicating dates or identities

#### Scenario: Cache exceeds the retention limit
- **WHEN** a successful merge produces more than 10 valid records
- **THEN** the system retains the newest 10 and deletes obsolete files referenced by the previous index while leaving unknown files untouched

#### Scenario: One image download fails
- **WHEN** metadata refresh succeeds but an individual image cannot be downloaded or validated
- **THEN** the system keeps other valid items available and reports that item as not cached rather than failing the entire refresh

### Requirement: Users can browse wallpaper history with stable navigation
The system SHALL display the selected wallpaper in a compact card and allow users to navigate from the latest entry toward older entries and back toward newer entries without wrapping at either boundary.

#### Scenario: Plugin opens with multiple entries
- **WHEN** the plugin opens with multiple valid entries and no previous selection
- **THEN** the newest entry is selected, the older action is enabled, and the newer action is disabled

#### Scenario: User selects an older entry
- **WHEN** the user activates the `<` older action
- **THEN** the immediately older entry is selected and its preview and metadata replace the current content

#### Scenario: User returns toward the latest entry
- **WHEN** the user activates the `>` newer action while an older entry is selected
- **THEN** the immediately newer entry is selected without skipping entries

#### Scenario: Selection survives refresh
- **WHEN** a refresh completes and the previously selected wallpaper identity still exists
- **THEN** the system preserves that selection even if the item indexes changed

### Requirement: Wallpaper metadata preserves Bing attribution
The system SHALL show a primary title or location-style description and a secondary Bing copyright attribution for the selected item, using localized fallback text when fields are missing without inventing attribution data.

#### Scenario: Bing provides title and copyright
- **WHEN** the selected Bing record contains non-empty `title` and `copyright` fields
- **THEN** the card shows the title as primary text and the original copyright as secondary text

#### Scenario: Bing title is empty
- **WHEN** the selected record has no usable title but contains copyright text
- **THEN** the card derives a conservative primary description from the copyright text and still preserves the full original copyright as secondary text

#### Scenario: Metadata fields are missing
- **WHEN** neither a usable title nor copyright description is available
- **THEN** the card shows localized fallback text and remains operable

### Requirement: Users can apply a cached Bing image as desktop wallpaper
The system SHALL allow the user to apply the selected image through an explicit apply action or by activating the wallpaper thumbnail, and MUST perform the system change only through the Rust wallpaper service.

#### Scenario: Cached wallpaper is applied successfully
- **WHEN** the user applies a selected item whose validated local image is available on a supported platform
- **THEN** the system sets that image as the desktop wallpaper and displays success feedback for the selected identity

#### Scenario: Selected wallpaper is not cached yet
- **WHEN** the user applies an item whose local image is not yet available
- **THEN** the system downloads and validates that item before applying it and exposes a busy state that prevents duplicate apply requests

#### Scenario: Platform cannot set wallpaper
- **WHEN** the current desktop platform or environment does not support the configured wallpaper backend
- **THEN** the system leaves the current wallpaper unchanged and returns a localized, structured unsupported-platform error

#### Scenario: Wallpaper backend fails
- **WHEN** the operating system rejects the wallpaper change
- **THEN** the system leaves the plugin usable, reports failure, and MUST NOT claim that the wallpaper was applied

### Requirement: Users can save the selected wallpaper to Downloads
The system SHALL copy the selected validated cache image to the operating system Downloads directory using a safe descriptive filename without overwriting an existing file.

#### Scenario: Save succeeds
- **WHEN** the user activates download for a selected cached wallpaper and the Downloads directory is writable
- **THEN** the system creates a copy, returns its final path, and displays success feedback

#### Scenario: Destination filename already exists
- **WHEN** the generated destination filename already exists
- **THEN** the system chooses a collision-free filename and preserves the existing file

#### Scenario: Downloads directory is unavailable
- **WHEN** the system cannot resolve or write the Downloads directory
- **THEN** the system returns a retryable save error and leaves the cache image intact

### Requirement: Wallpaper card remains usable in compact and asynchronous states
The system SHALL keep the card readable in the tray window, provide accessible names and disabled states for every icon action, and expose loading, refresh, preview, save, apply, empty, stale, and error states without blocking unrelated plugin navigation.

#### Scenario: Background refresh is running
- **WHEN** cached content is visible while a refresh is in progress
- **THEN** the user can continue browsing cached entries and only unavailable actions are disabled

#### Scenario: Keyboard user operates the card
- **WHEN** focus moves through download, apply, older, newer, and thumbnail actions
- **THEN** each action has a visible focus indicator, an accessible name, and the same behavior as pointer activation

#### Scenario: Card width becomes narrow
- **WHEN** the available plugin panel width cannot fit the side-by-side content layout
- **THEN** the thumbnail and metadata reflow without horizontal overflow or inaccessible controls

### Requirement: Plugin disposal releases frontend preview resources safely
The system SHALL prevent disposed plugin views from applying stale asynchronous UI updates and SHALL release preview resources while preserving valid disk cache for later activation.

#### Scenario: View closes during refresh
- **WHEN** the plugin view is disposed while a refresh or preview request is pending
- **THEN** completion of that request does not update the disposed React state and any temporary frontend preview reference is released

#### Scenario: Plugin reopens after disposal
- **WHEN** the plugin is activated again after disposal
- **THEN** the system reloads the persisted cache and does not require previously released in-memory preview objects
