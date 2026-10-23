## Purpose

Let visitors download the current Markdown document as portable source, styled HTML and a text-based PDF generated in the browser, with clear fidelity boundaries and recoverable failures.

## ADDED Requirements

### Requirement: Explicit source copy and Markdown download
The tool SHALL provide separate source-copy and `.md` download actions for the current document, using UTF-8 and a safe filename. Clipboard denial MUST preserve a manual-copy fallback and MUST NOT report success. Downloaded bytes, MIME and extension MUST agree; editor chrome, demos and obsolete document versions MUST NOT enter the output.

#### Scenario: Visitor downloads edited Markdown
- **WHEN** a visitor edits source and activates Download Markdown
- **THEN** the downloaded `.md` contains the current source with the documented text normalization
- **AND** no source content is transmitted to a server or downloaded before the explicit action

### Requirement: Standalone styled HTML download
The tool SHALL directly download a complete UTF-8 `.html` document containing sanitized document content and embedded layout/highlighting styles, with appropriate document language and title. It MUST exclude editor UI, executable scripts, active raw HTML and automatically fetched external dependencies. Authorized image bytes that can be safely embedded SHALL be included locally; unavailable images SHALL follow the explicit omission decision below. Headings, tables, code, text links and document anchors SHALL remain usable when the HTML is opened independently.

#### Scenario: Visitor opens the downloaded HTML independently
- **WHEN** a visitor downloads HTML and opens it without the Zero website or network access
- **THEN** document text, embedded styles and successfully embedded images remain readable
- **AND** opening the file does not automatically request third-party scripts, styles, fonts or image URLs

### Requirement: Direct text-based PDF download
The tool SHALL generate a `.pdf` locally in the browser and expose an explicit direct-download action. Opening the browser print dialog MUST NOT substitute for this action. Default PDF layout SHALL use A4 portrait, light document styling and automatic pagination. Supported Chinese/Latin document text MUST remain selectable and searchable, and text links SHALL retain their destinations. Whole-page screenshot output MUST NOT be used to satisfy the text requirement. Required font resources MUST be self-hosted and requested only when needed for PDF export, without sending source text or character lists to a font service.

#### Scenario: Visitor downloads a Chinese and English document
- **WHEN** a visitor downloads a PDF containing supported Chinese/Latin paragraphs and a link
- **THEN** a valid `.pdf` downloads without requiring print-to-file steps or a document-generation server
- **AND** opening the file permits selecting/searching the document text and following its link

#### Scenario: Required font cannot be loaded
- **WHEN** a required font is unavailable, exceeds its limit or cannot represent required text
- **THEN** the tool reports the export problem without silently producing missing/garbled text or a screenshot replacement
- **AND** editing, Markdown/HTML export and retry remain available

### Requirement: Paginated PDF document fidelity
PDF export SHALL preserve supported headings, lists, quotes, task state, tables, strikethrough and code semantics. Multi-page tables SHALL repeat header rows; wide content MUST NOT be silently cropped. Long code blocks SHALL remain readable across pages, using export wrapping for long lines without dropping characters. Heading placement SHALL avoid an isolated heading at the foot of a page when its following content can be moved. Website controls and browser URL/date headers MUST NOT become document content. Pixel-identical preview/PDF output is not required.

#### Scenario: Visitor exports long code and a multi-page table
- **WHEN** a document includes a long fenced block, an over-wide code line and a table spanning pages
- **THEN** the PDF retains the code text and all table content without horizontal cropping, and subsequent table pages repeat headers
- **AND** code and table boundaries remain readable through page transitions

### Requirement: Explicit image inclusion decisions
Export MUST NOT fetch unauthorized image sources. If an image is blocked, unsupported, over-limit or unreadable for embedding, the tool SHALL explain which image cannot be included and offer an explicit choice to continue with a safe placeholder, return to editing or cancel. It MUST NOT silently omit images or use a server proxy. HTML and PDF SHALL reuse only authorized, validated local image bytes.

#### Scenario: An external image is refused by CORS
- **WHEN** an authorized image cannot be read for embedding and the visitor requests HTML or PDF
- **THEN** the tool explains the missing image and waits for an explicit continue/cancel decision
- **AND** continuing produces a clear placeholder without embedding an automatic external fetch

### Requirement: Current bounded and cancellable export jobs
Exports SHALL use an immutable current-document snapshot and publish/enforce output-byte, PDF-page, font/image-resource and execution-time limits. Heavy generation MUST remain cancellable and keep navigation/editing responsive. A newer document, cancellation or page exit MUST invalidate pending results and prevent delayed downloads. Dependencies, encoding, limit and download failures SHALL preserve source and expose honest localized states; retry MUST NOT download an obsolete result.

#### Scenario: Visitor edits while PDF generation runs
- **WHEN** a visitor changes source or cancels an in-progress PDF export
- **THEN** the old job cannot produce an automatic download or an active current result
- **AND** the current source remains editable and a new export can be requested

#### Scenario: A long document exceeds the export policy
- **WHEN** PDF layout exceeds the published page/time limit or an output exceeds its byte limit
- **THEN** the tool reports the applicable limit without a truncated or mislabeled success file
- **AND** the visitor can revise the document or use another supported export

### Requirement: Independent print action
The tool SHALL provide an independently labeled Print action with a document-only print layout. Its guidance SHALL identify browser printing/Save as PDF separately from direct PDF download. Printing SHALL exclude website navigation, editing controls and unrelated page content.

#### Scenario: Visitor chooses to print
- **WHEN** a visitor activates Print
- **THEN** the browser receives the document-only print layout
- **AND** the direct Download PDF action remains a separately implemented operation
