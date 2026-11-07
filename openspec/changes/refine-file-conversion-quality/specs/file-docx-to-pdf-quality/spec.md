## Purpose

Provide bounded local DOCX-to-PDF export on macOS and Windows with truthful runtime capability, complete supported page content and resource readiness, while retaining explicit optional Office providers and separate device and release evidence.

## ADDED Requirements

### Requirement: Qualified desktop platforms offer built-in local export
Supported macOS and qualified Windows installations SHALL offer built-in DOCX-to-PDF conversion without installing Office, a virtual printer or an additional browser distribution. Availability SHALL depend on compatible verified engine assets and effective native runtime support. An unsupported runtime SHALL yield actionable unavailable guidance rather than an Office-installation requirement or an advertised working built-in exporter. Linux and mobile support are outside this change.

#### Scenario: Qualified Windows installation has no Office suite
- **WHEN** verified engine assets and the required native export capability are available on Windows
- **THEN** a supported DOCX can produce a local searchable-text PDF without an interactive print dialog or external application

#### Scenario: Windows runtime lacks the required export interface
- **WHEN** the current runtime cannot provide native PDF export
- **THEN** the built-in direction is unavailable with a specific runtime reason and optional local alternatives remain explicitly selectable

### Requirement: Export preserves supported page content and geometry
Built-in export SHALL preserve supported document paper size, orientation, margins, body text, tables, illustrations, headers and footers. The supported corpus SHALL include Chinese and English multi-page documents, long tables spanning pages, blank pages, A4 and Letter paper, and mixed portrait and landscape sections. Detectable unsupported mixed geometry or content loss SHALL fail explicitly instead of silently coercing all pages or clipping content. Browser rendering SHALL remain described as best-effort layout rather than Word-equivalent fidelity.

#### Scenario: Table crosses page boundaries
- **WHEN** a supported DOCX contains a long table and page headers or footers
- **THEN** the PDF includes all expected cell text without clipped rows, duplicated body text or overlapping page furniture

#### Scenario: Sections use different paper sizes and orientations
- **WHEN** supported sections combine A4 portrait, Letter and landscape pages
- **THEN** the PDF preserves expected page dimensions and content, or the exporter explicitly rejects unsupported geometry without committing an incorrectly sized success

#### Scenario: Chinese document is exported under desktop display scaling
- **WHEN** a supported Chinese DOCX is exported at different tested display scaling settings
- **THEN** output page geometry and complete searchable text remain consistent with the corpus expectations

### Requirement: Images and fonts are ready before native export
Export SHALL wait within bounded deadlines for required embedded image decoding and font readiness. Missing font families SHALL follow the font-preflight warning contract. Decode failure, resource timeout or unreadable required content SHALL not produce a nominally completed PDF with missing content. Export SHALL NOT fetch document-linked external resources as an implicit conversion fallback.

#### Scenario: Embedded image decoding fails
- **WHEN** an illustration required by a supported DOCX cannot be decoded before export
- **THEN** the job fails with a structured resource or provider error and no incomplete final PDF is committed

#### Scenario: Requested font is absent but a usable substitute exists
- **WHEN** the original font is missing and substituted text remains readable
- **THEN** conversion can complete with the affected font and possible pagination change disclosed

### Requirement: Native export obeys the authoritative job lifecycle
Only one native print/export operation SHALL run per engine instance at a time. Output SHALL use private staging and validated final commit, preserving existing user files. Cancellation or timeout SHALL revoke commit authority immediately. A late completion SHALL NOT publish output or corrupt a newer run, and a subsequent job SHALL not reuse an engine instance still occupied by the prior native export.

#### Scenario: Export completes after cancellation
- **WHEN** a native exporter finishes after the user cancelled its job
- **THEN** its output cannot be committed or attributed to a newer job and its private artifacts are cleaned safely

#### Scenario: Timed-out native print cannot be cancelled immediately
- **WHEN** native print remains busy after the parent deadline
- **THEN** File waits for bounded teardown or retires that engine instance before processing another print job, without blocking the UI indefinitely

#### Scenario: Final output name already exists
- **WHEN** a PDF with the intended output name exists
- **THEN** the converter preserves it and follows the existing collision-free naming and commit behavior

### Requirement: Platform and release claims require matching evidence
Source compilation, debug conversion, Windows runtime acceptance and signed-package release acceptance SHALL be recorded separately. Enabling a new source provider SHALL NOT approve a package digest, waive asset integrity or claim tested Windows behavior. Unsupported platform capability SHALL remain visibly unavailable until its native qualification passes.

#### Scenario: Windows adapter compiles without device validation
- **WHEN** the adapter passes compilation and contract checks but the real Windows prototype has not passed
- **THEN** evidence identifies native qualification as pending and does not present compilation as device or release approval

#### Scenario: Debug smoke succeeds with development assets
- **WHEN** a source-development conversion succeeds
- **THEN** package approval, offline installed-package smoke and release measurements remain independent incomplete gates
