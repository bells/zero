# Worker orientation and mobile lab follow-up

2026-10-17. **Task 1.2 completed for the independent desktop experiment.**
Overall 4/40 tasks complete (1.1–1.4). Phone/Safari measurements, production
resource policy, image workbench and public categories remain incomplete.

## Real-byte checks

[Browser evidence](worker-mobile-preflight.json) records Chrome 155 on Apple M2,
16 GiB. The source-built independently replaced decoder retains its previous
SHA-256 `5c7b2c8ce7a3a9161c7ed5dd33fdd43ed4fb26b972cd331f03a4163b14ceb3ca`.
No SDK installation or C/C++ rebuild was repeated in this follow-up.

The corpus now has 20 synthetic files. Three new HEIC files alter only the
one-byte irot property associated with the primary image; the compressed image
data stays identical to synthetic-12mp.heic. A fixture test verifies primary
property association and the exact one-byte differences. Actual worker decode
checks 90°/180°/270° output dimensions and TL/TR/BR/BL RGBA samples against
symmetrically selected source pixels (tolerance 4 channel levels). This detects
omitted or double rotation without relying on a metadata tag assertion alone.
JPEG EXIF fixtures remain separately covered; these tests do not establish
camera-original, mirrored HEIC, HDR/color, alpha or Safari orientation support.

The existing image-meta 0.3.0 dependency now checks actual HEIC type and cheap
container dimensions before loading libheif. The adapter separately checks the
selected primary's dimensions before application ImageData allocation, and
checks the returned ImageData dimensions/length. Primary image/context handles
are released in finally even when container decoding throws. A 48MP sample
under a 16-million-pixel limit fails before codec loading. Truncated HEIC and
PNG disguised as JPEG do not produce successful HEIC output.

The deliberately underreported-ispe fixture is an important **observed failure**:
image-meta reports 96×64 instead of the encoded 4032×3024 grid, and the libheif
handle also reports the small header dimensions. The candidate fails decode
with stable error `codec`, not `limit-before-rgba`. Do not claim these header
checks independently bound internal allocation or all malicious containers.
This remains a resource/security limitation for task 1.6, not evidence of a
safely accepted image. Earlier test expectations of an authoritative large
primary header were corrected after inspecting actual candidate behavior;
no success output was permitted for this malformed fixture.

Recorded fresh-worker 12MP times: 612.5 / 558.7 ms; 48MP: 1527.7 / 1444.1 ms.
These exclude fixture fetch and some host startup; second runs are not warmed
persistent decoders. No process peak memory or reclaimed-byte measurement was
made. Source metadata parsing and native decoding may allocate internally.

Automatic termination after primary inspection, 200 ms late-response
observation, manual cancellation of a busy worker and a 100 ms deterministic
timeout all pass. Existing restrictive CSP/base, no early codec loading,
no COOP/COEP and same-origin resource assertions remain; zero console/page
errors were observed in the final run.

## Runnable device lab

The lab now supports one active operation, manual cancellation, timeout,
clear/pagehide cleanup and rejection of stale asynchronous UI completions.
Optional full-size JPEG quality 75 encoding creates one retained JPEG and a
store-mode ZIP. It exposes encode/ZIP times and actual Blob bytes. Downloads
are explicit clicks; preview is a separate explicit full-size browser decode.
New processing/clear/leave revokes both Blob URLs and releases application
references. This is an experimental harness, not the production queue.

Chrome UI checks downloaded real JPEG bytes (4032×3024), extracted the downloaded
ZIP and compared the JPEG exactly. The worker separately extracts/verifies its
archive. Local-file tests pass raw HEIC with a wrong MIME and JPEG bytes under
a .heic filename: actual bytes determine behavior, and JPEG is not counted as
HEIC evidence. A private filename marker never appears in network URLs;
localStorage/sessionStorage remain empty. Full production privacy acceptance
in task 8.4 is still pending. The lab passes 320px overflow and interaction
checks; visual screenshot was inspected at `/tmp/zero-image-lab-mobile.png`.
Browser plugin was not available; the existing repository Playwright experiment
was used. This is desktop Chrome evidence, not iPhone browser emulation proof.

The local Node server serves only indexed experiment/material files from the
assembled bundle. It binds one assigned private LAN IPv4; permits GET/HEAD;
rejects queries, traversal, unrelated files, foreign Origin/Host and write
methods; and creates no upload endpoint or access log. Library replacement is
explicitly exempt from runtime hash rejection, preserving LGPL replacement
rights. All other indexed files are checked against the material snapshot.
Source/notice/rebuild links are served alongside the experiment. The actual
LAN URL returned HTTP 200 from this Mac; reachability from the phone is pending.

[MOBILE-TEST.md](../../../../website/experiments/image-codecs/MOBILE-TEST.md)
provides preparation, ordered tests and a sanitized report template for
**iPhone 17 Pro / iOS 27.0.1**. Only the screenshot-derived model/OS are retained.
32 MiB / 50 million pixels / 60 seconds / quality 75 are explicit experimental
values, not selected production limits/defaults. No phone result is assumed.
Tasks 1.5/1.6, 7.3 and 9.3 remain unchecked.

## Verification and material refresh

- `experiment:images` with the source-built drop-in: 4 corpus/path tests and the
  complete real Chrome worker/UI experiment passed; eight packages / 45 output
  artifacts inventoried. Independent module replacement still passes with all
  host/worker JS unchanged and served library hash matching the source build.
- `experiment:images:licenses`: 334 indexed materials, integrity/archive test 1/1.
  Adds MIT image-meta including both upstream attributions, full installed
  package source, and latest experimental host source. Ten original source
  archives and 90 locked Rust dependency records retained.
- Local server bundle integration: 1/1; actual page/scripts/notices/source links,
  HEAD/no-store, write denial and unrelated/query/foreign-origin refusal pass.
- Website check: 103 files, zero errors/warnings/hints; website tests: 33/33;
  build: 30 HTML pages; SEO: 9/9. Existing production route/index count is
  unchanged and no image codecs are integrated into its initial assets.
- Full existing 66-case production browser suite is historical evidence from
  the initial preflight; it was not rerun for this isolated lab follow-up.
  Desktop Safari, real iPhone Safari, native desktop and device memory were not
  tested. Root Tauri/Rust changes are absent.

See [material inventory](mobile-lab-materials-manifest.json). The earlier
license/rebuild inventories remain historical snapshots. No commit, push,
deployment, spec sync or archive was performed.

## First phone observation — user report

After the desktop/lab verification above, the user replied “正常完成” to the
iPhone Safari synthetic 12MP HEIC decode test with optional encoding disabled.
This establishes user-reported normal completion for that operation only.
No duration, dimensions, browser version, peak memory, cancellation recovery or
download outcome was supplied. See [structured device observations](iphone-safari-observations.json).
Tasks 1.5/1.6, 7.3 and 9.3 remain unchecked; overall progress is still 4/40.

The user later supplied lab JSON for one decode: **13254 ms**, 4032×3024,
12,192,768 pixels, one primary image and 48,771,072 RGBA bytes. No encode/ZIP
fields were present. The run ordinal is unknown, so this is not assigned to
the initial or repeat run. The buffer size does not establish process peak
memory. The original normal-completion report and this JSON are not counted
as two independently measured runs. Other device tasks remain pending.

A subsequent user-pasted 12MP export result reports decode **16005 ms**, JPEG
encode **18867 ms**, ZIP **32 ms**, and total worker elapsed **51621 ms**. JPEG
is 176,763 bytes; ZIP is 176,901 bytes. The user explicitly confirmed JPEG
download and opening. ZIP generation is evidenced by the lab result, while
ZIP download/extraction/opening remains unconfirmed. The 16,717 ms difference
between total and the named phases includes unprofiled work outside those
timers (including lazy imports); do not attribute it solely to encoding or
claim end-to-end device performance. Total worker time is close to the
experimental 60-second timeout, so no production budget is selected from it.
No memory, save-to-Photos, visual direction or cancellation claim follows.
Tasks 1.5/1.6, 7.3 and 9.3 remain unchecked.

After being asked to download the ZIP, extract it in Files and open its JPEG,
the user replied “也是能打开的”. This is recorded as contextual user confirmation
of the experimental ZIP download/extract/contained-image-open workflow. Exact
system UI/save location and on-device byte equality were not separately supplied.
Together with the prior JPEG confirmation, both experimental Blob download
flows have positive real-device user reports. This does not establish Photos
saving, final-workbench behavior, memory or remaining device acceptance. Task
7.3 remains unchecked until the implemented workbench receives its download
regression; 1.5/1.6 and 9.3 also remain incomplete. Next device check is manual
cancellation during HEIC decode followed by successful fresh processing.

The user subsequently reported “取消及时，重新处理正常” after the instructed
manual cancellation during 12MP HEIC decode and fresh rerun. Record timely
interaction and recovery as direct user observations, without invented latency,
error-code capture or physical memory-reclamation evidence. Timeout, 48MP,
orientation/color, camera originals and measured memory remain pending. The
next bounded test is a single synthetic 48MP decode with JPEG/ZIP export off.

The instructed single synthetic 48MP decode (encoding off) returned user-pasted
`{"kind":"error","code":"timeout"}`. Current host configuration is 60,000 ms
and terminates the Worker on this path. Record failure to finish within that
configured deadline, not a measured decode duration, OOM, universal 48MP
incompatibility or a selected production limit. No 48MP output was produced;
recovery and physical reclamation after this timeout are still unverified.
Next check is a fresh 12MP decode without refreshing the page. The timeout is
retained as device evidence; it is not hidden by extending the deadline.

The user replied “能正常处理” to the fresh 12MP decode after 48MP timeout
without refreshing the page. This records successful application recovery on
the current iPhone Safari session. It does not measure physical memory return.
The device picture is now: synthetic 12MP decode/export/download succeeds;
manual cancel/retry succeeds; synthetic 48MP misses the 60-second deadline;
a fresh 12MP decode after that timeout succeeds. Pixel direction/color and
process memory remain separate pending checks.

## Phone synthetic HEIC rotation results

Three user-pasted decode-only results, ordered as requested, were checked
against the earlier unrotated phone samples in TL/TR/BR/BL order:

| HEIC irot | decodeMs / elapsedMs | Output dimensions | Pixel result |
| --- | --- | --- | --- |
| 90° CCW | 13568 | 3024×4032 | All four samples exact |
| 180° | 14343 | 4032×3024 | All four samples exact |
| 270° CCW | 13891 | 3024×4032 | All four samples exact |

For each corner, result sample equals baseline[(corner + quarterTurns) % 4],
with zero channel difference, not merely tolerance-based similarity. All
results have one primary image, 12,192,768 pixels and 48,771,072 RGBA bytes.
This is real-device user-supplied synthetic irot pixel evidence. It does not
confirm a visual preview, camera original/EXIF/mirrored orientation, HDR/color
fidelity, alpha or peak memory. Remaining camera/device/resource checks stay
open and task completion remains 4/40.

## User-deferred camera-original check

The user requested skipping the next local raw camera-original 12MP HEIC test
for now (“这一步要不先略过吧”). It is explicitly deferred, not passed, unsupported,
or a request to remove the acceptance requirement. No original file is needed
from the user at this stage. Current synthetic/device results are consolidated
in [device-matrix.md](device-matrix.md). Instrumented resource measurements
and desktop Safari remain independent unfinished work; task checkboxes stay
unchanged.
