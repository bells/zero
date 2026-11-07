## Purpose

Make supported office documents, printed scans and two-column papers useful as editable DOCX files by preserving text, tables and content order, while disclosing local picture content and rejecting known incomplete reconstruction.

## ADDED Requirements

### Requirement: Supported body content retains editable structure and reading order
The built-in PDF-to-DOCX provider SHALL preserve recoverable visible body text as editable paragraphs and runs, including English word spacing, Chinese character order, reliable heading hierarchy, paragraph alignment and indentation. Supported single-column and two-column pages SHALL retain deterministic reading order and page boundaries, including intervening blank pages. Recoverable headers, footers and page numbers MUST NOT be silently discarded. Exact line wrapping or pixel-equivalent pagination is not required.

#### Scenario: Chinese and English office document
- **WHEN** a supported text PDF contains headings, aligned paragraphs, indentation and bilingual body text
- **THEN** the DOCX contains the expected visible editable text and supported paragraph properties without invented spaces or missing paragraphs

#### Scenario: Two-column paper has a full-width heading
- **WHEN** a supported page has a full-width heading followed by two reliably separated columns
- **THEN** the heading precedes the left-column body and right-column body in logical reading order, with no line-by-line interleaving

#### Scenario: Page furniture and blank pages accompany body text
- **WHEN** supported text pages include page numbers, repeating headers or footers and a genuinely blank intermediate page
- **THEN** recoverable visible content and the blank page are retained without duplicating body text or reporting that blank page as a failed scan

### Requirement: Supported ruled tables become editable table cells
The provider SHALL reconstruct text-layer tables with a reliably detectable rectilinear grid as actual editable DOCX tables, retaining row and column order, cell text, supported row and column merges, relative column widths and visible borders. Complex borderless or scanned tables outside this structural support boundary SHALL retain complete recoverable text in deterministic order with a structure-simplified warning, or fail when cell content or order cannot be recovered. Successful OCR alone MUST NOT advertise native table reconstruction.

#### Scenario: Ruled table includes merged cells
- **WHEN** a supported text PDF contains a ruled table with horizontal and vertical merged cells
- **THEN** the output contains editable table cells with the expected merges and cell text exactly once, rather than a picture or flattened paragraphs

#### Scenario: Borderless or scanned table can only be reflowed
- **WHEN** a table lacks reliably recoverable grid structure but all visible text and its reading order are recoverable
- **THEN** the output retains that text and identifies the affected page as structurally simplified without claiming an editable table

#### Scenario: Table content cannot be assigned reliably
- **WHEN** overlapping cells or ambiguous boundaries prevent reliable content order or coverage
- **THEN** the document fails with `unsupportedInput` and no partial final DOCX is committed

### Requirement: Figures and unsupported graphical objects remain local content
Supported figures SHALL occur in logical relation to surrounding text rather than all being appended after the page body. Formula and chart regions that can be reliably isolated and rendered SHALL remain local pictures with an explicit non-editable-content warning. This change SHALL NOT promise native equation objects or editable chart data. Pictures MUST NOT replace recoverable ordinary body text or supported editable tables, and MUST NOT conceal failed text reconstruction as whole-page image output.

#### Scenario: Illustration occurs between paragraphs
- **WHEN** a supported figure is located between two body paragraphs
- **THEN** the DOCX preserves the paragraph-figure-paragraph order and the figure's readable aspect ratio

#### Scenario: Formula or chart can be preserved as a local picture
- **WHEN** a formula or chart has reliably isolated bounds and its visible content can be preserved completely
- **THEN** only that region becomes a picture, surrounding text remains editable, and the result identifies its page and non-editable status without claiming recovered chart data or native formulas

#### Scenario: Graphical region cannot be preserved reliably
- **WHEN** the engine detects required graphical content whose bounds, clipping or rendering cannot be preserved reliably
- **THEN** the document fails without silently dropping that content or switching to whole-page images

#### Scenario: Document contains no editable body content
- **WHEN** conversion would produce only formula or chart pictures and no nonempty editable body text
- **THEN** the built-in editable conversion reports unsupported input rather than adding artificial hidden text or accepting an image-only DOCX

### Requirement: Rotation and mixed scan content use bounded local recognition
Supported right-angle page rotations SHALL be normalized before text, table, figure and OCR coordinates are combined. Reliable existing text SHALL remain directly extracted. Required printed scan body regions on the same page SHALL be recognized locally when qualified OCR is available, while ordinary illustrations SHALL NOT automatically trigger full-page OCR. Recognized and extracted body text SHALL appear exactly once. Ambiguous region classification, missing required OCR or failed recognition SHALL NOT produce false partial success.

#### Scenario: Printed page is rotated ninety degrees
- **WHEN** a supported printed page has a ninety, one-hundred-eighty or two-hundred-seventy degree page rotation
- **THEN** the converted content has upright readable order with correctly aligned images and OCR coordinates

#### Scenario: Digital heading accompanies scanned body
- **WHEN** a page has a reliable digital heading and a required scanned body region
- **THEN** the heading is extracted once, the body is recognized locally once, and both are placed in the correct editable reading order

#### Scenario: Scanned image already has a reliable text overlay
- **WHEN** a scanned page or region has a usable aligned text layer
- **THEN** the provider avoids duplicate OCR text and does not embed a second full-page scan background

#### Scenario: Required OCR or region classification fails
- **WHEN** OCR is unavailable, recognition yields unusable body text, or the engine cannot distinguish required scanned content reliably
- **THEN** the job reports the applicable OCR, timeout or unsupported-input error and commits no incomplete final output

#### Scenario: Image-only page combines clipped template and body layers
- **WHEN** a supported image-only page combines rectangular clipping, overlapping image layers, printed body and an independently bounded local photo
- **THEN** recognition uses the final visible page, the body appears once as editable text, the photo remains a local picture, and simplified decoration or positioning is disclosed
- **AND** unresolved residual glyphs receive bounded contextual recognition or cause failure before final output

#### Scenario: Composite scan contains local columns and a portrait
- **WHEN** recognized fields occupy reliably separated local columns alongside an independently bounded portrait
- **THEN** editable fields and the portrait remain alongside one another using a borderless layout container, without combining neighboring fields or converting their text into pictures
- **AND** measured text advances, line spacing and recoverable heading colors guide typography instead of treating OCR box height as font size or inheriting default heading colors
- **AND** font identity and layout remain approximate, layout/font-inspection warnings remain visible, and this does not claim recovery of scanned data-table cells or exact pagination

### Requirement: Reconstruction preserves bounded editable job guarantees
The provider SHALL retain local processing, source-file protection, collision-free commit, resource bounds, cancellation and stale-result rejection. Recoverable layout changes SHALL be disclosed; detected missing body content, unrecognized required scan regions and unreliable reading order SHALL fail the whole document. Whole-page image fallback and hidden-text editability tricks remain prohibited.

#### Scenario: Failure occurs after several successful pages
- **WHEN** a later page cannot satisfy the supported content contract
- **THEN** earlier staged content is not committed as a completed document and independent later queue items can continue

#### Scenario: Cancellation occurs during regional OCR or picture rendering
- **WHEN** users cancel a running conversion
- **THEN** late results cannot finalize the job, staging is cleaned safely, and subsequent jobs remain usable
