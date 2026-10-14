# Web tools implementation record

## Baseline and scope (2026-10-14)

- Baseline commit: `5c34eda` (`fix windows ci`); clean tracked tree before implementation; only the proposed change directory was untracked.
- Independent Astro 7.3.8 site; Node 24.20.0 and pnpm 10.33.0. No desktop runtime/IPC implementation in this change.
- Existing `/tools/{snap,launch,awake,paper,file}/` and English counterparts remain desktop documentation. New directory + three interactive tools add eight indexable HTML pages (26 total, plus two noindex error HTML documents).
- Source release catalog reviewed: unavailable, no packages, verifiedAt 2026-10-12. Standard contains Awake/Paper/Snap/Launch, core contains none, File is excluded. Package-profile change still has device/hosted-CI checks open. This work does not refresh public release availability.
- User confirmed a future desktop plugin for offline use. Pure TS domain modules have no DOM, Astro runtime or Tauri imports. Website content describes the plugin as planned, not shipped. No PWA/first-load offline promise.

## Dependencies

Reviewed npm version/license/repository metadata and installed upstream README/API material:

- `jsonc-parser` 3.3.1, Microsoft, MIT: scanner offsets and formatting edits preserve source lexemes; strict parse options reject comments/trailing commas. No ordinary document-to-JS-object round trip. Tests cover duplicate keys, unsafe integers and exponent lexemes. Avoid its ambient const enum in strict Astro TS; scanner raw token ranges distinguish structure without copied parser logic.
- CodeMirror 6 (`view` 6.43.14, `state` 6.7.6, `commands` 6.11.1, `language` 6.13.1, `lang-json` 6.0.2, `lint` 6.9.7, direct `@lezer/highlight` 1.2.5 for theme-aware syntax tags), MIT: modular browser editor with JSON grammar, folding, diagnostics and keyboard support. Only requested by the explicit enhanced-edit button.
- `image-meta` 0.3.0, UnJS, MIT: no-dependency browser-compatible metadata reader; upstream documents exceptions and content-based type/dimensions. A PNG/JPEG/WebP allowlist and size/pixel/MIME checks precede browser decoding. Other formats supported by the library are intentionally not accepted by the tool.
- Website lockfile pins all additions. Frozen offline install succeeds using the pre-existing local website `output/pnpm-store` store. No root dependency changes.
- Public search connector returned an error; npm/upstream installed documentation provided the dependency evidence. Initial sandbox proxy access failed EPERM; approved network execution fetched dependencies. No credential reads.

## Validation

- `pnpm --dir website check`: zero errors/warnings/hints across 56 files.
- `pnpm --dir website test`: 14/14 pass, including source-preserving JSON, dates, Unicode, image bytes/type/size and worker cancellation/timeout/stale replies.
- Website production build: 26 indexable HTML pages plus two noindex error HTML files, standalone assets. SEO artifact suite 7/7 passes; static links, sitemap, distinct browser entities, language equivalence and old documentation remain valid.
- Isolated catalog/preview fixtures pass with production `SITE_PREVIEW=0`, preview noindex and `/zero-preview/` base. Test package fixtures never alter real catalog/output.
- Full Chrome Playwright/axe suite: 49/49 passes (46.2s). Full run report retained in ignored `website/output/browser-full-results.json`; subsequent targeted runs may update the normal report. Browser evidence covers light/dark AA, 320/390/720/768/1440px, reduced motion, keyboard, no-script guidance, worker failures, timeout/cancel, actual image downloads, preview URL lifecycle and synthetic content network/storage/URL/console observations.
- Browser plugin was not available; project Playwright used. Initial sandbox run could not listen on 127.0.0.1:4321 (EPERM); approved local execution ran the preview/Chrome. No production deployment or external account change.
- Initial browser run exposed global download `fieldset` defaults leaking into tools and theme background transitions causing temporary contrast failures. Added tool-scoped resets and immediate theme-color changes. A no-script assertion initially targeted `noscript` itself (Playwright text extraction ignores that tag); verified its rendered paragraph directly instead. CTA assertion was corrected to the existing catalog copy, “Explore the trial”.
- Enhanced editor received explicit theme-aware syntax colors and a dedicated dark-editor AA check. Final tool-only browser/axe rerun: 20/20 pass (23.1s), including the enhanced dark editor. Performance checks passed; details are in `performance-summary.json`.
- Environment: macOS arm64, Node 24.20.0, Chrome 155.0.8059.40, Lighthouse 13.5.0. Local production preview at `http://127.0.0.1:4321`, fixed mobile 390×844/DPR 1 with simulated throttling; Playwright responsive checks include 320/390/720/768/1440px. These do not constitute Safari/Firefox, physical mobile-device, hosted-site or desktop runtime evidence.
- Sixteen representative old/new pages: performance 100 and accessibility 100 throughout; maximum LCP 1730.4 ms and CLS 0. Tool directory initial JS gzip 6545 bytes, timestamp 8680, JSON/Base64 8831; tool first-viewport bytes ≤145637 (conservative uncompressed bodies). All configured budgets pass.
- Enhanced editor loads only on user action: 109765 bytes gzip and 118 ms ready time in this run. One exactly 1048576-byte JSON input compressed with identical output in 158 ms, then clear removed the result. These single local samples are not universal latency guarantees or memory benchmarks.
- Additional rendered smoke: JSON sample with Chinese/emoji and a large integer, actual fold/unfold interaction, screenshot `/tmp/zero-web-tools-json-desktop.png`, correct page title/URL and no page errors. This final screenshot used Chrome 155.0.8059.79; the earlier performance run records its own 155.0.8059.40 version. A first automation attempt selected a hidden CodeMirror measurement node; using visible controls verified the actual interaction.
- Final static content and license notices included in production output. `web-tools.txt` retains MIT notices for the added runtime modules and their bundled dependencies. No generated dist/node_modules/output files are staged or committed.
- OpenSpec strict validation: 29/29 pass; pre-existing icon-spec archive dependency warning remains unrelated. No sync/archive performed.

## Remaining boundaries

- Production deployment, hosted HTTP/CSP checks, Search Console/Bing verification/submission, commit/push and spec sync/archive were not performed.
- The live release catalog was not refreshed from GitHub; current CTA follows the checked source catalog.
- Desktop offline plugin is a later feature, not delivered here. Browser first-load offline access and safe memory erasure are not promised.
- The local preview is left available for review; implementation checks do not prove desktop device behavior or packaging.
