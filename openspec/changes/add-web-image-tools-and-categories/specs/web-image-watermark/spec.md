## Purpose

Allow visitors to apply consistent text watermarks to batches of local static images for photo attribution and document-use notices, with faithful previews and explicit output controls.

## ADDED Requirements

### Requirement: Single-position and tiled text watermark modes
The watermark tool SHALL provide single-position and tiled text modes with content, size, color, opacity and rotation controls. Single-position mode SHALL provide nine anchor positions and margin control; tiled mode SHALL provide spacing control. One validated configuration SHALL apply to every image in the batch with proportional placement across different image sizes. Empty/whitespace-only content and out-of-range or nonfinite parameters MUST be rejected with localized feedback. The first version MUST NOT imply support for logo images, uploaded fonts, rich text or per-image layouts.

#### Scenario: Visitor marks document copies for a specific purpose
- **WHEN** a visitor enters a Chinese or English use notice and selects rotated tiled mode
- **THEN** the preview and exported images contain repeated text at the selected angle, opacity and spacing
- **AND** the same configuration applies consistently across mixed landscape and portrait images

#### Scenario: Visitor chooses a single corner watermark
- **WHEN** a visitor selects a bottom-right anchor and adjusts its margin
- **THEN** preview and output position the text relative to the final oriented image bounds
- **AND** the controls remain operable with keyboard and touch without requiring freehand dragging

### Requirement: Consistent bounded previews and output settings
Watermark previews SHALL reflect the current text layout, orientation, explicit resize, alpha/background and output settings used by final export. Visitors SHALL be able to inspect individual images before batch export. The watermark page SHALL expose JPEG/PNG/WebP output, quality for JPEG/WebP only and optional maximum-long-edge resizing. Changing settings MUST invalidate old batch exports; previews MUST NOT be presented as original-resolution exports.

#### Scenario: Visitor adjusts a watermark after previewing
- **WHEN** a visitor changes opacity, rotation or output dimensions and starts processing
- **THEN** the current preview and resulting downloadable image use the same updated layout
- **AND** results from the previous configuration cannot be downloaded as if current
