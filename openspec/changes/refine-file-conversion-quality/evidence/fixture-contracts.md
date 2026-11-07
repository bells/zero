# Synthetic quality input evidence

Date: 2026-11-03. Added [quality/expected.json](../../../../tests/fixtures/fileConversion/quality/expected.json) separately from the immutable legacy [expected.json](../../../../tests/fixtures/fileConversion/expected.json). Its `status=futureAcceptanceTargetsNotEngineResults` is deliberate: validating the input or scenario schema does not execute conversion or lifecycle behavior.

- 22 document cases cover P01–P16, F01/F02, D01–D04. P16 references the unchanged encrypted and malformed legacy PDFs. New source snapshots contain complete extracted PDF text/page dimensions/rotations/image counts or complete DOCX text by part/section sizes. Target text, table cell maps and merges, geometry, figure order, warnings and typed errors are separate fields.
- P03 draws a real incomplete-line grid with horizontal/vertical merges; its map covers all nine grid positions exactly once. The input validator checks actual PDF line segments against the merged regions. P06/P07/P14 contain real vector axes, plot, fraction and radical, not screenshots of a chart. P06/P12 labels stay inside the declared figure area and outside editable-body expectations.
- P08 has three page metadata rotations and three distinct scan images; P09 has a real blank page and a raster white blank page. P10/P11/P12 are same-page hybrid/overlay/scan-plus-vector layouts. P11's legitimate reliable input text overlay is invisible over the scan; target text must appear once as ordinary editable content. This is not authorization to generate hidden-text output.
- D01 contains real footnote/endnote parts and references; D02 contains all 195 cells in a 65×3 table, explicit blank-page breaks and a boundary-width image; D03 has A4/Letter portrait/landscape sections. D02 target geometry uses a minimum page count and all-page Letter dimensions because font pagination may vary; complete cell order, no split/clipped rows, and one explicit blank page are mandatory. D04 has a valid baseline image and **modeled resource faults**, not a claim that a valid document alone exercises those faults.
- 11 scenario contracts cover F03/F04 and E01–E09, with isolated setup, concrete steps/observations, fixture references and `requiresHarness=true`, `executionStatus=contractOnly`. F04 includes 125 unique issues plus one duplicate and an explicit 100-detail truncation target. E contracts require actual settings/queue/caller/lifecycle tests elsewhere; this generator does not mark them passed. P13's input likewise needs OCR failure injection to exercise its target error.
- Licensed CJK font bytes are recovered only from the existing synthetic DOCX and reused. Chart labels use PDF standard Helvetica to preserve ASCII math symbols absent from the old subset. No user documents, system-font copies or implicit font/model downloads enter this corpus.

Reproduce with the exact fixture-only dependencies in [requirements](../../../../scripts/file-conversion-quality-requirements.txt):

```sh
python scripts/generate-file-conversion-fixtures.py --quality-only
python scripts/validate-file-conversion-fixtures.py
python scripts/test_file_conversion_quality_fixtures.py
node scripts/validate-file-quality-inputs.mjs
```

Fresh results: legacy+quality validator passed (18 unchanged legacy files, 22 quality document cases, 11 scenario contracts). Thirteen unittest checks passed, including deterministic repeated generation/unchanged legacy digests and rejection mutations for text loss, column order, overlapping cell maps, geometry overflow, false lifecycle success, missing IDs, issue bounds, hash corruption, font provenance, actual contradictory merged-table lines, and a removed-vector chart. The latter two update hashes/source snapshots deliberately, so a hash-only validator cannot satisfy them.

The real locked PDF.js parser additionally validated complete normalized input text and absence of NUL/replacement mappings for all 20 new PDF pages, including exact `x + 1`. An initial subset-font `+` mapping problem was corrected by using Helvetica for chart labels. Poppler raster previews of P03/P06/P10 were inspected for intended grid, graph and hybrid layout; this is input QA, not converted-output quality or N/R evidence. Native/Windows/editor/release checks have not run in this fixture task.

2026-11-04 reproduction follow-up: the raster fixture font explicitly uses Pillow BASIC layout to avoid wheel-dependent RAQM kerning. Quality scan PDFs/manifest were regenerated; 13 mutation/reproduction tests, legacy/quality validation and 20-page PDF.js input QA passed again. Legacy bytes and manifest remain unchanged.
