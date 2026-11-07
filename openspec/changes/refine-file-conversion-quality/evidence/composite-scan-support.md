# Composite scan follow-up

Verified on macOS on 2026-11-05 against an authorized local PDF. Private inputs, rendered pages, OCR payloads, reference documents and converted outputs remain outside the repository. The committed regression uses synthetic content.

## Cause and implementation

The supplied one-page PDF contains zero extracted text items and eight image paint operations. Rectangular clipping and overlapping template/body/photo layers caused the conservative drawing decoder to reject the page before OCR. Simply recognizing each image would also expose covered template content and duplicate visible body text.

Image-only composite pages now render their final visible page before recognition. Rectangular clips are tracked through save/restore and constrain image placements. Existing digital-text clipping rejection and unsupported visibility-operation checks remain in place. Full-page raster recognition is an intermediate operation, while the DOCX contains visible editable text and a separately retained local photo.

Residual coverage checks account for recognized text, independently placed photographic regions, thin rules and bounded flat colored page decoration. Unresolved glyph-sized components receive contextual region recognition under the existing one-use leases and shared resource budgets. Remaining unrecognized content fails before packaging. Photo masks use their exact bounds so nearby missing text remains detectable. Scan decoration and original positioning may reflow, with the layout warning retained. Small OCR-box height variations no longer promote body paragraphs to headings.

## Reference and output observations

The supplied WPS editing-priority DOCX contains 1,105 text characters, one table and local graphic content. Its layout-priority counterpart contains no `w:t` text and presents the page as a drawing. They were inspected read-only as comparison references.

The latest successful native Zero output contains 1,071 visible text characters, one photo and 17 paragraphs. After removing punctuation and whitespace, it contains 939 characters compared with 940 in the editing-priority reference. Their character multisets differ by five insertions/deletions in total. This comparison is an OCR-difference signal, and does not establish recognition accuracy against a manually transcribed ground truth. Basic-information ordering and paragraph boundaries also differ.

The bundled LibreOffice renderer initially lacked a CJK fallback. A temporary fontconfig configuration using the repository's licensed Noto Sans SC font enabled all-page inspection. The current reflow occupies two readable pages, with the portrait retained and body text present through the final paragraph. Source decoration, positioning and original one-page pagination are simplified. OCR low-confidence warnings remain applicable. macOS Quick Look also displayed the Chinese body and portrait. Editing/saving/reopening in Word or WPS has not been performed.

## Verification

- Frontend regression completed with 469 tests passing. The new cases cover composite scan output, contextual label recovery, photo retention, rectangular clipping state, photo-mask boundaries, unresolved glyphs and colored regions with missing white glyphs.
- Existing hidden-clipped-text, gradient coverage and title-only shaded-scan regressions pass.
- TypeScript and full desktop build pass. The independent build-graph check reports no findings with the existing budgets.
- Cargo formatting, locked check and serial locked tests pass with 451 tests passed and three ignored.
- Actual native conversion through `pnpm tauri dev` completed twice using the normal Rust queue, hidden engine, region leases, Vision OCR, editable output validation and collision-free commit.
- Earlier exploratory runs exposed conservative residual rejections before decoration/coverage fixes. Clean-start repeats also isolated a second timeout cause, described below.

## Slow native recognition and hidden-page scheduling

On macOS 27.0.1, a new developer cache reproduced a native OCR request entering at 6.453 seconds and returning successfully at 28.484 seconds. The hidden page did not resume packaging and the host deadline failed at 125.609 seconds. A subsequent process completed the same conversion in 4.340 seconds. No late optimizer reload appeared in that server log.

The isolated engine now sets Tauri's background throttling policy to `Disabled`. Tauri/Wry implements this inactive scheduling control on macOS 14 and later. The existing job deadline, cancellation, run leases and idle teardown still govern the engine lifecycle.

A temporary 40-second delay was inserted after successful native OCR solely to test the long await. With scheduling disabled, the page resumed, passed residual coverage and committed at 45.256 seconds. The temporary delay, trace statements and private-payload capture were removed before the final gates. The source regression checks that the policy remains attached to the File engine window. Clean-cache verification of the final binary is recorded separately below.

This follow-up does not close the remaining picker/drop, editor, Windows-device or signed-package acceptance tasks.


## Final clean-cache checkpoint

After removing all temporary instrumentation and rebuilding the final binary, a new Vite cache and fresh Zero process completed the original input in 8.925 seconds from process start. A second fresh process completed in 4.123 seconds. Both used the normal native queue and OCR path. The test processes terminated after their terminal results. Final frontend regression passed 469 tests, Rust regression passed 451 tests with three ignored, the full build and unchanged build-graph budgets passed, and strict OpenSpec validation passed 40 items. Whitespace checks passed.
