## Purpose

Define truthful local static-image input and output behavior across browser watermark, conversion and compression tools, including iPhone HEIC sources, orientation, transparency and metadata handling.

## ADDED Requirements

### Requirement: Verified static formats and explicit output types
All three image tools SHALL accept valid supported static JPEG, PNG, WebP and HEIC/HEIF inputs and SHALL export JPEG, PNG or WebP. Format decisions MUST be verified from content rather than extension or browser MIME alone. Unsupported, animated, malformed or undecodable inputs MUST fail explicitly without silently selecting an arbitrary frame or changing output format. GIF, SVG, BMP and HEIC output SHALL remain outside the first-version support contract. Output MIME, file signature and extension MUST agree.

#### Scenario: A file extension misrepresents its contents
- **WHEN** a selected file is mislabeled, malformed or contains an unsupported animated image
- **THEN** the tool validates actual content and either identifies a supported static format or reports the relevant unsupported/invalid state
- **AND** it does not report a first-frame extraction or fallback-format output as a successful requested conversion

### Requirement: HEIC primary-image conversion and honest compatibility
Supported HEIC/HEIF processing SHALL use a validated primary static image and produce JPEG/PNG/WebP through local decoding. HEIC compression SHALL mean conversion to JPEG/WebP with quality and optional explicit resizing, not smaller HEIC output. Guidance MUST disclose that Live Photo motion, HDR, depth, auxiliary images and multi-image-container preservation are not promised. Desktop raw HEIC and iPhone Safari selection/export SHALL be validated as separate workflows; picker-transcoded JPEG alone MUST NOT count as raw-HEIC evidence.

#### Scenario: Visitor converts a raw iPhone HEIC on a desktop
- **WHEN** the source bytes are a supported HEIC within published limits and JPEG output is selected
- **THEN** the tool locally produces the correctly oriented primary static image as a valid JPEG
- **AND** it explains excluded special photo information without promising HEIC re-encoding

#### Scenario: iPhone selection transforms the original format
- **WHEN** the operating system supplies JPEG bytes after the visitor selects a photo
- **THEN** the tool reports the actual supplied JPEG format
- **AND** compatibility evidence identifies that workflow separately from decoding original HEIC bytes

### Requirement: Normalized orientation explicit resizing and metadata removal
Every processed output SHALL apply source orientation exactly once, preserve default oriented dimensions and aspect ratio, and remove GPS, device, EXIF/XMP and other source-identifying metadata. Only an explicitly chosen maximum-long-edge setting SHALL reduce dimensions, without upscaling. Pixel-preserving PNG optimization MUST still remove source-identifying metadata. The interface SHALL distinguish processed outputs from original files, which retain original metadata.

#### Scenario: A rotated photo contains GPS metadata
- **WHEN** a visitor processes a portrait-oriented photo containing synthetic GPS and device metadata without resizing
- **THEN** output displays upright with the correct oriented dimensions and contains no source-identifying metadata
- **AND** orientation is neither omitted nor applied twice

### Requirement: Explicit transparency conversion
PNG/WebP outputs SHALL preserve supported source alpha semantics. Selecting JPEG for a transparent image SHALL disclose that transparency requires a background, default to white and offer a user-selected background color. Preview and export MUST use the same background choice and MUST NOT silently produce black transparent areas.

#### Scenario: Visitor converts a transparent PNG to JPEG
- **WHEN** a visitor chooses JPEG and a background color
- **THEN** preview and exported JPEG composite transparent areas over that selected color
- **AND** switching to PNG/WebP retains transparency instead of baking in the JPEG background
