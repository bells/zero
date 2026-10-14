## Purpose

Enable Unicode-safe text encoding and decoding, precise URL-component transformations and bounded local raster-image exchange, with recoverable failures and previews that never fetch or execute user-provided content.

## ADDED Requirements

### Requirement: Unicode text Base64 round trips
The tool SHALL encode text as UTF-8 standard Base64 and decode standard Base64 bytes as strict UTF-8 text. Decoding SHALL accept ASCII whitespace and valid omitted padding, reject malformed alphabet/length/padding and identify invalid UTF-8 without replacement-character output. Base64URL MUST NOT be silently treated as standard Base64. Successful output SHALL be copyable and input SHALL remain intact on failure.

#### Scenario: Non-ASCII input survives a round trip
- **WHEN** a visitor encodes then decodes `你好，Zero 👋`
- **THEN** the resulting text matches the input exactly

#### Scenario: Base64 decodes to non-text bytes
- **WHEN** valid Base64 produces invalid UTF-8 bytes in text mode
- **THEN** the tool reports that the bytes are not valid UTF-8 and suggests the supported image workflow where applicable
- **AND** it does not present lossy decoded text as a successful result

### Requirement: URL component semantics
URL actions SHALL explicitly encode/decode components with standard percent encoding. The tool MUST NOT navigate to input URLs, encode an entire URL under misleading full-URL semantics, or convert `+` to a space as form-urlencoded data. Malformed percent escapes and invalid UTF-8 MUST produce localized errors with original input preserved.

#### Scenario: A component contains plus and reserved characters
- **WHEN** the visitor encodes `a+b &中` and decodes the result
- **THEN** the original component is recovered exactly
- **AND** decoding raw `a+b` preserves `+`

#### Scenario: A malformed escape is provided
- **WHEN** the visitor decodes `%ZZ` or an incomplete percent-encoded UTF-8 sequence
- **THEN** no successful or stale output is offered and the original input remains editable

### Requirement: Bounded local image exchange
Image mode SHALL accept local PNG/JPEG/WebP files and equivalent Base64 or image Data URLs, provide a preview plus Base64/Data URL output or explicit image download, and preserve image bytes without format conversion. It MUST enforce the shared byte/encoded-size/dimension limits before full image decoding, validate actual type against any MIME declaration and reject SVG/HTML, remote URLs, corrupt or unsupported images. Downloads SHALL use a safe filename/extension for the validated type.

#### Scenario: A supported local image is exchanged
- **WHEN** a visitor encodes an in-limit PNG, then decodes its resulting Data URL
- **THEN** the preview and explicit downloadable PNG represent the same bytes and no image upload occurs

#### Scenario: Image input is unsafe or exceeds limits
- **WHEN** an input is a remote URL, SVG Data URL, MIME mismatch, corrupt image, over 5 MiB decoded, over 7 MiB encoded or over 16 million pixels
- **THEN** processing stops with a localized reason and no active preview/export is produced
- **AND** type, byte-size and dimension violations are rejected before full image decoding, while decoder failures for corrupt image data remain recoverable

### Requirement: Inert rendering and preview lifecycle
Input/output text SHALL be rendered as text rather than executed markup. Image previews MUST be backed only by validated local data and MUST release associated resources on replacement, clear or page exit. Mode changes SHALL invalidate incompatible output and pending work; copy/download MUST be user initiated.

#### Scenario: Script-like text and replacement previews are used
- **WHEN** a visitor encodes text containing HTML/script syntax, then replaces or clears an image preview
- **THEN** the text is never executed and resources belonging to the old preview are released
- **AND** late work from the previous mode cannot restore its preview or export controls
