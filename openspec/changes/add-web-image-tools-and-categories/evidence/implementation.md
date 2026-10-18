# Image tools implementation evidence

Date: 2026-10-17. Status: **preflight partially implemented; public image tools
and categories are not implemented**. Task progress is 5/40 (1.1–1.4 and 3.1).
No commit, push, specification sync, archive or deployment was performed.

## Scope and durable evidence

- Experiment sources: `website/experiments/image-codecs/`, with reproduction
  instructions in its README and fixed-candidate review in DEPENDENCIES.md.
- [Desktop preflight snapshot](desktop-preflight.json): environment, actual
  codec results, HEIC dimensions/times, cancellation, same-origin request URLs,
  and the 15-file fixture manifest including signatures, sizes and SHA-256.
- [Dependency/artifact inventory](dependency-inventory.json): all 156 files
  in the seven fixed candidate/transitive npm packages and all 38 isolated
  experiment artifacts, with bytes and SHA-256. These are inventory records,
  not copied third-party binaries or a completed license/source distribution.
- Full generated files and local command logs are ignored in
  `website/output/image-codecs/`. The experiment build is separate from the
  production `website/dist/`; installed candidates are development dependencies.

## Completed tasks

**1.1:** 15 entirely synthetic fixtures generated from colored pixels; two
fixture tests verify byte manifests, signatures, dimensions, actual JPEG EXIF
orientation 1/3/6/8, synthetic device/GPS and PNG XMP, two animation frames,
disguised PNG, damaged JPEG, and exact transparent RGB/alpha references.
Apple ImageIO encodes real HEIC bytes at 4032×3024 and 8064×6048; `sips` checks
primary dimensions. These are original synthetic HEIC encodes, **not camera
originals** and not iPhone picker conversions. No private photos were used.

**1.3:** Fixed `@jsquash/jpeg@1.6.0`, `@jsquash/webp@1.5.0`,
`@jsquash/png@3.1.1`, `@jsquash/oxipng@2.3.0`, `fflate@0.8.3`;
also fixed HEIC candidate `heic-to@1.6.6`, with transitive
`wasm-feature-detect@1.9.0` locked. Browser execution encoded actual bytes,
checked signatures and independent ImageBitmap decode dimensions, compared
decoded PNG RGBA including hidden RGB, and extracted a store-mode three-file
ZIP with byte-for-byte equality. JPEG quality 25/90 produced 769/4410 bytes;
WebP produced 688/2132 bytes. PNG optimized from 5602 to 252 bytes with
`optimiseAlpha: false` and exact RGBA. These sizes are this synthetic sample's
results, not guarantees or selected production quality defaults.

## Historical initial HEIC/worker evidence

Chrome 155.0.8059.80, Apple M2, 16 GiB, Darwin 25.6.0, automated desktop run:

| Synthetic HEIC | Run 1 | Run 2 | Primary output | One RGBA buffer |
| --- | --- | --- | --- | --- |
| 12MP | 636.9 ms | 574.2 ms | 4032×3024 | 48,771,072 bytes |
| 48MP | 1553.1 ms | 1561.7 ms | 8064×6048 | 195,084,288 bytes |

Each run starts a new worker. Times cover the worker's codec import/init,
container read, primary check and decode, excluding the fixture fetch and some
worker startup. Run 2 is **not** a warmed persistent decoder. RGBA sizes are
not process peak memory. No safe mobile limit or memory-reclamation conclusion
follows from this table.

The experiment uses the internal CSP libheif binding, verifies exactly one
primary image, checks dimensions before `new ImageData`, and frees image/context
handles on completion. The unmodified high-level `heic-to` adapter takes
`data[0]` and allocates ImageData before exposing primary dimensions, so it is
not suitable as-is for the planned production guard. Library parsing can itself
allocate before the application guard. The CSP binding is asm.js; jSquash uses
WASM. Node-specific imports in the generated binding produce Vite browser-
externalization build warnings; the exercised browser paths did not use them.

A 16,000,000-pixel experimental ceiling rejected the 48MP sample before
application RGBA allocation; **this is a guard test value, not a release
policy**. Termination after actual HEIC primary progress delivered no late
results; a busy-loop worker was stopped by a 100 ms timeout. The recorded
cancellation observation window includes an additional 200 ms wait. These do
not prove queue revision handling, peak memory, or physical reclamation.

The isolated build runs at `/image-lab/` with `default-src 'none'`, same-origin
script/worker/connect rules, `wasm-unsafe-eval` but no `unsafe-eval`, no frames,
and no COOP/COEP. No codec request occurred before an operation; all observed
resources stayed under the same-origin base. The final run had zero browser
console/page errors. An initial missing favicon 404 was diagnosed and fixed;
the zero-error assertion was retained. No production CSP or deployment was
changed.

## Gates and remaining work

**1.4 is complete for the experimental candidate/materials.** The subsequent
source, transitive-license, rebuild and independent replacement work is recorded
in [license-rebuild.md](license-rebuild.md). Ten source archives, locked Rust
dependencies and full notices are assembled with a verified source-built HEIC
module. The local bundle has a tested per-file inventory. Future public builds
must use that verified artifact and carry the same source/notices/replacement
boundary; this is not website release or deployment approval.

The initial attempt queried fixed npm source commits and recorded them in
`fetch-sources.mjs` acquisition script. Source archive acquisition failed:
Node timed out at 60 seconds, and a proxy curl retry timed out at 25 seconds
with only 1,549,991 bytes. The incomplete archive was removed; it is not
inventory evidence. Emscripten/CMake/Ninja were initially absent. The subsequent
direct-network acquisition and isolated toolchain resolved this initial block;
see the later evidence for the current state.

**1.5/1.6 are open.** The user supplied an About screenshot identifying iPhone
17 Pro / iOS 27.0.1; only those fields are retained in
[mobile-device-plan.json](mobile-device-plan.json). The user subsequently reported normal completion of the first synthetic 12MP HEIC decode on iPhone Safari; see [device observations](iphone-safari-observations.json). Desktop Safari remains untested. Actual
camera originals, actual iPhone picker-transcoded JPEG distinction, Safari HEIC orientation/color/
alpha, process peaks and cancellation reclamation, retained-result and ZIP
overhead, downloads/opening, and final policy/defaults are pending. Task 1.2 was subsequently completed for the independent desktop experiment; see [worker-mobile-preflight.md](worker-mobile-preflight.md) for real orientation, failure paths, the unsafe-header limitation, and the runnable device lab. Device-specific tasks remain open.

The approved design's Migration Plan step 1 requires codec/license/device/
resource experiments **before** queue and page integration. Implementation therefore remains at the experiment gate with a runnable mobile lab and no guessed production mobile limits. Tasks 2–8 and the full final acceptance
tasks in section 9 remain unchecked. Public routes/indexes and feedback
allowlists remain at the existing four-tool baseline.

## Verification

- `pnpm --dir website experiment:images:fixtures`: 15 synthetic files generated
  using native ImageIO. Initial sandbox-only encoding failed; the permitted
  native rerun succeeded. No tests were weakened.
- `pnpm --dir website experiment:images`: fixture 2/2; built real Chrome codec/
  worker experiment passed; inventory of seven packages and 38 artifacts passed.
- `pnpm --dir website check`: no errors/warnings/hints.
- `pnpm --dir website test`: 33/33.
- `pnpm --dir website build`: 30 HTML pages, including two errors (28 indexed
  page baseline); no image codec/WASM artifacts in production output.
- `pnpm --dir website test:seo`: 9/9.
- `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website test:browser`: 66/66
  existing regression cases passed in the initial preflight run, including
  isolated preview/base fixtures; these were not repeated for the license-only
  follow-up. The new replacement experiment was separately rerun.
- `pnpm --dir website verify:links`: verified five project links and zero
  public release assets (the real catalog has none).
- `openspec validate --all --strict`: 32 passed, zero failed. Existing informational
  archive-order notices are not source/runtime or archive approval.
- `git diff --check` and explicit inspection of new files: no whitespace errors;
  changes are limited to this change's tasks/evidence, website experiment,
  website development dependencies/lockfile and `docs/website.md`.

These checks do not complete 9.1–9.5 for image tools, whose UI/support matrix
and acceptance work have not been implemented. Root Rust/Tauri gates and
native desktop flow inspection are inapplicable to this website-only preflight.

## Worker/mobile-lab follow-up

Task 1.2 is now complete for the isolated desktop experiment, with 20 synthetic files and 4 corpus/server path tests; [current evidence](worker-mobile-preflight.md) and [browser snapshot](worker-mobile-preflight.json) record the orientation/guard/failure paths and download/privacy checks. The current material manifest has 334 files and eight npm packages, adding the existing MIT image-meta dependency. The user subsequently reported normal completion of the first synthetic 12MP HEIC decode in iPhone Safari. This is a direct user report with no timing or memory data; see [device observations](iphone-safari-observations.json). Other real-device checks remain pending.

The device follow-up now also includes user-pasted 12MP JPEG/ZIP generation
timings (51.621 seconds total worker elapsed) and explicit JPEG download/open
confirmation. ZIP download/extraction, memory and remaining device checks are
still pending; details remain in iphone-safari-observations.json.

The user has now also contextually confirmed downloading/extracting the
experimental ZIP and opening its JPEG. Experimental single-image and ZIP
download workflows are therefore positively user-reported on iPhone Safari.
The final workbench download regression remains required after implementation;
no additional task checkbox is marked complete by this isolated lab result.

The user also reports timely manual cancellation during synthetic 12MP decode
and normal processing after cancellation. This is responsiveness/recovery
evidence only; no process-memory reclamation or timeout measurement is inferred.

A single synthetic 48MP decode on the iPhone returned `timeout` under the
configured 60-second deadline. There is no accepted 48MP output or measured
peak-memory evidence. Current candidate/resource-policy acceptance remains
open; timeout recovery is the next device check.

After the 48MP timeout, the user confirms normal 12MP processing without a
page refresh. Application timeout recovery is positively user-reported;
physical memory reclamation remains unmeasured.

The phone synthetic HEIC 90°/180°/270° irot checks now pass: oriented dimensions
and all four quadrant RGBA samples match the phone baseline exactly. Timings
are 13.568 / 14.343 / 13.891 seconds. Camera-original orientation/color and
measured memory remain unverified; see the structured device observations.

The user deferred the local raw camera-original 12MP HEIC step. That check
remains unverified; no acceptance checkbox or supported-format claim was
expanded. [Current device matrix](device-matrix.md) consolidates the phone
results and distinguishes measured values, direct user reports and open work.

## 2026-10-18 continuation

Task 3.1 is complete: pure typed image contracts, immutable queue rules and
unknown-message validation, with eight behavior tests and no-DOM compilation.
It is not connected to production pages or Worker adapters. Desktop Chrome
RSS observations cover eight isolated synthetic scenarios; Safari is explicitly
deferred by the user after the actual WebDriver prerequisite failure. Resource
policy and phone process-memory gates remain incomplete. See
[resource/domain evidence](resource-and-domain-2026-10-18.md).
