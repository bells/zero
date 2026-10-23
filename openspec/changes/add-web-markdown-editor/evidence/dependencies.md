# Markdown dependency and redistribution audit

Reviewed 2026-10-22 against the installed `website/node_modules`, pinned `website/package.json` / `pnpm-lock.yaml`, the actual `pdfmake/build/pdfmake.js` browser artifact and its source map, and the actual distributed TTF/OFL files. This records inspected source and redistribution materials. It does not certify a deployed site, browser acceptance or every capacity limit.

## Direct packages

| Package | Pinned version | Actual installed notice | Purpose / upstream |
| --- | --- | --- | --- |
| `@codemirror/lang-markdown` | 6.5.2 | MIT `LICENSE` | [Markdown language support](https://github.com/codemirror/lang-markdown) |
| `@codemirror/search` | 6.7.2 | MIT `LICENSE` | [Editor search](https://github.com/codemirror/search) |
| `decode-named-character-reference` | 1.3.0 | MIT `license` | [Portable named entity decoder](https://github.com/wooorm/decode-named-character-reference) |
| `highlight.js` | 11.11.2 | BSD-3-Clause `LICENSE` | [Bounded local highlighting grammars](https://github.com/highlightjs/highlight.js) |
| `lowlight` | 3.3.0 | MIT `license` | [Highlighted syntax trees](https://github.com/wooorm/lowlight) |
| `pdfmake` | 0.3.12 | MIT `LICENSE`; embedded notices also inspected | [Browser text PDF layout](https://github.com/bpampuch/pdfmake) |
| `rehype-sanitize` | 6.0.0 | MIT `license` | [Restricted HTML tree](https://github.com/rehypejs/rehype-sanitize) |
| `rehype-stringify` | 10.0.1 | MIT `license` | [Safe tree serialization](https://github.com/rehypejs/rehype) |
| `remark-gfm` | 4.0.1 | MIT `license` | [GFM extension](https://github.com/remarkjs/remark-gfm) |
| `remark-parse` | 11.0.0 | MIT `license` | [Positioned Markdown tree](https://github.com/remarkjs/remark) |
| `remark-rehype` | 11.1.2 | MIT `license` | [AST bridge](https://github.com/remarkjs/remark-rehype) |
| `unified` | 11.0.5 | MIT `license` | [Processor composition](https://github.com/unifiedjs/unified) |
| `@types/hast` | 3.0.5 | MIT `LICENSE` | [Type declarations](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/hast) |
| `@types/mdast` | 4.0.4 | MIT `LICENSE` | [Type declarations](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdast) |
| `@types/pdfmake` | 0.3.3 | MIT `LICENSE` | [Type declarations](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/pdfmake) |

Previously installed CodeMirror state/view/commands/language packages are reused. Some entries above already existed transitively in the lockfile; adding a direct pin does not mean that package was wholly new. At this audit the `packages:` lockfile section contained 81 newly introduced package/version keys; traversing all direct Markdown runtime dependencies and the three declaration packages resolved 138 package versions, including reused dependencies. The shipped notices intentionally cover this larger set rather than claiming that every installed package executes in the browser.

The explicit portable decoder dependency and Vite alias replace `decode-named-character-reference`'s DOM-oriented browser export with its pure implementation for Workers. This addresses the actual Worker `document is not defined` integration problem; source/bundle wiring does not substitute for exercising the Worker in a browser.

## Full transitive notices and prebuilt browser code

`website/public/markdown-notices/THIRD-PARTY-NOTICES.txt` contains complete installed notice texts, exact upstream declarations and embedded-source notices. `manifest.json` records each package/version, license declaration, originating artifact URL, notice SHA-256 and deduplicated notice section. `upstream/manifest.json` additionally records fetched artifact integrity, immutable upstream commits and source-map matching evidence. Rebuild deterministically and without network or installation using:

```sh
node website/scripts/prepare-markdown-notices.mjs
```

At this snapshot it collects 138 resolved packages, 161 provenance records and 74 distinct text sections. Notable actual license files beyond MIT include `@swc/helpers@0.5.23` Apache-2.0, `highlight.js@11.11.2` BSD-3-Clause, `@ungap/structured-clone@1.4.0` ISC, `tslib@2.8.1` 0BSD and `sax@1.6.1` BlueOak-1.0.0. `png-js@2.0.0` omits a manifest license field but its actual `LICENSE` is MIT; the audit uses that file rather than inventing an identifier from package metadata.

The exact upstream browser bundle is 1,859,339 bytes, SHA-256 `1ba82a13fbe197ddda9cc9160ed57d44e428b404bc51f84711a53623bf6a7773`. Its source map identifies 26 embedded package names. A top-level pdfmake MIT banner alone does not describe this complete artifact: the source contains Google 2013 Apache-2.0 Brotli notices, Microsoft/Node notices, and QR code public-domain/CC0 terms. Those source notices and the full Apache text are preserved. The separately vendored SVG-to-PDFKit MIT file is copied from the actual pdfmake package and attributed to source revision `b091ebd4e7b7d2310eb1003511cd5de480f7e0e1`; no SVG input feature is implied.

Seven helpers embedded by the upstream browser build are not separately installed in this dependency tree. Their complete LICENSE files were fetched from exact npm artifact versions with SHA-512 integrity verification, and each version had an exact source-file match against pdfmake's supplied source map: `buffer@6.0.3`, `core-js@3.49.0` (71 matching files), `events@3.3.0`, `expose-loader@5.0.1`, `file-saver@2.0.5`, `ieee754@1.2.1` and `process@0.11.10`. Fetching these notices did not install additional dependencies or change the lockfile.

Three upstream projects omit a standalone LICENSE file both from npm and their exact release tags:

| Package | Verified tag and immutable commit | Preserved upstream evidence |
| --- | --- | --- |
| `fontkit@2.0.4` | `v2.0.4`, `fbf3b9ef21eebd219eb73e666faed573af0fba09` | [README MIT declaration](https://github.com/foliojs/fontkit/blob/fbf3b9ef21eebd219eb73e666faed573af0fba09/README.md), package metadata |
| `brotli@1.3.3` | `v1.3.3`, `e36051345f6d27a56e5f39ea70d2f789b8574046` | [README MIT declaration](https://github.com/devongovett/brotli.js/blob/e36051345f6d27a56e5f39ea70d2f789b8574046/readme.md), package metadata, embedded Apache notices |
| `dfa@1.2.0` | `v1.2.0`, `3f5e603e5082caedabefefdf53e8a6ca3111e966` | [README MIT declaration](https://github.com/devongovett/dfa/blob/3f5e603e5082caedabefefdf53e8a6ca3111e966/README.md), package metadata |

Complete pinned READMEs and metadata are retained under `markdown-notices/upstream/`. No absent copyright notice is fabricated. Fontkit's tag contains test-font license files, but those fixtures are not the font shipped by Zero and are not used as its package license. These are explicit upstream packaging caveats, not claims that a nonexistent LICENSE was inspected. The full MIT permission terms are preserved elsewhere in the combined notices from actual MIT files.

## Chinese PDF fonts

The distributed `NotoSansSC-Regular.ttf` and `NotoSansSC-Bold.ttf` are complete static weight 400/700 faces derived from [Google Fonts revision 2894aab31764f10f29c421bdfd2340d3b382d384](https://github.com/google/fonts/tree/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc). The source variable TTF SHA-256 is `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`. `prepare-markdown-fonts.mjs` requires fonttools 4.60.1, disables timestamp recalculation and does not subset characters. The experiment used a temporary Python 3.14 environment; this tool is a maintenance dependency, not browser code.

| Face | Bytes | SHA-256 |
| --- | --- | --- |
| Regular | 10,595,948 | `b7bebb49c3c6b0266362cf75dd9bdd9bf5fbe5fb390be8f7808ebedef376de76` |
| Bold | 10,585,504 | `984cc8f1b8463689f39f653c783188a3914b2ea4bc084db240569d5e6473d035` |

The actual fonts identify version 2.004-H2, Adobe copyright 2014–2021, reserved font name `Source`, and SIL OFL 1.1. The accompanying `OFL.txt` has SHA-256 `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9` and permits embedding/redistribution under its conditions; the derived fonts retain Noto names. `fsType=0` and the cmap measurements are recorded in the shipped font manifest. Instancing preserves inherited family-name metadata (`Noto Sans SC Thin`); weight selection is fixed by preparation and the PDF font map, not inferred from that name.

The two resources total 21,181,452 bytes and are lazy PDF resources, not a claim that the first viewport transfers that amount. Export checks the actual cmap. Supplementary-plane characters, including most emoji and some rare CJK, fail explicitly because pdfmake's `break-all` currently splits UTF-16 code units; italic Markdown uses the upright regular/bold faces. See `pdf-prototype.md` for independently extracted Chinese PDF text and the limits of that local experiment.

## Resource isolation and evidence boundary

Source creates a module Worker via `new URL('./markdown-worker.ts', import.meta.url)` and `worker: { format: 'es' }`. Only the PDF branch imports `markdown-pdf`, which then imports the browser pdfmake artifact and requests fixed same-origin font filenames. Highlight grammars are explicit imports; no runtime language downloads are enabled. Worker URL construction is Vite/base-aware, and font URLs use `import.meta.env.BASE_URL`.

The existing production output inspected during this review contained separate Markdown workspace, editor, asset, Worker, PDF and pdfmake chunks. The Markdown HTML referenced the shared Page script with no PDF/font/modulepreload tags; product HTML did not reference a Markdown script. This is generated-source evidence. Actual browser scheduling, a configured preview base, hosted CSP, cancellation behavior, first-viewport budgets and Safari/iPhone downloads require their own integrated checks. No full build or fixture preparation was run by this evidence-writing pass.
