## ADDED Requirements

### Requirement: Status bar renders primary and plugin items
The system SHALL render a primary Zero status item followed by plugin status items for installed, enabled, and status-bar-visible tool plugins.

#### Scenario: Bundled plugin items appear after primary logo
- **WHEN** the app launches with bundled screenshot and caffeine plugins enabled and status bar plugin items enabled
- **THEN** the status bar displays the primary Zero logo followed by screenshot and caffeine plugin items in deterministic order

#### Scenario: Hidden plugin item is omitted
- **WHEN** the user hides the caffeine item in status bar preferences
- **THEN** the status bar displays the primary Zero logo and omits the caffeine plugin item

#### Scenario: Disabled plugin item is omitted
- **WHEN** an installed plugin is disabled through the plugin lifecycle controls
- **THEN** the status bar MUST omit that plugin item even if its status bar visibility preference is enabled

#### Scenario: No visible plugin items remain
- **WHEN** all plugin items are hidden or disabled
- **THEN** the primary Zero logo remains available as the app entry point

### Requirement: Status bar settings are persisted and restored
The system SHALL persist status bar display settings in a native-readable store and restore them during app startup.

#### Scenario: Settings restore at launch
- **WHEN** the user hides the screenshot item and restarts Zero
- **THEN** the screenshot status item remains hidden before the preferences window is opened

#### Scenario: Plugin item display is disabled
- **WHEN** the user turns off plugin item display in status bar settings
- **THEN** the system hides plugin sub-items while keeping the primary Zero entry point available

#### Scenario: New enabled plugin defaults visible
- **WHEN** an installed plugin becomes enabled and has no saved status bar visibility preference
- **THEN** the system treats the plugin's status bar item as visible by default

### Requirement: Preferences expose status bar display controls
The system SHALL provide a status bar preferences section with display toggles, per-plugin item controls, and a preview of the resulting arrangement.

#### Scenario: Preferences show arrangement preview
- **WHEN** the preferences surface is opened
- **THEN** it displays a compact preview containing the primary Zero logo and currently visible plugin items

#### Scenario: Toggle plugin item from preferences
- **WHEN** the user disables a plugin item in preferences
- **THEN** the native status bar layout updates without requiring an app restart

#### Scenario: Preview mirrors native filtering
- **WHEN** a plugin is disabled or hidden
- **THEN** the preferences preview omits the same plugin item that the native status bar omits

### Requirement: Zero Awake status item toggles caffeine mode
The system SHALL provide a caffeine status item whose icon reflects the current caffeine state and whose click action toggles caffeine mode.

#### Scenario: Enable caffeine from status item
- **WHEN** caffeine mode is inactive and the user clicks the caffeine status item
- **THEN** the system enables caffeine mode using the configured default duration and changes the icon to a full coffee cup

#### Scenario: Disable caffeine from status item
- **WHEN** caffeine mode is active and the user clicks the caffeine status item
- **THEN** the system disables caffeine mode and changes the icon to an empty coffee cup

#### Scenario: Zero Awake expires automatically
- **WHEN** a finite caffeine session reaches its backend expiry time
- **THEN** the status bar caffeine icon updates to the empty coffee cup state

#### Scenario: Zero Awake enable fails
- **WHEN** the caffeine status item is clicked on an unsupported platform or the native keep-awake operation fails
- **THEN** the system MUST NOT show the full coffee cup state unless the backend reports caffeine mode as active

### Requirement: Zero Snap status item starts screenshot flow
The system SHALL provide a screenshot status item whose click action starts the screenshot flow directly.

#### Scenario: Start screenshot from status item
- **WHEN** the user clicks the screenshot status item
- **THEN** the system starts the screenshot flow using the same default capture behavior as the global screenshot shortcut

#### Scenario: Zero Snap start fails
- **WHEN** the screenshot status item is clicked and the current platform or permission state cannot start capture
- **THEN** the system reports the failure through the screenshot/plugin state without removing the screenshot status item

#### Scenario: Zero Snap item respects plugin visibility
- **WHEN** the screenshot plugin is hidden from status bar settings
- **THEN** clicking other status items MUST NOT start screenshot capture accidentally

### Requirement: Generic plugin status items are host-mediated
The system SHALL route plugin status item actions through the host so enabled plugins cannot directly create or control native status items.

#### Scenario: Generic plugin opens plugin surface
- **WHEN** an enabled installed plugin contributes no approved native status action and the user clicks its status item
- **THEN** the system opens a Zero surface with that plugin selected

#### Scenario: Unsupported native action is denied
- **WHEN** a plugin declares a status bar action type that is not supported by the host
- **THEN** the system MUST omit or disable that action and report the plugin contribution as unsupported

#### Scenario: Untrusted plugin cannot receive raw tray event
- **WHEN** the user clicks a third-party plugin status item
- **THEN** the host dispatches an approved action and MUST NOT expose unrestricted native tray event access to the plugin

### Requirement: Status bar behavior has platform fallback
The system SHALL provide the full multi-item status bar layout on platforms where it is practical and a safe action fallback on platforms where multiple native status items are not practical.

#### Scenario: macOS supports multi-item layout
- **WHEN** Zero runs on macOS with plugin item display enabled
- **THEN** the system renders separate native status items for the primary Zero logo and visible plugin items

#### Scenario: Platform uses fallback action row
- **WHEN** Zero runs on a platform where separate native status items are not practical
- **THEN** the system keeps the primary tray icon and exposes the same plugin actions in the tray quick panel fallback area

#### Scenario: Fallback preserves settings
- **WHEN** the user changes status bar plugin item visibility on a fallback platform
- **THEN** the stored settings remain valid and apply to the fallback action row

### Requirement: Status bar items are understandable and stable
The system SHALL provide stable icons, tooltips, and click targets for status bar items.

#### Scenario: Item exposes tooltip text
- **WHEN** the user hovers or inspects a status bar item through native accessibility
- **THEN** the item exposes a title that identifies the associated plugin or action

#### Scenario: Stateful icon remains stable in layout
- **WHEN** the caffeine item changes from empty cup to full cup
- **THEN** the status bar item keeps a stable position and click target
