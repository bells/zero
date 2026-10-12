## Purpose

为 Zero 建立清楚、可信且易访问的产品官网，帮助桌面用户理解快速入口、完整工作区与工具场景的关系，并在不同语言与屏幕尺寸下找到实际可用的获取和使用信息。

## ADDED Requirements

### Requirement: Search and AI discovery content
The website SHALL provide equivalent Chinese and English tool pages, an installation guide and FAQ with factual platform/release limitations, maintained review dates, sources and static internal links. Search titles MUST identify the product or page purpose. JSON-LD MUST consistently identify the website, software and current page, using codeRepository only on SoftwareSourceCode. Public AI text indexes SHALL derive from the same content and catalog, with valid canonical references; previews MUST not advertise an indexable production text index.

#### Scenario: A crawler reads a tool or guide without JavaScript
- **WHEN** a crawler requests a tool, installation or FAQ page
- **THEN** it receives its full content, localized metadata and equivalent language links
- **AND** the page explains current delivery boundaries and links to maintained source information

#### Scenario: An AI reader requests the public text index
- **WHEN** the reader requests llms.txt or llms-full.txt
- **THEN** product facts and canonical references match the current website content and release catalog
- **AND** unpublished packages, File and public third-party runtime are not falsely described as delivered

### Requirement: Error pages excluded from discovery
Error pages SHALL declare noindex and SHALL omit product structured data and canonical/alternate discovery links. The supported Vercel deployment configuration MUST avoid serving the direct English error route as an indexable successful document; missing routes MUST retain an HTTP 404 status.

#### Scenario: A crawler requests a missing or explicit error route
- **WHEN** a crawler requests a missing route or an explicit error route on the configured host
- **THEN** the host responds with an HTTP 404 and noindex error content
- **AND** error routes are absent from the sitemap

### Requirement: Product identity and multiple surfaces
The website SHALL introduce Zero as a desktop toolbox with quick status-bar or tray actions, a full main-window workspace, and task-specific surfaces. It MUST use the existing Zero brand mark and show the relationship between quick access and complete workflows.

#### Scenario: First-time visitor understands the product
- **WHEN** a visitor opens the homepage
- **THEN** the first section identifies Zero, explains its desktop purpose and provides a visible acquisition or trial-information link
- **AND** the page illustrates both quick actions and a main-window workflow rather than presenting all work as a tray-sized panel

### Requirement: Truthful tool and platform presentation
The website SHALL describe Snap, Awake, Paper, Launch and File through concrete user tasks and SHALL place material platform and delivery differences next to affected features. It MUST distinguish development capabilities from those included in downloadable packages.

#### Scenario: Screenshot workflow differs by platform
- **WHEN** a visitor reads the Snap feature presentation
- **THEN** custom capture and editing are identified as macOS features and Windows is described as opening the system screenshot interface
- **AND** screenshots of macOS features are not presented as Windows feature evidence

#### Scenario: File is outside the trial package
- **WHEN** the current recommended standard package excludes File
- **THEN** File's presentation says it is in development and absent from that trial package
- **AND** OCR or third-party plugin availability is not described as included without matching public-package evidence

#### Scenario: Network use is explained accurately
- **WHEN** a visitor reads offline or privacy information
- **THEN** the website distinguishes local operations from network-dependent wallpaper retrieval or update/download access
- **AND** the page does not claim every tool operates completely offline

### Requirement: Real and attributable product imagery
Product imagery SHALL use real Zero interfaces captured with safe sample data, identify material platform differences, and provide meaningful text alternatives. Interactive previews MUST be distinguishable from native tool execution.

#### Scenario: Visitor selects a workflow preview
- **WHEN** a visitor selects a displayed tool or surface
- **THEN** the website shows the corresponding interface illustration and explanatory text with a clear selected state
- **AND** the preview does not request files, capture the visitor's screen, or imply it executed a native Zero command

#### Scenario: Product imagery is reviewed
- **WHEN** a maintainer reviews a published product image
- **THEN** its originating platform, product version or build profile and capture date are available in maintained asset records
- **AND** the image contains no private files, credentials, clipboard contents or personal desktop details

### Requirement: Equivalent Chinese and English navigation
The website SHALL provide Chinese and English home and download pages with equivalent essential functionality and factual content. Language changes MUST retain the equivalent page and any matching section anchor.

#### Scenario: Visitor switches languages on a section
- **WHEN** a visitor changes from Chinese to English on a tool section or download page
- **THEN** the equivalent English page opens at the corresponding section when it exists
- **AND** navigation, package state and important platform limitations remain available in English

### Requirement: Responsive and accessible website
The website SHALL support keyboard navigation, visible focus, WCAG AA text/control contrast, reduced motion, meaningful headings and touch targets of at least 44 by 44 CSS pixels. At widths from 320 CSS pixels and at 200 percent zoom, essential content and controls MUST remain usable without horizontal page overflow.

#### Scenario: Mobile visitor explores the site
- **WHEN** a visitor opens the site on a 320 or 390 CSS pixel viewport
- **THEN** navigation, previews, feature limitations and download choices are readable and reachable
- **AND** mobile presentation does not claim a mobile Zero application is available

#### Scenario: Keyboard and reduced-motion visitor
- **WHEN** a visitor navigates with a keyboard and prefers reduced motion
- **THEN** every interactive control is reachable with visible focus and an accessible name
- **AND** preview changes remain understandable without animated transitions or scroll locking

### Requirement: Essential content without client scripts
The website SHALL make product text, platform limitations, language links, acquisition information and repository/documentation links available when client-side JavaScript is disabled or fails.

#### Scenario: Scripts are unavailable
- **WHEN** the visitor disables JavaScript
- **THEN** the site remains readable and navigable and shows static workflow imagery
- **AND** the visitor can reach all advertised public packages or the truthful trial-information fallback

### Requirement: Discoverable static pages and isolated delivery
The website SHALL provide localized document metadata, canonical and alternate-language URLs, a sitemap and social sharing metadata without fabricated product ratings or unsupported platforms. Its build MUST produce independently hostable static assets without requiring the desktop runtime or including desktop/File-engine binaries.

#### Scenario: Search engine reads a production page
- **WHEN** a crawler requests a production homepage or download page
- **THEN** it receives meaningful product content and correct page-language, canonical and alternate-language metadata
- **AND** temporary preview deployments can be excluded from indexing

#### Scenario: Website is built separately
- **WHEN** a maintainer builds the website
- **THEN** independently hostable static output is produced without building or executing the desktop application
- **AND** website assets and dependencies are absent from desktop installation packages
