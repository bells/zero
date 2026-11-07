## Purpose

Help users assess local document conversion through non-blocking font preflight and bounded actionable quality reports, and make completion depend on supported content coverage and actual output checks rather than file existence alone.

## ADDED Requirements

### Requirement: Font preflight reports missing fonts and known substitutions
File SHALL inspect recoverable requested font families before output generation and compare them with usable local or supported embedded fonts. Missing fonts and known replacements SHALL be disclosed without blocking an otherwise readable result. Subset font prefixes, theme placeholders and valid embedded fonts SHALL NOT cause false missing-font warnings. Incomplete font inspection SHALL produce an inspection-incomplete warning rather than falsely reporting that all fonts are available. No font SHALL be downloaded automatically during conversion.

#### Scenario: DOCX requests a missing font
- **WHEN** a document references an unavailable font without a usable embedded face
- **THEN** File reports its family and possible layout impact, and reports the replacement only when the replacement is known

#### Scenario: PDF subset or DOCX embedded font is usable
- **WHEN** the font is available through a supported embedded face or a subset name maps to its usable family
- **THEN** File does not claim it is missing merely because the stored font name differs

#### Scenario: Font enumeration or inspection fails
- **WHEN** bounded preflight cannot determine the complete font status
- **THEN** conversion may continue under existing readable-content checks with an explicit inspection-incomplete warning and without claiming a verified font match

### Requirement: Quality reports identify limitations without exposing document content
Completed and failed jobs SHALL support bounded structured quality information for font substitution, layout reflow, table simplification, local non-editable pictures, OCR use and recognition limitations. Reports SHALL identify source page numbers or section indexes when known, SHALL distinguish unknown locations, and SHALL be available in Chinese and English. They MUST NOT include body text, OCR text, private filesystem paths or arbitrary engine HTML. Existing result warning metadata SHALL remain readable.

#### Scenario: Result contains a local picture chart and reflowed borderless table
- **WHEN** conversion completes with these supported limitations
- **THEN** the result identifies the respective pages and limitations without describing the chart as editable data or the reflowed text as a native table

#### Scenario: Large document produces repeated warnings
- **WHEN** warnings exceed the documented report bound
- **THEN** the report aggregates or truncates details with accurate counts rather than becoming unbounded or silently hiding that more locations are affected

#### Scenario: Language changes after completion
- **WHEN** users switch Chinese and English
- **THEN** quality information relocalizes without altering job identity, output metadata or stored provider choice

### Requirement: Known incomplete content cannot be reported as successful conversion
Readable font substitution and supported layout changes SHALL be allowed with warnings. Detected missing body text, unrecognized required scan content, unreliable reading order or graphical content that cannot be preserved SHALL fail before final commit. A confidence score, nonempty output file or minimum editable-text check alone MUST NOT be represented as proof of complete or faithful reconstruction. Font substitution producing unreadable required text SHALL fail rather than being downgraded to an ordinary warning.

#### Scenario: Output contains some text but a required page is missing
- **WHEN** content accounting detects omitted required content despite a structurally valid result
- **THEN** File rejects the incomplete output and preserves the source and existing destination files

#### Scenario: Only supported layout changes are detected
- **WHEN** supported content is retained but line wrapping, font metrics or complex borderless-table structure changes
- **THEN** File can complete with the relevant warnings and makes no exact-layout claim

### Requirement: Acceptance uses generated content and independently inspected artifacts
Each claimed supported class SHALL have a reproducible synthetic fixture with explicit expected text, order, structure, page geometry and warning or error outcomes as applicable. DOCX acceptance SHALL inspect actual paragraphs, tables, merges and image relationships and include real editor edit-save-reopen checks. PDF acceptance SHALL inspect searchable text, page count and dimensions and include visual clipping and overlap review. Private user documents are not required. Automated output checks, native device acceptance and release acceptance SHALL remain separate evidence categories.

#### Scenario: File exists but table is flattened
- **WHEN** the ruled-table fixture produces a valid DOCX containing only paragraphs
- **THEN** structural acceptance fails even though the file opens and contains expected text

#### Scenario: Chinese PDF has the expected byte signature but clipped content
- **WHEN** PDF validation passes minimum format checks while visual review detects clipped text or table rows
- **THEN** the affected export acceptance remains failed and cannot be described as a passing native flow

#### Scenario: Word or Windows acceptance has not run
- **WHEN** automated fixtures pass but a required editor or Windows device is unavailable
- **THEN** that manual task stays pending with its missing evidence recorded instead of being inferred from source or another platform

#### Scenario: Future acceptance targets and lifecycle cases are generated
- **WHEN** a fixture generator adds new supported-class targets or modeled faults and provider lifecycle operations
- **THEN** the legacy corpus and its expectations remain unchanged, new targets explicitly state that conversion has not been executed, and faults or lifecycle operations require an independent harness or native observation instead of treating a document's existence as a passing result
