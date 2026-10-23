# Markdown semantic pipeline — 2026-10-22

Implemented the shared, synchronous document domain for use inside the cancellable parser Worker. `remark-parse` + `remark-gfm` produce one positioned mdast tree; preview/standalone HTML reuse that tree through `remark-rehype`, a bounded `lowlight` language set, `rehype-sanitize`, and `rehype-stringify`. Rendering does not mutate the tree.

Raw source HTML is ignored. Text links accept HTTP(S), mailto, and local fragments, reject credentials/active protocols, and receive safe new-window attributes. Generated heading IDs have an `md-heading-` prefix and unique suffixes; conventional `#slug` links resolve to these IDs. Images remain identifiable placeholders without `src`; supplied local PNG/JPEG/WebP data URLs receive MIME/signature/size checks at the HTML boundary. The browser image adapter remains responsible for authorization, credential/referrer-free requests, actual image decoding/dimensions, total image budgets, and unsupported-format reporting. Image metadata follows source nodes even when a footnote moves during rendering. Reference definitions follow first-definition precedence.

UTF-8 import is fatal on malformed bytes, removes a leading BOM, normalizes CRLF/CR, and enforces centralized 1 MiB / 20,000-line limits. Source statistics count Unicode code points and word-like `Intl.Segmenter` segments (a Unicode letter/number fallback is used if Segmenter is unavailable). HTML export includes UTF-8, language, escaped title, inline document/print/highlighting CSS, and a restrictive CSP; it excludes external image URLs and site resources. PDF conversion consumes the same tree separately.

Highlighting is limited to JavaScript, TypeScript, JSON, CSS, XML/HTML, Bash, Python, and Rust plus explicit aliases; unknown fences remain escaped plain code. No auto-detection, runtime grammar fetching, Mermaid, or formula execution is enabled.

Validation:

- Test-first baseline: seven real domain assertions failed against intentionally empty implementations. Later tests first exposed duplicate-definition mismatch, moved-footnote image mismatch, and missing local-anchor remapping before the corresponding fixes.
- `node --test tests/markdown-domain.test.mjs`: 11 passed, 0 failed.
- Targeted TypeScript command with `--strict --noUncheckedIndexedAccess --noEmit --skipLibCheck --target es2023 --module esnext --moduleResolution bundler --allowImportingTsExtensions --lib es2023,dom`: passed for the semantic entrypoints and imported contracts/policy/style.
- Local Node 24 measurements (synthetic data, not browser/mobile capacity certification): 20,000 repeated headings / 179,999 UTF-8 bytes / 1,377,785 HTML bytes parsed and rendered in 541 ms; 1 MiB ASCII prose / 524,288 word segments / 1,048,603 HTML bytes in 684 ms. Statistics and slug assignment avoid whole-segment arrays and quadratic repeated-heading scans.

Cancellation, the five-second parser deadline, stale-response protection, draft persistence, image request limits, PDF generation, download delivery, browser integration, and Safari/iPhone checks are outside these pure-domain test results. The coordinating implementation must validate those boundaries independently.
