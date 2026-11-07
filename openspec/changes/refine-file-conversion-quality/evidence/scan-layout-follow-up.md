# Composite scan layout follow-up

Verified on macOS on 2026-11-07 after maintainer feedback comparing Zero's earlier output with a WPS editing-priority reference. Private source documents, recognition content, generated DOCX files and page renders remain outside the repository. No change-specific document text or template coordinates are hardcoded.

## Causes and changes

The earlier result expanded the field columns into one vertical flow, inserted the portrait as a separate preceding paragraph, used OCR bounding-box height as font size, and inherited the Word heading theme's blue. These choices enlarged the body, fragmented fields and pushed a one-page source onto two pages.

`pdfScanLayout.ts` now separates measured recognition geometry from output typography. Long CJK line advances estimate body size; large text and bounded foreground/background samples guide headings. Local sections with persistent gutters and vertically overlapping columns use borderless layout containers, with the portrait in its own column. Fields remain separate paragraphs; body paragraphs merge according to line geometry and label boundaries. Source gaps and positive line pitch guide spacing, and the writer explicitly sets fonts, colors and paragraph properties. No new dependency, OCR model, IPC endpoint or native permission was introduced.

Layout containers do not claim scanned data-table cell recognition. Original font identity is unknown, and font-inspection and layout warnings remain. Whole-page images, hidden text and source-content corrections remain absent. The existing content coverage, residual-glyph checks, resource limits, cancellation, lease and final-output validation paths remain in use.

## Current observed output

The real `pnpm tauri dev` run used the regular Rust queue, hidden engine, native Vision recognition and final DOCX validation. It completed 35.713 seconds after starting the development command; recognition ran from 8.976 to 35.366 seconds. This is one observed cold-process result, not a latency guarantee. The investigation-owned development process group was stopped afterward.

The output contains 1,064 text characters, 24 paragraphs, one three-column borderless layout table and one local portrait. Body font size is normalized to 12 pt. After removing punctuation and whitespace, the output contains 939 characters versus 940 in the supplied WPS editing-priority reference; character multisets differ by two additions and three deletions. This comparison is a difference signal, not recognition accuracy against a manually transcribed ground truth.

Bundled LibreOffice rendering, with an explicit local Noto Sans SC fallback for its otherwise missing CJK font, produced one page. The complete page was visually inspected: the two field columns remain alongside the portrait, green title and section labels are visible, field paragraphs remain separate, and body text continues through the final line without clipping or overlap. Original ornamental rules, exact font identity, some emphasis, and a few recognized characters still differ. Pagination in WPS/Word and edit-save-reopen have not been verified; an attempted editor inventory in the preceding continuation timed out before an editor was reached.

## Regression and validation

- `pnpm test`: 474 passed, including a synthetic composite PDF converted to actual DOCX, independent field/portrait layout assertions, CJK advance estimation, light/dark text over colored backgrounds, source-ID preservation and rejection of false columns in vertically separated regions.
- Existing digital tables, mixed scanning, missing residual content, clipped hidden text, and scan-body heading regressions remain passing.
- `pnpm build`: passed. The independent build-graph check passed without changing budgets.
- Cargo formatting and locked check passed. Serial locked Rust tests completed with 451 passed and three ignored under normal native permissions. The preceding restricted-environment run had native Vision/pasteboard failures and a timed process-test failure; tests were not weakened.
- Strict OpenSpec and whitespace validation are recorded with the final delivery checks.

The broader change remains at 21/33 checked tasks. This follow-up does not complete the outstanding editor, Windows, picker/drop, provider or signed-package acceptance gates, and does not archive or synchronize specifications.
