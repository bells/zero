# Markdown implementation and local verification

Implementation completed in the working tree on 2026-10-23. This record covers the independent static website, necessary feedback-thread integration and representative real desktop Safari flows. It does not establish a desktop Markdown plugin, production deployment, iPhone acceptance, commit, push, specification sync or archive.

## Delivered behavior

The eighth browser tool lives in the new Text category at `/tools/markdown/` and `/en/tools/markdown/`. Source/Preview/Split, expanded workspace, on-demand CodeMirror Markdown editing, selection-aware toolbar, undo/redo, find/replace, outline, counts and optional scroll synchronization are connected. Existing tools retain their categories and URLs. Static output contains 36 indexable routes and 38 routed HTML pages; the separately licensed codec source-material HTML is not a site route.

The positioned Markdown/GFM AST supplies sanitized preview, outline and HTML/PDF semantics. Parsing/highlighting and PDF run in terminating Workers. The browser-compatible entity decoder is pinned to its portable implementation. Static guides are isolated from runtime copy so they do not enter executable bundles. Failure to enhance preserves the basic textarea and source download.

Downloads are actual UTF-8 Markdown, standalone styled HTML and locally generated text-based PDF. Print has its own document-only surface and lifetime. Draft saving defaults to off and retains one document only after opt-in; images require explicit per-document consent, bounded credential-free CORS reads and validated local bytes. No conversion server or image proxy is involved. Optional feedback keeps the shared `tools/markdown` identity and receives only thread/locale after activation.

## Final automated gates

On macOS 27.0.1 (26A434), Node 24.20.0, pnpm 10.33.0 and Chrome 155.0.8059.85:

| Gate | Result |
| --- | --- |
| `pnpm --dir website check` | 155 files, zero errors/warnings/hints |
| `pnpm --dir website test` | 96 passed |
| `pnpm --dir website build` | 38 routed pages built; font/notices integrity passed |
| `pnpm --dir website test:seo` | 10 passed |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website test:browser` | 122 passed, 2.2 minutes; fixtures prepared serially |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website verify:markdown` | Passed long-source/pathological/image/output/isolation experiment |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website verify:performance` | Passed all 26 routes and existing tool stress checks |
| `pnpm --dir website verify:links` | 0 public release assets and 5 project links verified through the configured local proxy |
| `node website/scripts/prepare-markdown-notices.mjs --check` | 138 resolved packages, 161 records, 74 distinct notice sections |
| Feedback integration (preceding 2026-10-22 run) | check/build passed, 12 unit and 11 Chrome browser cases passed, including both Markdown locales; no feedback code changed in this continuation |
| `openspec validate --all --strict --no-interactive` | 34 passed, zero failed |

Full gate logs are retained locally in ignored `website/output/markdown-validation/`; resource and performance records below retain the measured summaries in this change. Root React/Rust/Tauri gates were not used as substitutes for website checks.

Browser coverage includes both languages, light/dark appearance, 320px layout, 200% zoom touch targets, keyboard/search/focus and synthetic IME events, ARIA/axe state, base/preview/no-script routes, source/import/draft failures, explicit image consent, same-source replacement, stale/cancelled jobs, font laziness, three downloads, printing and original-tool regressions. Synthetic composition/ARIA checks are not physical IME or a human screen-reader session.

## Review fixes and regression evidence

- Identical-source replacement now invalidates jobs and revokes image permissions, even if the text has not changed.
- Chinese and percent-encoded heading fragments resolve through one shared rule for preview, HTML and PDF.
- First toolbar enhancement seeds CodeMirror with the textarea selection.
- Dark editor syntax/search controls use the shared theme palette; the enhanced editor passes the targeted dark axe contrast check.
- Clipboard-denial fallback text is erased and hidden on document changes and page exit. The new regression first failed because the fallback remained visible after Clear document, then passed in the full 122-test run.
- Page exit terminates sessions, cancels fetches/timers, revokes download URLs and clears editor/document/draft/source/image/outline/manual-copy references. Persisted-page restoration uses the site's existing reload behavior.

## Resources and output checks

See [PDF prototype](pdf-prototype.md) for font provenance, independent Chinese extraction, 10-page long-code/wide-table visual checks, repeating table headers and original prototype measurements. See [dependency review](dependencies.md), [semantic checks](semantics.md) and [integration scope](integration-scope.md) for their bounded evidence. Those dated prototype records are historical; integrated measurements are recorded separately below.

The enforced policy is 1 MiB/20,000 source lines, 5-second parsing, at most 10 images, 5 MiB/16 million pixels per image and 20 MiB/20 million pixels combined, 15-second image/font requests, at most 32 MiB per source font and per output, and 500 PDF pages/60-second generation. Limits are conservative implementation boundaries, not proof that every accepted document fits every device's memory.

Integrated `verify:markdown` passed on the browser/version above. The complete [resource record](resource-measurements.json) includes unique uncompressed/gzip response bodies, initial request paths and isolation checks. All 18 bilingual product-home/directory/old-tool routes requested no Markdown-specific module or PDF/font asset; the Markdown page itself loaded neither its parse Worker, enhanced editor nor PDF/font before interaction.

| Synthetic corpus / action | Observed result |
| --- | --- |
| 1,048,574-byte source | Preview in 891 ms |
| 100,007-byte repeated-bracket pathological source | Localized parsing timeout in 5,203 ms; subsequent document and export recovered |
| Chinese/Latin, 160 table rows, 120 code lines | First PDF 893 ms; subsequent PDF 858 ms |
| Standalone HTML reopened from a local file | Heading and all 160 rows readable; zero HTTP(S) requests |
| PDF cancel / global search after cancel | 36 ms / 35 ms |
| Synthetic 4000×4000 static PNG (224,436 source bytes) | Authorized load in 326 ms; second 16MP image refused by combined-pixel policy |
| Failed enhancement / fresh-page enhancement | Basic source remains visible / editor ready in 66 ms |
| Dedicated Chrome process-tree RSS | Baseline 1,023,872 KiB; sampled peak and immediate post-clear reading 1,931,120 KiB |

RSS sums may count shared memory repeatedly; this is neither physical footprint nor a reclamation guarantee. Immediate post-clear RSS did not return to baseline. Resource ownership tests and cancellation establish application-level termination/revocation, not an OS-memory guarantee; phone peak/reclamation remains unverified. The measured corpus does not certify every document under the nominal limits.

The first integrated 51,130-byte PDF was independently inspected with pypdf: eight A4 pages (595.28×841.89pt), every Chinese table row and all 120 code lines extracted, zero NUL characters, and the header on all six table pages. The simpler browser-download PDF likewise preserved Chinese/code text. Screenshots of the [320px dark preview](screenshots/chrome-320-dark.png) and [desktop workspace](screenshots/chrome-desktop.png) are retained; no private input was used.

Poppler-rendered [page 1](screenshots/pdf-page1.png) and [page 8](screenshots/pdf-page8.png) were also visually inspected: Chinese/Latin text, table rules/header and continued code are legible within the A4 body, with page numbers separated from content.

The full [performance record](performance-measurements.json) uses local production preview, Lighthouse 13.5.0 mobile simulated throttling at 390×844/DPR1 and conservative uncompressed resource-body totals. Across 26 routes: minimum performance 99, accessibility 100, maximum LCP 1,729.83 ms, CLS 0.05251, initial JS gzip 22,377 bytes and first-viewport resources 206,228 bytes. Both Markdown routes use 17,277 bytes initial JS gzip; Chinese/English first-viewport resources are 194,743/195,912 bytes. Markdown performance is 99/100 and accessibility 100/100. All original thresholds (95/95, 2,500ms, 0.1, 50KiB, 1MiB) remain enforced.

The first full Lighthouse run lost its DevTools `Page.enable` session near the final English image routes and exited nonzero without a complete summary. Its error log is retained locally. The next image-compressor route passed alone at 99/100 with a fresh Chrome process. The harness now starts and cleans up a separate Chrome process per Lighthouse route, and the complete rerun passed with unchanged thresholds. This is harness isolation evidence, not proof of a product crash or a known root cause for the original session loss.

`git diff --check` and untracked first-party text whitespace checks pass. Two trailing-space lines in redistributed upstream font/license notice bodies are preserved verbatim rather than altering those materials; `.gitattributes` exempts only those two integrity-checked files from whitespace checks. Dependency/resource integrity checks pass independently.

The follow-up source-focus fix draws the basic textarea focus outline inside its bounds, so the adjacent preview cannot cover its right edge. Chrome pixel checks verified all four focus edges in light/dark appearance, 1440/320px widths and Source/Split modes; the 15 Markdown browser cases passed. The full website gates were rerun before the requested commit/push. The real-iPhone task remains open.

Full regular/bold Noto Sans SC fonts total 21,181,452 bytes (20.20 MiB), requested only for PDF. Unsupported glyphs, supplementary Unicode/most emoji, font failures and page/output/time limits fail explicitly. Italics use upright faces. Tables wider than eight columns reflow into labelled pairs. Neither screenshots nor browser printing substitute for the direct PDF download.

## Device and delivery boundaries

| Surface | Evidence / remaining gate |
| --- | --- |
| macOS Chrome 155 | Local production-preview integration, accessibility, downloads and resource checks |
| Desktop Safari 27.0.1 | Native UI acceptance passed import/enhancement, draft/restore, image permission, HTML/PDF download/open, Chinese PDF search and independent print preview; see [Safari record](safari-desktop.md). WebDriver remained disabled. Task 8.4 is complete. |
| Real iPhone Safari | No device run for this change. Task 8.5 remains open; Chrome narrow/zoom emulation does not replace it. |
| Hosted website/CDN | Not deployed or tested by this change |
| Desktop Zero / Windows / Linux | Outside this website change |

Earlier sandbox localhost binding failed; the permitted Chrome/server commands subsequently ran through normal automatic approval. A previous approval-service usage-limit failure was retried successfully on 2026-10-23. Neither failure was treated as a product defect or bypassed.
