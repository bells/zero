# Synthetic OCR corpus

Generate with `scripts/generate-file-conversion-fixtures.py --ocr-only` on macOS using Pillow, ReportLab and the existing fixture generator dependencies. The English font is system Arial; the Chinese OFL subset is recovered from the existing synthetic `file-conversion/rich-layout.docx` fixture. Temporary font files are removed by the generator.

Every image is drawn from literal synthetic text on a white canvas. PDFs contain those generated images, one literal text-layer page, or blank pages. No attached screenshot, user file, desktop capture or private document is an input. `expected.json` records exact hashes; regeneration was verified to preserve all hashes in this checkout. Font versions can affect reproducibility on a different macOS installation.

`bilingual.png` tests printed Chinese/English and both vertical edges; `blank.png` tests empty output; `low-resolution.png` tests reduced resolution. `scan.pdf` has one scan page. `mixed.pdf` has a text page, scan page, ordinary blank page and image-backed blank page. Columns and table-text fixtures cover text reconstruction, not true table-cell fidelity or complete native acceptance.
