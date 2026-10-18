# 2026-10-18 desktop resource and domain-contract follow-up

Current progress: **5/40**, tasks 1.1–1.4 and 3.1 complete. No public image
pages/categories, production queue integration, deployment or commit occurred.
Desktop Safari was attempted using the installed Safari 27.0.1 WebDriver;
it returned `session not created`: Allow remote automation must be enabled in
Safari Settings. The user explicitly chose **Safari 本轮先暂缓**. The task-owned
WebDriver service was stopped; no Safari settings were changed. This is an
application automation prerequisite, not an automatic approval-review rejection.
Camera-original HEIC remains deferred at the user's earlier request.

## Real desktop browser process measurements (partial task 1.5)

[Full raw observations](chrome-process-rss-2026-10-18.json) record eight successful
isolated Chrome scenarios. Each scenario starts a task-owned temporary Chrome
profile and closes it afterwards. macOS `ps` collects only numeric PID/PPID/RSS
columns; only the dedicated root/current descendants are retained in evidence.
Unrelated process arguments, browser profiles and private photos are not read.
All inputs are the synthetic corpus or bounded seeded synthetic ZIP entries.

The metric is the **sum of current process RSS**, not physical footprint, JS
heap or exact allocation. Shared mappings may be counted more than once.
A 100 ms target sampler can miss short peaks; the raw records include actual
sampling times, process counts and stages. A 3 GiB emergency observer ceiling
was not reached. No forced GC is used. Values below are MiB (1024² bytes).
Page baseline includes the dedicated browser's own normal process overhead.

| Scenario | Baseline | Sampled peak | Peak above baseline | After clear / 5 sec |
| --- | ---: | ---: | ---: | ---: |
| decode-12mp | 1117.9 | 1305.1 | 187.2 | 1199.4 |
| decode-48mp | 1119.4 | 1653.0 | 533.6 | 1205.8 |
| cancel-during-48mp | 1121.7 | 1547.7 | 426.0 | 1209.1 |
| timeout-recovery | 1118.5 | 1300.0 | 181.6 | 1194.2 |
| export-12mp | 1121.7 | 1485.1 | 363.4 | 1214.1 |
| export-48mp | 1119.6 | 2312.0 | 1192.4 | 1233.4 |
| archive-16mib | 1118.2 | 1178.1 | 60.0 | 1152.1 |
| archive-64mib | 1117.8 | 1323.9 | 206.1 | 1202.9 |

12MP/48MP decode scenarios each run twice in the same page with a fresh Worker
per run. The 48MP cancellation scenario starts actual decoding after primary
inspection, waits 100 ms, cancels, observes 5 seconds and successfully runs a
fresh 12MP decode. Measured host cancellation round trip was about 26.7 ms;
this includes Playwright/CDP overhead, not a universal interaction latency.
The CPU-loop timeout scenario checks termination/recovery and is explicitly
not a real HEIC timeout measurement. Both export scenarios retain one full-size
JPEG and ZIP, explicitly decode a preview, then clear references/URLs and
observe for 5 seconds. Residual RSS above baseline is observed; it does not
prove either full physical reclamation or a leak. No iPhone process memory
or Safari memory value is inferred.

ZIP scenarios use two 8 MiB or four 16 MiB seeded binary entries with store-mode
fflate. They verify every extracted byte and retain only the resulting Blob
on the page until explicit release. 16 MiB source -> 16,777,450 ZIP bytes;
64 MiB source -> 67,109,310 ZIP bytes. ZIP timings were about 41.0 / 164.6 ms,
with verification separately timed at 102.4 / 414.0 ms. The allocation peak
includes source creation, ZIP copies and verification copies. Those timings
and buffers are not representative camera-image compression and do not select
a production ZIP or mobile batch limit.

The first resource run completed four scenarios, then its network assertion
mistook a same-origin `blob:http://127.0.0.1:4328/...` preview for an external
request. The complete failed run remains under ignored output as
`resources/failed-run-blob-validation.json` (SHA-256: 79266a7a8304d937354fd9f9a8e237752441c417f98a0453729a03580c384ffa).
The assertion now permits only the exact same-origin Blob prefix in addition
to the experiment HTTP base. No remote HTTP destination was allowlisted. The
full eight-scenario rerun passed with zero process-sampler or browser errors.

The experimental archive operation accepts 1–4 entries, 1 byte–16 MiB each,
rejects invalid sizes before allocating, and has no production UI entry.
It is not the product ZIP implementation or task 7.2 completion. Its 2 MiB
browser byte round-trip and over-limit refusal were verified alongside the
full existing codec/HEIC/rotation/cancellation/download experiment.

## Task 3.1 — pure contracts and transition rules

`image-contracts.ts` defines operation/output/watermark settings, explicit
job/revision/item identities, stable error codes, raw ArrayBuffer message
unions, output metadata and the resource-policy shape. No production values
are assigned. Unknown worker responses are narrowed and reconstructed; the
boundary validates exact MIME/format, safe dimensions, ArrayBuffer byte count,
known progress/errors and removes unrelated fields instead of forwarding raw
error details.

`image-batch.ts` is an immutable pure transition model. Import/settings changes
do not start work. Explicit dispatch allows one active identity. Failures can
continue; failed-only retries preserve successful same-revision results.
Cancellation stops active/queued items while preserving successful outputs.
Clear/settings changes invalidate previous revision exports. Late messages
must match job, item and revision, including a new job ID on retry; backwards
progress is ignored. State retains output metadata only, not pixel buffers,
files or Blob URLs. Browser adapters must later terminate revoked jobs and
release result maps; those side effects remain in tasks 3.3–3.6.

Eight behavior tests and an independent TypeScript compilation with
`lib: [ES2023]`, `types: []` and no DOM prove the domain boundary. No TypeScript
`any`, Tauri or DOM imports are added. The pure module is not connected to
production queue/pages. This preserves Migration Plan step 1: resource/device
experiments still gate integration. Limits/settings validation and browser
adapter/resource ownership remain separate later work.

## Verification and remaining gates

Website check: 109 files, zero errors/warnings/hints; tests 41/41, including
eight new transition/boundary cases; no-DOM TypeScript compilation passed.
Production build remains 30 HTML pages / 28 indexed routes, and SEO tests 9/9.
The real Chrome codec experiment and rebuilt independent-module replacement
passed with the bounded archive operation. Existing production browser cases
were not repeated because there is no production UI or routing change.

1.5 remains unchecked: RSS observations cover desktop Chrome, while actual
Safari/iPhone peak memory, exact first/subsequent matched measurements and
broader result-retention cases remain incomplete. 1.6 remains unchecked:
32 MiB / 50 million pixels / 60 seconds / quality 75 are still experimental
parameters. The known malicious underreported-ispe case and iPhone 48MP timeout
remain recorded. Raw camera and desktop Safari deferrals do not remove those
acceptance requirements. No unsupported fallback or guessed production policy
was integrated.

Final follow-up gates: corpus/process/path tests 7/7; refreshed license materials
integrity 1/1 with 337 indexed files; actual local server-bundle checks 1/1.
The server check was initially started while the collector was still rebuilding
its output directory and returned ENOENT for the not-yet-written manifest;
waiting for the collector then rerunning passed without changing server tests.
OpenSpec strict validation and whitespace/script/production-asset audits pass.
[Current browser archive/codec proof](archive-preflight-2026-10-18.json) and
[refreshed source/material inventory](resource-lab-materials-manifest-2026-10-18.json)
retain reproducible snapshots separately from the earlier phone lab records.
