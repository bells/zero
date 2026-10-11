## Purpose

Extend editable PDF-to-DOCX conversion with shared offline recognition for supported scanned pages, preserving text-layer extraction, page completeness, honest quality warnings and existing private job guarantees.

## ADDED Requirements

### Requirement: File selects OCR per page without duplicating extractable text
File SHALL use reliable text layers when available, preserve blank-page pagination, and use offline OCR for supported nonblank scanned pages without usable text when a qualified provider is ready. Sparse text MUST NOT alone trigger OCR. Ordinary illustrations and same-page partial scans SHALL retain explicitly described support limitations rather than silently claim complete recognition.

#### Scenario: Supported printed scan
- **WHEN** a user converts a clear printed Chinese or English scanned PDF with available language support
- **THEN** scan text becomes visible editable DOCX paragraphs instead of an entire-page background image or hidden text layer

#### Scenario: Mixed text and scan pages
- **WHEN** a PDF combines reliable text-layer pages and supported scan pages
- **THEN** each page uses the appropriate text source and the DOCX includes the recovered content in page order without duplicated text

#### Scenario: Sparse text and illustrations
- **WHEN** a page has a short valid text layer and an illustration
- **THEN** the text remains directly extracted and the result accurately warns that illustration text was not recognized

#### Scenario: Blank image-backed scan page
- **WHEN** bounded page analysis finds an image-backed page to be genuinely blank among supported content pages
- **THEN** its pagination is preserved without manufacturing text or failing merely because an image operation exists

### Requirement: Recognized content uses editable reconstruction with honest quality
OCR text SHALL enter the same recoverable reading-order and paragraph contract as extracted text and SHALL map correctly from source raster to document coordinates. Successful output SHALL report editable reconstruction and OCR-use warnings, with confidence or structure limitations disclosed. The workflow MUST NOT claim exact original layout, true table reconstruction or error-free recognition solely because OCR succeeds.

#### Scenario: OCR page has recoverable columns or table text
- **WHEN** reading order is recoverable within the supported corpus
- **THEN** the output retains editable text in readable order and explains any column or table simplification

#### Scenario: User edits the generated DOCX
- **WHEN** the supported result is opened in a compatible editor
- **THEN** its recognized body text can be modified, saved and reopened as actual document text

#### Scenario: Malformed or unorderable recognition
- **WHEN** recognition geometry or text cannot satisfy the supported reconstruction contract
- **THEN** the job fails with an actionable structured reason rather than declaring an incomplete document successful

### Requirement: Missing or failed OCR never produces false partial success
When required OCR is unavailable, File SHALL preserve `ocrRequired` with localized capability guidance. Nonblank required pages with no recognized text, timeout or recognition failure SHALL fail the whole document, without dropping pages or substituting image-only output. Password handling and independent later queued jobs SHALL remain intact.

#### Scenario: No usable provider
- **WHEN** a scanned or mixed PDF needs recognition on a platform without a suitable provider or language
- **THEN** the job returns `ocrRequired`, creates no final DOCX and accurately explains the missing capability

#### Scenario: One scan fails in a mixed document
- **WHEN** a required nonblank page cannot yield usable editable text
- **THEN** no partial final DOCX is committed and later documents can still run

#### Scenario: Password or deadline prevents processing
- **WHEN** a PDF requires a password or recognition exceeds the parent deadline
- **THEN** the existing password or timeout outcome remains distinct from OCR-unavailable guidance

### Requirement: File OCR preserves isolated engine and bounded commit guarantees
File recognition SHALL be authorized for the active conversion run and a single page, process pages with bounded resources, honor cancellation, preserve source and existing output files, and keep document content out of UI diagnostics. OCR availability SHALL depend on both compatible verified engine assets and the effective host provider; source development MUST NOT approve signed packages.

#### Scenario: Conversion cancelled during recognition
- **WHEN** the user cancels while a scan page is recognized
- **THEN** page authorization is revoked, late text cannot complete the job, partial staging is cleaned and no final file is committed

#### Scenario: Old or incompatible engine
- **WHEN** installed assets cannot use the current OCR protocol
- **THEN** File reports accurate upgrade or capability guidance and does not grant the engine broader screenshot or filesystem access

#### Scenario: Debug OCR conversion succeeds
- **WHEN** development assets and a local provider pass a synthetic conversion
- **THEN** that evidence remains distinct from offline signed-package acceptance and does not change package approval
