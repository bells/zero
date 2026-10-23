## Purpose

Provide a bilingual single-document Markdown workspace for writing and inspecting common technical documents in the browser, with predictable editing controls and bounded local processing.

## ADDED Requirements

### Requirement: Responsive source and preview workspace
The Markdown tool SHALL provide Source, Preview and Split modes, defaulting to Split on wide screens and Source with a reachable Preview switch on narrow screens. It SHALL follow the website light/dark/system theme and provide an accessible expandable fullscreen workspace with an exit action. Essential controls MUST remain reachable at 320 CSS pixels and 200 percent zoom without page-level horizontal overflow.

#### Scenario: Visitor edits on a phone
- **WHEN** a visitor opens the tool on a narrow screen and switches between source and preview
- **THEN** the same document remains available in each mode without forcing two narrow side-by-side panes
- **AND** controls, focus, theme and the fullscreen exit remain usable

#### Scenario: Visitor leaves fullscreen
- **WHEN** the visitor exits an expanded workspace with Escape or its exit control
- **THEN** the normal page layout returns and focus returns to the initiating control
- **AND** unsupported native fullscreen does not remove access to the editor

### Requirement: Common Markdown and GFM preview
The tool SHALL render common Markdown headings, paragraphs, emphasis, links, blockquotes, ordered/unordered lists, rules and code, plus GFM tables, task lists and strikethrough. Supported code languages SHALL receive highlighting; unknown languages SHALL remain readable as plain code. Formula and Mermaid execution, rich-text editing and raw HTML execution MUST NOT be implied by the preview. Source changes SHALL update the current preview without accepting stale render results.

#### Scenario: Visitor previews a technical note
- **WHEN** source contains a heading, table, checked task, fenced code and an unknown language fence
- **THEN** the preview preserves their document semantics and renders the unknown fence as readable code
- **AND** changing source during rendering prevents the old result from replacing the newer document

### Requirement: Editing assistance and document navigation
The tool SHALL provide a source-formatting toolbar, undo/redo, find/replace, common editing shortcuts, character/word statistics and a heading outline. Toolbar edits MUST preserve coherent selection and undo behavior. Outline entries SHALL navigate to their corresponding headings. Split mode SHALL provide scroll synchronization that can be turned off. Shortcuts MUST be scoped to the editor, respect IME composition and preserve the existing all-tool search shortcut.

#### Scenario: Visitor formats text and follows a heading
- **WHEN** a visitor selects source text, applies formatting, undoes it and activates an outline heading
- **THEN** the formatting and undo preserve the expected source and selection, and the matching document location becomes visible
- **AND** disabling scroll synchronization allows independent pane scrolling

#### Scenario: Visitor types with an input method
- **WHEN** a visitor composes text with an IME or opens the website all-tool search
- **THEN** editor shortcuts do not interrupt composition or replace the existing search action

### Requirement: Local UTF-8 document input
The tool SHALL accept pasted source and one local UTF-8 `.md`, `.markdown` or `.txt` file, accept an optional UTF-8 BOM and normalize line endings to LF. It MUST reject malformed UTF-8, unsupported document formats and over-limit inputs with a localized reason while preserving the current document. Replacing edited content or explicitly clearing it SHALL offer a cancellable confirmation. Source MUST NOT be uploaded or put in navigation URLs.

#### Scenario: Visitor imports a UTF-8 Markdown file
- **WHEN** a supported file with a BOM and CRLF line endings is opened
- **THEN** its content becomes the current source after BOM removal and line-ending normalization
- **AND** declining replacement confirmation leaves the existing source unchanged

#### Scenario: Visitor opens an unsupported file
- **WHEN** a visitor selects a Word/PDF file, malformed UTF-8 or an input exceeding the published limit
- **THEN** the tool explains the rejection without attempting document conversion
- **AND** the current document remains editable and available for source export

### Requirement: Bounded processing with source preservation
The tool SHALL publish and enforce centralized byte, line, processing-time and rendered-output limits across paste, import and draft restoration. Expensive parsing/highlighting MUST leave editing, cancellation and navigation responsive. Cancellation, timeout, clear, document replacement and newer edits MUST invalidate stale work. Enhancement or rendering failure SHALL preserve basic source editing and source download, with honest localized status.

#### Scenario: Parsing fails or enhancement cannot load
- **WHEN** parsing exceeds its time limit or the enhanced editor fails to load
- **THEN** source remains accessible for editing and Markdown download, and the failure is visible
- **AND** late work cannot replace current content or report a false success
