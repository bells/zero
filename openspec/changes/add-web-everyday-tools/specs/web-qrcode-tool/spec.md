## Purpose

Let visitors generate portable QR images from text and decode a local static image without sending the content elsewhere, while keeping image limits and result handling explicit.

## ADDED Requirements

### Requirement: Unicode text to bounded QR images
The tool SHALL encode the exact valid Unicode input as UTF-8 with error correction M, a minimum four-module quiet zone and high-contrast black and white modules. It SHALL preserve input whitespace and reject empty input, invalid Unicode or input exceeding 2,000 UTF-8 bytes. A successful operation SHALL offer a 1024 by 1024 PNG and a vector SVG, each at most 4 MiB. Rasterization SHALL preserve complete square modules without interpolation artifacts.

#### Scenario: Visitor generates a Unicode QR code
- **WHEN** the visitor generates a code containing Chinese text, emoji and a trailing newline within the limit
- **THEN** both downloadable formats encode the original text including the newline
- **AND** an independent decoder recovers the same text

### Requirement: Local static-image recognition
The tool SHALL accept one local static PNG, JPEG or WebP at a time, with maximum source size 16 MiB, 12,200,000 pixels and longest edge 8192. Type and dimensions SHALL be validated from content. Recognition SHALL return the first decodable QR payload as plain text and disclose the single-result behavior. Decoded text SHALL be limited to 64 KiB UTF-8. Unsupported, animated, malformed, excessive or unrecognized input SHALL produce a localized error.

#### Scenario: Visitor recognizes a QR image
- **WHEN** a supported local image containing a valid QR code is explicitly processed
- **THEN** the payload is displayed and can be copied without uploading the image
- **AND** a payload containing markup remains inert text

### Requirement: Passive results and bounded image lifecycle
Recognition and image-read work SHALL have a ten-second end-to-end deadline. QR text generation SHALL have a five-second deadline. Copy and downloads SHALL require explicit actions and use the current result. Displaying a decoded URL MUST NOT initiate navigation, a preview request or a target-site connection. Cancellation, settings changes, replacement, clear and page exit SHALL invalidate obsolete results and release image and computation resources under the common new-tool lifecycle.

#### Scenario: Recognition finishes after replacement
- **WHEN** a visitor replaces an image before its read or recognition finishes
- **THEN** the old payload and preview cannot appear and late resources are released
- **AND** no decoded URL is contacted automatically
