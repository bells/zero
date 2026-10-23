# Markdown integration scope and verification boundaries

Reviewed 2026-10-22 against the live website source. The implementation is confined to the independent static Astro website and the existing feedback thread contract. It introduces no Rust code, Tauri command, Rust/TypeScript IPC, desktop plugin, File engine dependency, document upload endpoint or server PDF conversion service.

## Discovery and existing behavior

The seven runnable web tools become eight. The explicit slug/category map keeps timestamp, JSON, Base64 and diff in Development, keeps the three image tools in Images and adds Markdown alone to Text (`text`, 文本类 / Text). Existing web and desktop-documentation URLs keep their identities. The added public pages are `/tools/markdown/` and `/en/tools/markdown/`; the corresponding canonical route set grows from 34 to 36 indexable pages and from 36 to 38 routed HTML documents including the two localized error documents; licensed codec source-material HTML is counted separately. These are asserted route expectations; final generated-output checks must establish the actual delivered set.

Category parsing only accepts stable category values; directory search remains in memory and can recover from Images to All while retaining its query. All-tool search covers eight independently of the directory filter. Language navigation transfers only the validated category beneath the configured base, not source or search strings. Shared bilingual guide data feeds static instructions, examples, browser-agent guidance, WebApplication actions and the full AI index. The tests include both language metadata and the new Text category beneath `/zero-preview/`.

The Markdown feedback identity is `tools/markdown` for both languages. Both frontend and service allowlists include it. Feedback configuration remains default-disabled and cross-origin; only explicit activation creates the frame, whose URL contains threadId and locale. Added enabled-fixture browser cases check no pre-click frame/request, no synthetic source marker, no request body/referrer, and preservation of editor content on close. These browser cases were authored for the final integration run; authoring them is not browser acceptance evidence.

## Local privacy exceptions

The seven existing tools retain their temporary-page privacy statement. The directory now explains the narrow Markdown exceptions, and Markdown uses a separate shared privacy paragraph in both HTML and AI guidance:

- Source is temporary page memory by default. Explicit opt-in stores one versioned local browser draft under `zero.markdown.draft.v1`, shared across the two languages. Turning saving off or deleting removes that draft and cancels pending writes while preserving current source. Storage errors and cross-tab changes produce an unsaved/conflict state.
- External images are placeholders by default. An explicit action loads an authorized HTTP(S) source for the current document with omitted credentials/referrer, CORS and rejected redirects. Static PNG/JPEG/WebP bytes and decoded dimensions have individual and aggregate bounds. Images/permissions are not persisted in drafts. Import/restore clear document image authorization; newly added sources need their own action.
- Raw HTML is ignored by the shared renderer instead of executing scripts, styles, forms or embeds. Downloaded HTML has embedded styles and local authorized images, restrictive CSP and no automatic third-party asset URLs. Ordinary text links remain explicit reader actions.
- Source, filenames, document titles, image URLs, selections, word counts, drafts and export details are not feedback context. No remote font service receives document characters. No conversion server acts as a silent fallback.

The shared limits are 1 MiB / 20,000 source lines; parse 5 seconds; at most 10 images, each 5 MiB / 16 million pixels and together 20 MiB / 20 million pixels; image/font request 15 seconds; source font 32 MiB; HTML/PDF output 32 MiB; PDF 500 pages and 60-second generation. These are conservative executable policies, not capacity guarantees for all devices. Source downloads, standalone HTML, direct text PDF downloads and Print are distinct actions.

## Affected implementation paths

| Area | Paths |
| --- | --- |
| Page wiring and presentation | `website/src/components/webTools/Page.astro`, `MarkdownWorkspace.astro`, `website/src/styles/markdown-workspace.css`, `website/src/scripts/web-tools/page.ts` |
| Pure document rules | `website/src/lib/web-tools/markdown-contracts.ts`, `markdown-policy.ts`, `markdown.ts`, `markdown-html.ts`, `markdown-style.ts` |
| Browser adapters and tasks | `website/src/scripts/web-tools/markdown-workspace.ts`, `markdown-session.ts`, `markdown-worker.ts`, `markdown-editor.ts`, `markdown-assets.ts`, `markdown-draft.ts`, `markdown-pdf.ts` |
| Discovery and shared copy | `website/src/lib/web-tools/categories.ts`, `website/src/content/web-tools.ts`, `web-tool-guides.ts`, `markdown-content.ts`, `web-copy.ts`, `ai-index.ts` |
| Dependency/resource materials | `website/package.json`, `website/pnpm-lock.yaml`, `website/astro.config.mjs`, `website/public/markdown-fonts/`, `website/public/markdown-notices/`, font/notice preparation scripts |
| Optional feedback identity | `feedback/shared/contracts.ts`, `website/src/scripts/web-tools/feedback.ts`, `feedback/tests/browser/embed.spec.ts` |
| Verification inventories | Markdown domain/draft/PDF/browser tests, category/discovery tests, existing web-tools browser counts, `website/scripts/build-fixtures.mjs`, `website/scripts/performance.mjs` |

The configured portable entity decoder alias is needed for the parser's Worker export; selecting a DOM-only browser decoder would break actual Worker parsing. PDF and font code are dynamically reached only through PDF export; editor enhancement and bounded image loading have separate imports. See `dependencies.md` for pinned package and full notice provenance, and `pdf-prototype.md` / `semantics.md` for narrower experiment evidence.

## Verification record for this integration pass

The discovery work observed expected red tests for eight tools, Text parsing and the Markdown feedback identity, then 13 scoped category/catalog/feedback tests passed. A separate AI-index regression first failed because Markdown inherited the temporary-only privacy paragraph, then passed after selecting Markdown-specific privacy. Content key parity, changed script syntax and whitespace checks passed. The root subsequently reported a 66-test Node baseline across the integrated implementation; that is root-run evidence, not an additional run by this evidence writer.

This pass inspected source and existing generated output, audited licenses/font bytes, and prepared deterministic public notices. It did not build the site, prepare shared fixtures, run a desktop app, deploy, commit, push, sync specs or archive a change. Source inspection and a successful module build do not establish an interactive Worker under the actual browser CSP/base, selectable PDF text in every viewer, Safari/iPhone download behavior, mobile peak memory, native application acceptance, or limit-capacity performance. Final website check/test/build/SEO/browser/link/performance results should be recorded separately with their actual outcomes; unfinished manual/device tasks remain open.

Read-only integration review identified cancellation/retry of an image reusing an aborted controller, and invalid local draft source being checked too late during restore. Both were sent to the root implementer for focused correction. A subsequent scoped run passed all nine category/draft tests, including the new shared-source-validation regression for draft restore. Image cancellation/retry still requires its browser regression result; merely observing a source correction does not establish that flow.

Notice preparation was run twice without network access and produced byte-identical combined notices/manifests. All pinned upstream file hashes, referenced notice sections, the 138-package inventory and seven embedded-helper source-map matches were checked. No build or fixture preparation was involved in those checks.

The runtime UI copy is isolated in `content/web-copy.ts`; static guides are excluded from executable browser assets. Resource verification in predev/prebuild checks the two font hashes/license and regenerates notice content in memory for equality checking only, with no network or tracked-file rewrite. The feedback visitor subject label map now explicitly covers every allowlisted tool (including the existing image threads and new Markdown thread).

Final verification supersedes the earlier authored-only status: the 2026-10-22 integrated feedback run passed check/build, 12 unit cases and all 11 browser cases, including both Markdown locales. The 2026-10-23 website run passed all 122 browser cases and the full resource/performance gates. Results and remaining device boundaries are recorded in [implementation.md](implementation.md).
