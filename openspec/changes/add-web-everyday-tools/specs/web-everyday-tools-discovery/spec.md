## Purpose

Make eight additional browser-local tools discoverable and consistently usable through the existing bilingual toolbox, with a fourth category, bounded execution and isolated optional feedback.

## ADDED Requirements

### Requirement: Seventeen tools across four compatible categories
The catalog SHALL add qrcode, text-cleanup, hash, regex, sql, date-calculator, password and cron beneath both /tools/ and /en/tools/. Their categories SHALL be Images, Text, Development, Development, Development, Dates and calculations, Development and Development respectively. The completed catalog SHALL contain 17 tools with category counts 10, 4, 2 and 1 for Development, Images, Text and Dates and calculations. Existing tool URLs and category identifiers MUST retain their meanings. Category filtering SHALL default to All and reject unknown category values by falling back to All.

#### Scenario: Visitor filters the expanded catalog
- **WHEN** a visitor selects Dates and calculations in either locale
- **THEN** date-calculator is available through an ordinary localized tool link
- **AND** selecting All restores the complete catalog and changing locale preserves only a validated category value

### Requirement: Shared bilingual discovery and accessible controls
Each addition SHALL have localized static operating steps, verified examples, format and resource boundaries, privacy guidance, FAQ and browser-agent instructions. Catalog search and global search SHALL cover all 17 tools with localized names and capability terms. Canonical and reciprocal language links, sitemap, structured data and AI indexes SHALL include the 16 new localized tool pages with site-base support. Static descriptions and navigation MUST be available without JavaScript. Essential controls MUST provide keyboard access, visible focus, status announcements and usable layouts at 320 CSS pixels and 200 percent zoom.

#### Scenario: Crawler discovers a new tool
- **WHEN** a crawler fetches either language version of a new tool without running scripts
- **THEN** it receives meaningful guidance and canonical navigation matching the shared discovery content
- **AND** preview and error pages retain their noindex policy

#### Scenario: Visitor searches within a category
- **WHEN** a visitor searches for SQL while Images is selected
- **THEN** the existing category recovery action can reveal SQL using the in-memory query
- **AND** the query is absent from navigation URLs and storage

### Requirement: Current results and explicit user actions
All eight tools SHALL execute only after an explicit action. Input, mode or computation-setting changes SHALL invalidate current results and terminate pending work. Errors, cancellation and timeout SHALL preserve editable inputs and settings while disabling obsolete result actions. Delayed reads, dependency loads and computation results MUST NOT replace newer state. Copy and download SHALL use the complete current result, including successful empty text where applicable. Clear, replacement and page exit SHALL release active workers, files, previews, resource URLs and copy-fallback content.

#### Scenario: Visitor edits during computation
- **WHEN** a visitor changes input while a task or file read is pending
- **THEN** previous work is cancelled and its late completion cannot populate the result or enable download
- **AND** a later explicit execution can produce a fresh result

#### Scenario: Copy permission fails
- **WHEN** copying a current result fails
- **THEN** the page offers the existing manual-copy path for that complete result
- **AND** clearing or leaving the tool releases the fallback content

### Requirement: Local content and bounded execution
Tool inputs, filenames, settings and results SHALL remain in current-page memory and local computation. They MUST NOT be placed in URLs, site storage, logs, telemetry or feedback context. New tools SHALL disclose that initial site assets and on-demand code still require network access. Ordinary text input SHALL be limited to 1 MiB UTF-8, complete serialized output to 8 MiB and task execution to five seconds unless the tool specification defines a narrower or specialized limit. Limits SHALL be enforced during processing and output construction, with explicit errors and actual cancellation. Heavy calculation dependencies SHALL load on demand. Initial JavaScript gzip SHALL remain within 50 KiB and first-viewport resources within 1 MiB per measured route.

#### Scenario: Resource limit is exceeded
- **WHEN** an input, output or execution exceeds its declared limit
- **THEN** the tool reports the corresponding localized failure and exposes no partial result as complete
- **AND** the visitor retains input and can change it or retry

### Requirement: Eighteen stable feedback threads
The feedback allowlist SHALL add tools/qrcode, tools/text-cleanup, tools/hash, tools/regex, tools/sql, tools/date-calculator, tools/password and tools/cron, producing 18 stable threads including the directory and existing tools. Both languages SHALL use the same tool thread. Feedback SHALL retain its default-disabled, click-loaded, separate-origin behavior, with only thread and locale passed as embedding context. Feedback unavailability MUST NOT block tool execution.

#### Scenario: Visitor opens feedback after generating a password
- **WHEN** feedback is explicitly activated on a new tool
- **THEN** only the allowlisted thread and locale are passed as embedding context
- **AND** tool content is absent and no feedback-origin request occurred before activation
