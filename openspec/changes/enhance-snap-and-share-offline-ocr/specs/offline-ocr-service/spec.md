## Purpose

Provide bounded, private, offline text recognition shared by screenshot and document workflows, with explicit language capability, structured geometry and caller-scoped cancellation and results.

## ADDED Requirements

### Requirement: OCR exposes effective offline platform and language capabilities
OCR SHALL run locally without sending images or recognized text over a network. Consumers SHALL query effective provider readiness and supported languages. macOS recognition SHALL support the verified printed-text corpus when its provider and languages are available; Windows and other unimplemented platforms SHALL expose unavailable capability without claiming success.

#### Scenario: Supported macOS languages are ready
- **WHEN** a consumer requests recognition in available languages
- **THEN** the local provider processes the admitted image and returns recognized content without network access

#### Scenario: Requested language or platform is unsupported
- **WHEN** the provider cannot satisfy the request
- **THEN** the consumer receives a structured unavailable reason rather than an empty successful recognition or cloud fallback

### Requirement: OCR returns bounded source-coordinate text lines
Recognition SHALL return image dimensions and text lines with finite source-pixel bounds, confidence and safe warning identifiers. Consumers MUST receive deterministic coordinate conventions and MUST NOT need arbitrary filesystem access to submit or retrieve an image.

#### Scenario: Text occurs near image edges
- **WHEN** recognition finds printed text at the upper or lower edge
- **THEN** the bounds map correctly to the input image's top-left coordinate system and confidence is within its declared range

#### Scenario: Invalid or oversized input and output
- **WHEN** dimensions, decoded pixels, byte length, line count or recognized text exceed declared limits
- **THEN** the request fails with a structured invalid-input or resource-limit reason without committing partial results

### Requirement: OCR honors caller ownership and bounded lifetime
Screenshot requests SHALL be bound to an authorized capture session; document requests SHALL be bound to the active document run and page. Cross-owner reads, stale credentials and replayed upload leases MUST be rejected. A consumer SHALL NOT gain access to another consumer's images or result through shared recognition.

#### Scenario: File engine attempts a screenshot read
- **WHEN** a File caller requests screenshot media or a Snap OCR result
- **THEN** the host denies access even though both workflows use OCR

#### Scenario: Page upload lease is replayed or mismatched
- **WHEN** the caller reuses a consumed page lease or supplies a lease from another job or engine run
- **THEN** recognition is refused and no result reaches the incorrect job

### Requirement: OCR cancellation and concurrency remain resource bounded
The system SHALL enforce finite admission, execution and result limits, honor parent deadlines and cancellation, and reject late output after cancellation or expiry. Snap and File SHALL share fair bounded scheduling. Native work that has not actually ended MUST continue to count against execution capacity.

#### Scenario: Snap arrives during a multipage File job
- **WHEN** File is recognizing one page and a Snap request arrives
- **THEN** Snap can enter the bounded schedule and File cannot reserve unlimited future pages ahead of it

#### Scenario: Cancellation races provider completion
- **WHEN** a request is cancelled or expires while its provider returns a result
- **THEN** no stale result is published or committed and resource capacity reflects any still-running worker

### Requirement: OCR content stays outside persistent diagnostics
The system MUST NOT persist OCR input, recognized text, credentials or paths in diagnostics or history. Temporary media and in-memory results SHALL be removed at their declared lifecycle end; explicit user copy or document output is the only intended retention.

#### Scenario: Recognition fails or finishes
- **WHEN** diagnostic events are recorded and the owning workflow is disposed
- **THEN** diagnostics contain only approved safe metadata and owned image/result resources are released
