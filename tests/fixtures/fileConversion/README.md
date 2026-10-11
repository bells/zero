# Zero File conversion corpus

This directory contains generated, non-sensitive documents used to evaluate local PDF-to-DOCX and DOCX-to-PDF providers. No fixture comes from a private user document, and `expected.json` records the expected preflight result and SHA-256 of every executable test input.

## Coverage

- `rich-layout.docx` and `rich-layout.pdf`: Latin and CJK editable text, explicit fonts, headings, a table, an image, columns, headers/footers, and page breaks.
- `large-structured.docx` and `large-structured.pdf`: 24-page representative workloads with stable pagination and CJK text.
- `image-only-scan.pdf`: a valid raster-only PDF; conversion fails with `ocrRequired`. Mixed text/scan documents also fail without committing partial output.
- `editable-*.pdf`: generated single-column English/CJK, short text, two columns, table text/figure, blank intermediate page, all blank, rotated text/page metadata, and mixed scan cases. Unsupported inputs fail explicitly.
- `expected.json` records editable reconstruction and web-rendered PDF expectations, ordered text anchors, full extracted text, expected errors and hashes. The old image-DOCX expectations were replaced on 2026-10-11; historical visual evidence below retains its original date.
- `encrypted.pdf`: one password-protected page; the fixture-only password is `zero-test`.
- `malformed.docx`, `malformed.pdf`, `~$office-lock.docx`, and `unsupported.txt`: invalid-container, malformed-header, Office lock-file, and unsupported-extension cases.
- `assets/OFL.txt`: the Noto Sans SC Open Font License notice. Each valid DOCX embeds a generated subset of the OFL font; no complete font binary is committed separately.

## Reproduction and validation

The generator never downloads a font or conversion engine. Reproduction requires an explicit embeddable CJK TTF path and local Python document dependencies:

```sh
python3 scripts/generate-file-conversion-fixtures.py --cjk-font /path/to/NotoSansSC.ttf
python3 scripts/validate-file-conversion-fixtures.py
```

Original corpus regeneration changes timestamped PDF hashes. Use `--editable-only` to regenerate the deterministic editable additions and expectations without changing the original documents. This mode reuses the licensed subset font embedded in the synthetic rich DOCX.

After `pnpm test:prepare`, run the real PDF parser and OOXML output checks using an installed `@napi-rs/canvas`:

```sh
ZERO_FILE_TEST_CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas/index.js node scripts/verify-editable-pdf.mjs
```

Outputs go to `/private/tmp/zero-editable-pdf-results`. This validates generated text completeness, ordered anchors, sections, image relationships, error propagation and cancellation. It is separate from native editor/device acceptance.

## Visual QA evidence

Checked on 2026-08-16 with LibreOffice-rendered DOCX previews and Poppler-rendered PDF pages:

- All three pages of `rich-layout.docx` and all 24 pages of `large-structured.docx` were inspected for CJK glyphs, headers/footers, tables, page breaks, clipping, and overlap.
- Both pages of `rich-layout.pdf` were inspected.
- Pages 1, 12, and 24 of `large-structured.pdf` were inspected as first/middle/last representatives.
- The inspected pages showed legible Latin/CJK text and no clipping, overlap, black replacement glyphs, or broken table/image layout.

The validation script additionally verifies every committed hash, PDF text-layer expectations, encryption behavior, PDF page counts, required OOXML entries, the embedded-font relationship, and malformed-input rejection.
