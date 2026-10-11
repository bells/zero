## Purpose

Make built-in PDF-to-DOCX conversion produce visible, editable document text for supported PDFs, with honest handling of layout changes and explicit failure when editable content cannot be recovered.

## ADDED Requirements

### Requirement: Successful built-in PDF-to-DOCX contains editable body text
The built-in PDF-to-DOCX provider SHALL produce visible editable body paragraphs and text runs for supported extractable-text PDFs, SHALL preserve recoverable text and a deterministic readable order, and SHALL report `editableReconstruction`. It MUST NOT use whole-page images, hidden text overlays or empty text to satisfy successful conversion, including when text reconstruction fails. Embedded figures SHALL remain separately identified images rather than replacing extractable body text.

#### Scenario: Ordinary text PDF converts
- **WHEN** users convert a supported non-encrypted text PDF
- **THEN** the DOCX contains the expected visible editable text, records editable reconstruction and can be opened, edited and saved in a compatible editor

#### Scenario: DOCX generation fails
- **WHEN** editable DOCX generation encounters a runtime error
- **THEN** the job reports the structured failure and produces no final DOCX instead of retrying as whole-page images

#### Scenario: Output claims editability but contains only images
- **WHEN** a built-in provider returns a DOCX with no nonempty visible body text while claiming editable reconstruction
- **THEN** the host rejects it as `invalidProviderOutput`, removes partial output and never presents it as completed

### Requirement: Recoverable complex and sparse text remains editable
The provider SHALL attempt text reconstruction for supported sparse, bilingual, multi-page and reliably ordered multi-column PDFs. Layout complexity alone MUST NOT select image output. When exact layout or supported graphical content differs, the result SHALL disclose relevant limitations. Content that cannot be recovered reliably SHALL cause `unsupportedInput` rather than silent loss or invented text.

#### Scenario: Short text page
- **WHEN** a nonblank PDF page contains a short valid extractable title or paragraph
- **THEN** the page's text remains editable without being classified as a scan merely because it has few characters

#### Scenario: English and Chinese text
- **WHEN** a supported PDF contains adjacent English words and Chinese text fragments
- **THEN** the DOCX preserves the intended word separation and Chinese text sequence without artificial spaces between Chinese characters

#### Scenario: Supported two-column text or text table
- **WHEN** a PDF's columns or table text have a recoverable reading order
- **THEN** the output preserves the text in editable reading order and explains that columns or table structure can be simplified

#### Scenario: Embedded illustration accompanies body text
- **WHEN** a supported PDF contains extractable body text with a supported embedded figure
- **THEN** the text remains editable and the figure remains image content, with explicit warnings for any unsupported graphical fidelity or text inside images

#### Scenario: Rotated or overlapping content cannot be ordered reliably
- **WHEN** the provider cannot reliably recover the text or its reading order
- **THEN** the job returns `unsupportedInput`, gives actionable document-limit guidance and commits no misleading partial success

#### Scenario: Blank pages occur within a text document
- **WHEN** truly blank pages separate supported text pages
- **THEN** pagination preserves those blank pages without an OCR error, while an entirely blank document is rejected as unsupported editable input

### Requirement: Scans require OCR instead of image DOCX success
The provider SHALL return `ocrRequired` for nonblank scanned pages without extractable text when no OCR provider is available. Mixed documents containing such pages MUST NOT complete with missing pages or image-only substitutes. Password-protected input SHALL retain `passwordRequired` handling.

#### Scenario: Image-only scanned PDF
- **WHEN** users convert a PDF containing nonblank scanned pages with no usable text layer
- **THEN** the job fails with `ocrRequired`, creates no final DOCX and explains in the active language that editable text requires OCR

#### Scenario: Mixed text and scanned pages
- **WHEN** a PDF contains both recoverable text pages and a nonblank scan without a text layer
- **THEN** the whole job returns `ocrRequired` and preserves the source instead of silently omitting or flattening the scanned pages

#### Scenario: Password is required
- **WHEN** PDF parsing requires a password
- **THEN** the job returns `passwordRequired` without attempting image fallback or creating a final output

### Requirement: Capabilities and feedback describe the effective editable contract
The active built-in PDF-to-DOCX capability SHALL advertise only the output quality supported by its verified engine version. The UI SHALL explain before conversion that text is editable, complex layout can change and scans require OCR, and SHALL present accurate bilingual result warnings and errors. Existing older result metadata SHALL remain readable without reclassifying image results as editable.

#### Scenario: Ready current engine
- **WHEN** a verified compatible built-in engine is ready
- **THEN** its PDF-to-DOCX capability advertises editable reconstruction and the interface does not advertise automatic image DOCX fallback

#### Scenario: Old installed engine only supports the former contract
- **WHEN** the selected engine cannot satisfy the current editable output contract
- **THEN** the host reports upgrade or incompatibility guidance instead of using the old engine under a new editable promise

#### Scenario: Language changes after an OCR failure
- **WHEN** users change between Chinese and English after a job returns `ocrRequired`
- **THEN** the current error relocalizes without changing job identity or suggesting an unavailable image-output mode

### Requirement: Editable conversion preserves local bounded job guarantees
Conversion SHALL remain offline, keep user document content out of persistent diagnostics, preserve source and existing output files, and use the existing collision-free final commit and bounded cancellation/timeout lifecycle. One failed document SHALL NOT prevent later queued jobs from executing.

#### Scenario: User cancels during reconstruction
- **WHEN** users cancel while text is being analyzed or the DOCX is being packaged
- **THEN** the job becomes cancelled, partial staging output is removed, no final output is committed and the queue proceeds safely

#### Scenario: Scan fails before a later supported document
- **WHEN** an image-only PDF fails in a started batch before a supported text PDF
- **THEN** the failed item retains its OCR reason and the supported item can still complete through the existing queue
