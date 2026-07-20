## ADDED Requirements

### Requirement: macOS application discovery uses known application roots
The system SHALL discover `.app` bundles from `/Applications`, the current user's `~/Applications`, `/System/Applications`, and `/System/Applications/Utilities` without following a path outside the configured roots.

#### Scenario: Valid application bundle is found
- **WHEN** a readable `.app` bundle exists in a configured macOS root
- **THEN** the index derives its display name, Bundle ID when present, executable identity, bundle path, icon reference, source modification time, and searchable forms from validated bundle metadata

#### Scenario: Display name is missing
- **WHEN** `CFBundleDisplayName` is absent but `CFBundleName` or a valid bundle filename exists
- **THEN** the index uses the documented fallback and keeps the application searchable

#### Scenario: System application roots overlap
- **WHEN** the same bundle is observed through `/System/Applications` and its Utilities subdirectory
- **THEN** the application appears once, deduplicated by Bundle ID or canonical bundle path

#### Scenario: Bundle metadata is unreadable
- **WHEN** a candidate bundle has missing, malformed, or inaccessible metadata required for safe launch
- **THEN** the scanner skips that candidate, records a non-fatal diagnostic, and continues indexing other applications

### Requirement: Windows application discovery uses Start Menu entries
The system SHALL recursively discover `.lnk` and `.exe` application entries from the machine and current-user Start Menu Programs directories and SHALL validate resolved launch identities before indexing them.

#### Scenario: Valid Start Menu shortcut is found
- **WHEN** a readable `.lnk` under a configured Programs directory resolves to a supported application target
- **THEN** the index records its display name, normalized launch identity, shortcut path, executable/AppUserModel identity when available, icon reference, source modification time, and searchable forms

#### Scenario: Direct executable entry is found
- **WHEN** a valid `.exe` exists under a configured Programs directory
- **THEN** the index adds it as an application entry using a normalized executable identity

#### Scenario: Shortcut target is unsafe or invalid
- **WHEN** a shortcut cannot be parsed, resolves to an unsupported target, or contains a launch identity the host cannot safely preserve
- **THEN** the scanner excludes it, records a non-fatal diagnostic, and continues indexing other entries

#### Scenario: Machine and user entries duplicate an application
- **WHEN** equivalent application identities appear in both Start Menu roots
- **THEN** the system returns one deterministic item and preserves the preferred user-visible entry

### Requirement: The index provides a localized system-settings catalog
The system SHALL add only host-defined system-setting records supported by the current platform, with stable IDs, zh-CN/en-US labels, aliases, and private platform destinations.

#### Scenario: Supported platform catalog is built
- **WHEN** indexing runs on macOS or Windows
- **THEN** the catalog includes at least general, display, network, Bluetooth, sound, keyboard, mouse or trackpad, notifications, and privacy/security where the platform supports them

#### Scenario: Platform does not support a catalog item
- **WHEN** a host-defined setting has no validated destination for the current platform
- **THEN** the setting does not appear in the searchable index for that platform

#### Scenario: Catalog is serialized to a search result
- **WHEN** a setting matches a query
- **THEN** the result contains its stable setting ID and user-facing metadata but does not reveal or accept its underlying URI

### Requirement: Search forms support English, Chinese, pinyin, initials, acronyms, and aliases
The system SHALL precompute normalized searchable forms for every indexed item and SHALL match queries against display text, lowercased English, pinyin full spelling, pinyin initials, word initials, and bundled aliases.

#### Scenario: English name matches
- **WHEN** the user enters a case-insensitive subsequence or prefix of an English application name
- **THEN** the application is returned with textual relevance reflected in its rank

#### Scenario: Chinese full pinyin matches
- **WHEN** an indexed Chinese title such as `微信` has full pinyin `weixin` and the user enters `weixin`
- **THEN** the Chinese-titled item is returned

#### Scenario: Pinyin initials match
- **WHEN** an indexed Chinese title such as `微信` has initials `wx` and the user enters `wx`
- **THEN** the Chinese-titled item is returned

#### Scenario: Bundled alias matches
- **WHEN** an application has a host-defined alias such as `ps` for Photoshop and the user enters that alias
- **THEN** the corresponding application is returned without changing its displayed official name

#### Scenario: Query contains unsupported length or malformed data
- **WHEN** a query exceeds the host limit or cannot be normalized safely
- **THEN** search returns a structured validation error and does not allocate unbounded work

### Requirement: Ranking is deterministic and relevance-first
The system SHALL rank candidates primarily by exact, prefix, and fuzzy textual quality, then by bounded alias/pinyin quality, usage frequency, recency, and running state, with stable deterministic tie breakers.

#### Scenario: Exact match and fuzzy match compete
- **WHEN** one item exactly matches the normalized query and another only fuzzy-matches it
- **THEN** the exact match ranks first regardless of a bounded frequency difference

#### Scenario: Equal textual scores compete
- **WHEN** two items have equal textual match quality
- **THEN** bounded recent-use, frequency, and running boosts decide order before title and stable ID tie breakers

#### Scenario: Search is repeated against unchanged state
- **WHEN** the same query, index revision, running-state snapshot, and usage snapshot are searched repeatedly
- **THEN** result ordering is identical

### Requirement: In-memory matching avoids input-path disk access
The system SHALL perform query normalization, fuzzy matching, ranking, and result limiting against the current in-memory index without scanning application directories, parsing bundles/shortcuts, writing usage data, or decoding icons on the input path.

#### Scenario: User types successive characters
- **WHEN** search requests arrive for successive query values
- **THEN** each request reads the current memory snapshot and performs no application-directory traversal

#### Scenario: Performance benchmark runs
- **WHEN** the release-mode search benchmark queries at least 10,000 deterministic mixed-language fixture entries on documented reference hardware
- **THEN** the pure in-memory matching phase reports p50 and p95 and meets the `< 5ms` p95 target or blocks completion with a documented optimization decision

#### Scenario: Results include icons
- **WHEN** visible rows request application icons
- **THEN** icon extraction occurs lazily outside the fuzzy-matching phase and failure does not change textual ordering

### Requirement: Valid cached index is usable before background refresh
The system SHALL atomically persist a versioned platform-specific application index and SHALL load a valid cache into memory before starting an asynchronous disk refresh.

#### Scenario: Valid cache exists at startup
- **WHEN** ZTool starts with a compatible `apps_cache.json`
- **THEN** Quick Launcher can search cached entries immediately while a background refresh validates current application roots

#### Scenario: Cache is missing
- **WHEN** no cache exists
- **THEN** the system exposes an initializing state, performs a background scan, and atomically creates a versioned cache after successful discovery

#### Scenario: Cache is corrupt or incompatible
- **WHEN** cache JSON is malformed, has an unsupported schema, or belongs to another platform
- **THEN** the system ignores or quarantines it, reports a non-fatal diagnostic, and rebuilds without crashing ZTool

#### Scenario: Refresh finishes
- **WHEN** a background scan succeeds
- **THEN** the system swaps one complete new in-memory revision and atomically replaces the cache without exposing a partial index

### Requirement: Application directory changes trigger coalesced refresh
The system SHALL monitor supported application roots where possible, coalesce related filesystem events, and refresh the index without running overlapping scans.

#### Scenario: Application is installed
- **WHEN** a watcher observes relevant files for a newly installed application and the debounce interval expires
- **THEN** one background refresh adds the valid application and publishes a new revision

#### Scenario: Application is removed
- **WHEN** a watcher observes removal of an indexed application and refresh confirms it is absent
- **THEN** the new revision removes that application and activation by its stale ID is rejected

#### Scenario: Event storm occurs
- **WHEN** many related bundle or shortcut events arrive within the debounce interval
- **THEN** the system coalesces them into one refresh and does not run concurrent index writers

#### Scenario: Watcher is unavailable
- **WHEN** a root cannot be watched because it is missing, unsupported, or permission-restricted
- **THEN** cached/manual/startup refresh remains available and the snapshot reports degraded watcher diagnostics

### Requirement: Running state is refreshed independently of durable metadata
The system SHALL treat application running/focus state as short-lived runtime data and MUST NOT persist it as authoritative state in `apps_cache.json`.

#### Scenario: Cached app exited since shutdown
- **WHEN** an application was running before ZTool stopped but is not running after restart
- **THEN** search results report the current non-running state rather than a cached running flag

#### Scenario: Runtime probe is temporarily unavailable
- **WHEN** the platform cannot reliably determine an application's current running state
- **THEN** the result uses an explicit unknown/non-confirmed state and activation follows the safe platform fallback without claiming focus

### Requirement: Usage history remains local, bounded, and success-based
The system SHALL store versioned usage count and last-used time only after confirmed activation, SHALL cap retained records, and SHALL never persist raw search queries.

#### Scenario: Activation succeeds
- **WHEN** an application is focused/launched or a setting opens successfully
- **THEN** the system atomically updates that item's bounded count and last-used time in `usage.json`

#### Scenario: Old entry disappears
- **WHEN** a usage record references an item absent beyond the configured retention period
- **THEN** maintenance may remove that usage record without affecting current indexed items

#### Scenario: Usage file is corrupt
- **WHEN** `usage.json` cannot be parsed or has an unsupported schema
- **THEN** the system starts with empty usage weights, reports a diagnostic, and leaves the application index usable

#### Scenario: User enters a query
- **WHEN** search executes locally
- **THEN** the query is not written to cache, usage history, diagnostics, or a remote service
