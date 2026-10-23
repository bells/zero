## Purpose

Make the new bilingual Markdown editor discoverable as a text tool while preserving existing tool routes, category/search privacy, static guidance and truthful separation from the desktop product.

## ADDED Requirements

### Requirement: Text category and bilingual Markdown routes
The directory SHALL add Text with stable category value `text` and localized labels 文本类 / Text, alongside All, Development and Images. Markdown SHALL belong to Text; the four existing development tools and three image tools SHALL retain their categories. The website SHALL serve `/tools/markdown/` and `/en/tools/markdown/` with configured site-base support, preserve all existing tool/documentation URLs and avoid displaying empty future categories. This addition extends the earlier seven-tool directory to eight without moving diff.

#### Scenario: Visitor selects Text
- **WHEN** a visitor selects Text in either localized directory
- **THEN** Markdown appears with an ordinary runnable-tool link
- **AND** selecting All shows eight online tools while desktop documentation remains separate

#### Scenario: Visitor switches directory language
- **WHEN** the visitor changes language with the Text category selected beneath a configured base
- **THEN** the equivalent directory retains only the validated category value
- **AND** search text or document content is not transferred in the navigation URL

### Requirement: Category-local search and eight-tool global search
Directory search SHALL filter within the selected category with a View all categories recovery action that retains the in-memory query. All-tool search SHALL discover all eight tools independently of the directory category and preserve keyboard selection, Escape, focus restoration and IME behavior. Queries MUST remain in page memory without URL, storage, logs or telemetry persistence. Markdown editor shortcuts MUST NOT replace this search behavior.

#### Scenario: Visitor searches for Markdown under Images
- **WHEN** a visitor searches for Markdown with Images selected
- **THEN** an understandable empty state offers View all categories
- **AND** recovery retains the query and reveals Markdown, while global search can find it directly

### Requirement: Static bilingual guidance and accurate discovery metadata
The Markdown page SHALL pre-render localized title/description, instructions, labeled examples, supported syntax/imports, limits, draft/image privacy, all three download formats, Print guidance and FAQ. HTML, browser-agent guidance, WebApplication features and AI indexes SHALL share accurate content. Canonical, reciprocal language links and sitemap SHALL include the two new pages and exclude category-query variants; preview/error noindex behavior and truthful acquisition claims MUST remain effective. Directory descriptions and tool counts SHALL reflect the eight-tool set rather than only development/images.

#### Scenario: Crawler reads the editor without scripts
- **WHEN** a crawler or no-script visitor fetches a localized Markdown page
- **THEN** meaningful instructions and ordinary navigation describe the editor and direct Markdown/HTML/PDF downloads
- **AND** the page identifies computation as requiring JavaScript, without claiming a remote API or an existing desktop Markdown plugin

### Requirement: Accessible discovery and isolated static delivery
Navigation/category/search controls SHALL have localized accessible names, visible focus and touch targets at least 44 by 44 CSS pixels, and remain usable at 320 CSS pixels and 200 percent zoom. The editor SHALL build within the independent static website without desktop/File-engine dependencies. Initial automatically executed JS gzip MUST remain at most 50 KiB and first-viewport resources at most 1 MiB; heavy editor/renderer/PDF/font assets SHALL load only after the relevant interaction. Product pages and existing tools MUST NOT download Markdown-specific runtime assets.

#### Scenario: Visitor opens the directory before editor interaction
- **WHEN** a visitor loads a directory, product page or basic Markdown page without requesting its heavy features
- **THEN** automatic resources remain within the initial budget and no PDF or Chinese-PDF font is downloaded
- **AND** failure to load enhanced assets preserves the basic input/source-download path

### Requirement: Stable optional Markdown feedback identity
Where the existing feedback integration is enabled, Markdown SHALL use stable allowlisted thread `tools/markdown`, shared across its Chinese/English routes. Existing directory and tool threads MUST retain their identities. The addition MUST preserve default-disabled configuration, click-loaded cross-origin isolation and thread/locale-only embedding context.

#### Scenario: Visitor opens either language's Markdown feedback
- **WHEN** a visitor explicitly activates enabled feedback on a localized Markdown page
- **THEN** the same Markdown thread is selected with the correct locale
- **AND** earlier tool thread IDs and their privacy behavior remain unchanged
