## Purpose

Offer understandable browser-local image compression with explicit quality and dimension choices, genuine PNG lossless optimization and accurate reporting when an output does not become smaller.

## ADDED Requirements

### Requirement: Format-appropriate compression controls
JPEG/WebP output SHALL expose quality control and an optional maximum-long-edge setting. PNG output SHALL use lossless optimization without a misleading lossy-quality slider. Resizing SHALL remain off by default. HEIC compression SHALL disclose conversion to JPEG/WebP. Fixed-target byte-size modes and guaranteed size reductions MUST NOT be advertised. Conversion and watermark pages SHALL expose the same applicable output controls.

#### Scenario: Visitor switches from JPEG to PNG output
- **WHEN** a visitor selects PNG as the output format
- **THEN** the lossy quality control is unavailable and the interface explains lossless optimization
- **AND** resizing remains an explicit independent choice rather than an automatic compression fallback

### Requirement: Pixel-preserving PNG optimization
PNG lossless compression without explicit pixel transformations SHALL preserve the decoded oriented pixel values including alpha while removing source-identifying metadata. Explicit scaling or watermarking SHALL be described as pixel transformations, and the whole operation MUST NOT be called pixel-lossless. Visitors seeking further reductions SHALL be able to explicitly select resizing or JPEG/WebP conversion with its applicable transparency/quality explanation.

#### Scenario: Visitor optimizes a PNG with transparent pixels
- **WHEN** a valid PNG is optimized without scaling or watermarking
- **THEN** decoded oriented pixel values including alpha remain unchanged while source-identifying metadata is absent
- **AND** the tool does not silently quantize colors, discard transparency or convert to JPEG/WebP

### Requirement: Honest size comparisons and original preservation
Compression results SHALL show actual input/output bytes and the signed size change or equivalent understandable reduction/increase. Equal or larger results MUST be identified as having no size benefit, without a compression-success claim based only on task completion. The visitor SHALL be able to keep/download the original separately or explicitly change settings. Original files MUST NOT be overwritten, and an original-file download MUST NOT be represented as a metadata-cleaned processed output.

#### Scenario: Optimizing an already optimized image makes it larger
- **WHEN** a valid processed result is equal to or larger than its source
- **THEN** the interface reports no size reduction and displays the actual sizes
- **AND** the visitor can keep the original or adjust settings without losing the source
