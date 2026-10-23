# Browser PDF and Chinese font prototype

Verified 2026-10-22 on macOS with Node 24.20.0, the exact `pdfmake/build/pdfmake.js` browser bundle from pdfmake 0.3.12 and @types/pdfmake 0.3.3. This is browser-library/source and local prototype evidence. It does not establish Safari/iPhone, hosted CSP/base deployment, mobile peak memory or native application acceptance.

## Font source and redistribution

- Self-hosted full Noto Sans SC static TrueType regular/bold faces, derived at weights 400/700 from Google Fonts revision `2894aab31764f10f29c421bdfd2340d3b382d384`, `ofl/notosanssc/NotoSansSC[wght].ttf`.
- Original source SHA-256 `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`.
- SIL Open Font License 1.1 is distributed as `website/public/markdown-fonts/OFL.txt`; its reserved name is Source. The derived font retains Noto names. OS/2 `fsType=0` in both generated fonts permits embedding.
- Fonttools 4.60.1 instantiates the complete font without character subsetting. The explicit maintenance script `website/scripts/prepare-markdown-fonts.mjs` pins the source hash and disables timestamp recalculation. It runs only when explicitly invoked; website builds do not download or regenerate fonts. `MARKDOWN_FONT_PYTHON` selects a Python environment containing fonttools 4.60.1.
- Regular 10,595,948 bytes; bold 10,585,504 bytes; total 21,181,452 bytes (20.20 MiB). Individual checksums, provenance and limitations are in the shipped manifest. These are PDF-only lazy resources, separate from initial-page resources.
- Each font cmap contains 30,890 code points (30,445 in the BMP). Export reads the actual cmap and refuses missing characters. PDF wrapping in pdfmake 0.3 uses UTF-16 code units, so supplementary-plane characters are explicitly refused even when the font contains them. This includes most emoji and some rare CJK characters. It produces a stable `font-glyph` error instead of corrupted output. Italic Markdown uses the upright regular/bold faces because Noto Sans SC has no italic face; emphasis remains represented in the semantic definition but there is no synthetic oblique face.

## Local document prototype

`generateMarkdownPdf(document, assets, fontBaseUrl, onProgress)` accepts the shared AST snapshot and only pre-authorized local PNG/JPEG data assets. It uses the browser pdfmake bundle directly, with no screenshot, browser printing or generation server. Temporary loopback hosting supplied the two font files during this experiment; no Markdown content or character lists were requested over HTTP.

The synthetic source contained mixed Chinese/Latin text, bold, strike, a URI link, quote, checked/unchecked tasks, a 160-row table, 150 code lines, one 1,600-character unbroken code line, and a 12-column table. The final run produced a 166,394-byte, ten-page A4 portrait PDF in approximately 1.02 seconds on this host, including local font fetch, font setup and generation. It is one measured synthetic document, not a capacity guarantee.

The bundled runtime's pypdf 6.10.0 independently extracted contiguous Chinese paragraph text, `中文数据第 159 行`, `CODE_END_SENTINEL`, and `单元格11`. The extracted text had no NUL characters; all 1,750 expected `z` characters survived code wrapping (1,600 from the long line and 150 from the alphabet in preceding lines). The URI `https://example.com/pdf-test` remained a PDF link annotation. Table headers appeared on all six pages occupied by the ordinary table. MediaBox was 595.28 × 841.89 points. Poppler-rendered pages 1, 9 and 10 were visually inspected: Chinese/Latin text and bold were legible; the long code line wrapped within the body width, and the wide table continued with a repeated header and all values.

An early trial inserted zero-width break characters. Independent extraction revealed NUL characters in code/table text, so that approach was removed. The final implementation uses pdfmake's built-in `wordBreak: 'break-all'` and adds no characters to exported text. Paragraphs and table cells also use this wrapping to prevent oversized tokens from forcing horizontal clipping. Tables over eight columns reflow each source row as labelled column/value pairs with repeating headers; every source column and value stays readable rather than shrinking to illegible widths.

## Automated checks and limits

Eight focused tests pass in `website/tests/markdown-pdf.test.mjs`: semantic text/task/strike/link mapping, wide table/code wrapping, local image-only output, font coverage and explicit unsupported-character errors, duplicate definition/anchor/source image order, page limits, real PDF bytes from the browser bundle, and font HTTP/size errors. The PDF module also passes strict standalone TypeScript checking. Tests initially failed before the PDF implementation existed.

Font requests omit credentials/referrer, reject redirects, enforce the shared 15-second timeout and 32-MiB response limit while streaming. Same-origin checks prevent using a font service. The shared policy caps output at 32 MiB and pagination at 500 pages; the root export Worker owns the 60-second watchdog, cancellation and stale-document invalidation. The PDF function itself is intentionally Worker-compatible and does not own UI or downloads.

Remaining evidence belongs to integrated browser tests: lazy-load boundaries and generated Worker assets under the actual site base/CSP, download job cancellation/revision changes, real Safari/iPhone opening and memory behavior, and capacity at the published policy limits. No manual/device task was marked complete on the strength of this prototype.
