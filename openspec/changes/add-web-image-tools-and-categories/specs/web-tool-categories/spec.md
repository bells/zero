## Purpose

Organize the bilingual browser toolbox into meaningful categories while preserving existing routes, all-tool discovery, local search privacy and optional isolated feedback as image tools are added.

## ADDED Requirements

### Requirement: Categorized bilingual directory and compatible routes
The tools directory SHALL default to All and expose All, Development and Images with localized labels. Timestamp, JSON, Base64/URL and diff SHALL belong to Development; watermark, conversion and compression SHALL belong to Images. The website MUST preserve existing tool and desktop documentation URLs and SHALL serve image-watermark/, image-converter/ and image-compressor/ beneath both /tools/ and /en/tools/ with site-base support. Empty future categories MUST NOT be displayed.

#### Scenario: Visitor selects the image category
- **WHEN** a visitor selects Images in either localized directory
- **THEN** the directory displays the three runnable image tools with distinct descriptions and ordinary tool links
- **AND** selecting All restores all seven online tools while desktop documentation remains separately identified

#### Scenario: Visitor changes language with a selected category
- **WHEN** a visitor changes directory language under a configured site base
- **THEN** the equivalent localized directory retains the selected category using only a validated category enum in navigation
- **AND** invalid category values fall back to All without transferring search text, files or tool settings

### Requirement: Category-local search and all-tool search
Directory search SHALL filter within the selected category and offer a View all categories recovery action when no results match. Existing all-tool search SHALL continue to cover all seven tools independently of directory category. Queries MUST stay in current-page memory and MUST NOT appear in URLs, site storage, logs or telemetry.

#### Scenario: Visitor searches for JSON within Images
- **WHEN** a visitor searches for JSON while Images is selected
- **THEN** the directory shows an understandable empty state and a View all categories action
- **AND** activating that action retains the in-memory query and reveals the matching development tool

#### Scenario: Visitor opens all-tool search from Images
- **WHEN** a visitor opens the existing search dialog and searches for JSON
- **THEN** JSON remains discoverable regardless of the directory category
- **AND** keyboard selection, Escape, focus containment/restoration and IME shortcut handling remain usable

### Requirement: Accessible static discovery for seven tools
All seven tools SHALL be discoverable through pre-rendered bilingual descriptions and ordinary links without JavaScript. Category/search controls MUST have localized accessible names, visible focus and practical touch targets; essential controls SHALL work at 320 CSS pixels and 200 percent zoom without page-level horizontal overflow. Each new tool SHALL provide actual operating steps, examples, format/limit/privacy guidance, FAQ and browser-agent guidance shared with generated discovery content. Canonical, reciprocal language links, sitemap, AI indexes and browser-tool structured data SHALL include the six new pages without indexing category-query variants. Preview/error noindex behavior and truthful desktop acquisition claims MUST remain effective.

#### Scenario: Crawler or no-script visitor opens an image tool
- **WHEN** a new image tool or the directory is fetched without scripts
- **THEN** meaningful localized guidance and navigation remain available and computation is identified as requiring JavaScript
- **AND** discovery content describes browser controls rather than a remote image-processing API or an existing desktop plugin

### Requirement: Stable isolated feedback threads for image tools
Where feedback is enabled, each new image tool SHALL have its own stable allowlisted thread shared by both languages. Existing directory and tool threads MUST retain their identities. Feedback MUST remain click-loaded in a separate origin and MUST transmit only the allowlisted thread identifier and locale as embedding context; image content, filenames, metadata, settings, search text and results MUST NOT be forwarded. Feedback failure or disabled configuration MUST NOT prevent image processing.

#### Scenario: Visitor opens feedback with private image data present
- **WHEN** a visitor activates feedback on either language version of an image tool
- **THEN** the corresponding language-independent image thread opens without any image or tool-state context
- **AND** no feedback-origin request occurs before activation and existing moderation/text-only rules remain in force
