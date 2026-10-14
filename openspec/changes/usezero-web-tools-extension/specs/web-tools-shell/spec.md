## Purpose

Provide a discoverable bilingual browser toolbox within the Zero website, with accessible navigation, bounded local processing, explicit privacy behavior and truthful links to the separate desktop product.

## ADDED Requirements

### Requirement: Bilingual directory and compatible routes
The website SHALL serve Chinese `/tools/` and English `/en/tools/` directories and corresponding `timestamp/`, `json/` and `base64/` pages. It MUST preserve existing desktop documentation routes and distinguish runnable web tools from desktop documentation in navigation and directory content. Language changes SHALL reach the equivalent tool; site-base configuration MUST apply to all links and assets.

#### Scenario: Visitor finds an online tool alongside desktop documentation
- **WHEN** a visitor opens either language's tools directory
- **THEN** three runnable tools have ordinary links and distinct descriptions, with desktop documentation in a separate labeled area
- **AND** existing Snap, Launch, Awake, Paper and File documentation remains reachable at its original URLs

#### Scenario: Visitor changes language under a deployment subpath
- **WHEN** a visitor switches language from a tool under a configured site base
- **THEN** the equivalent tool opens in the other language with valid same-base navigation and assets

### Requirement: Accessible search and themes in the tools area
The tools area SHALL provide a visible search action and Cmd/Ctrl+K search of the three online tools, localized labels, light/dark/system themes, visible focus, WCAG AA contrast, reduced-motion behavior and targets at least 44 by 44 CSS pixels. Search MUST support keyboard selection, Escape, focus containment and focus restoration, and MUST ignore shortcut events during IME composition. These shortcuts MUST be scoped to the tools area. Essential controls SHALL remain usable at 320 CSS pixels and 200 percent zoom without page-level horizontal overflow.

#### Scenario: Keyboard visitor searches and closes the dialog
- **WHEN** a visitor opens search, filters tools, selects with Arrow/Enter or closes with Escape
- **THEN** results and empty states are understandable, focus stays in the dialog while open and returns to the invoking control after dismissal
- **AND** the shortcut does not override browser behavior outside the tools area

#### Scenario: Visitor uses dark theme on a narrow screen
- **WHEN** a visitor chooses dark theme on a 320 CSS pixel viewport
- **THEN** the full tool page including navigation and footer is readable and controls remain reachable
- **AND** blocked preference storage falls back to system theme without breaking the tool

### Requirement: Local and ephemeral tool content
Tool inputs, results, files and search queries MUST be processed locally and MUST NOT be transmitted by tool code, included in URLs, logged, sent to telemetry or persisted to site storage. Only a theme enum SHALL be eligible for preference persistence. Tool code MUST NOT fetch user-supplied URLs or require third-party runtime resources. Pages SHALL explain local processing and first-load network requirements without promising absolute security, zero latency or first-visit offline operation.

#### Scenario: Synthetic private content is processed
- **WHEN** a visitor processes synthetic private content and clears or leaves the tool
- **THEN** network and site-storage observation show no input/result/query content, and the application releases associated state and preview resources
- **AND** clipboard or file export occurs only after an explicit user action

### Requirement: Bounded processing and recoverable failures
The tools SHALL publish and enforce input/output limits before expensive work: timestamp 256 characters; JSON/text inputs 1 MiB UTF-8; JSON depth 128; text outputs 8 MiB; image bytes 5 MiB; encoded image inputs 7 MiB; image dimensions 16 million pixels. Expensive operations MUST keep navigation/cancellation responsive, support cancellation, fail after 5 seconds of processing, reject stale completions and preserve source input on failure. A failure or changed input MUST invalidate any previous output for copying/export.

#### Scenario: Oversized or cancelled work does not replace current state
- **WHEN** input exceeds a published limit, a running task is cancelled, times out or completes after a newer request
- **THEN** an appropriate localized status is shown and only the latest successful request can supply an active result
- **AND** source input and access to clear, retry and navigation remain available

### Requirement: Honest clipboard feedback
Copy actions SHALL copy the displayed current value only after a user gesture. Clipboard denial or unavailability MUST produce a manual selection/copy fallback and MUST NOT report success. Status messages SHALL be accessible without moving focus; live clocks MUST NOT cause continuous screen-reader announcements.

#### Scenario: Clipboard access is denied
- **WHEN** a visitor copies a result and the browser denies clipboard access
- **THEN** the value remains available for manual copying and a localized failure message is announced without a success toast

### Requirement: Static discovery and truthful acquisition
Every new page SHALL contain unique localized titles/descriptions, a single main heading, static tool descriptions, examples, input semantics, limits, privacy information and FAQ, with reciprocal language links, canonical URLs, sitemap and generated AI-index references. Tool structured data MUST identify browser capabilities separately from the desktop application, without fabricated ratings or delivery claims. Preview and error exclusions MUST remain effective. Without JavaScript, content and navigation MUST remain usable and computation MUST be clearly identified as requiring JavaScript.

#### Scenario: A crawler or no-script visitor reads a tool
- **WHEN** the tool page is requested without executing scripts
- **THEN** meaningful localized content, example semantics, limitations and navigation are present in HTML
- **AND** discovery metadata identifies the correct browser tool, while previews remain noindex

#### Scenario: No desktop package is publicly available
- **WHEN** the acquisition catalog has no matching public package
- **THEN** the tool CTA links to accurate trial/product information without an invented download
- **AND** the page states these web tools are not currently included in Zero desktop and does not promise a desktop shortcut for them

### Requirement: Isolated static delivery and performance
The toolbox SHALL build as part of the independent static website without desktop runtime or File-engine dependencies. Existing product pages MUST NOT load tool editors. Tool pages and directory SHALL meet initial executable JS gzip ≤50 KiB and first-viewport resources ≤1 MiB; fixed mobile laboratory checks SHALL target performance/accessibility ≥95, LCP ≤2.5s and CLS ≤0.1. Enhanced editor assets SHALL load only after user interaction, with usable basic input if enhancement fails.

#### Scenario: Visitor loads a basic tool before editor interaction
- **WHEN** a visitor opens a tool or directory without requesting editor enhancement
- **THEN** the initial resource budget includes all automatically loaded executable assets and remains within its limits
- **AND** visiting a product or desktop documentation page does not download the enhanced tool editor
