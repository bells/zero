# Provider / queue integration review

Reviewed 2026-11-04 against this change's design, provider-selection spec and tasks 5.1–5.4. This review covers source and automated tests; the maintainer has reserved native/manual acceptance.

## Finding fixed

**Important: the native authoritative queue feed was not connected to the File service and hook.** Rust already exposed `get_file_conversion_queue_snapshot` and emitted `zero://file-conversion/queue-updated` after enqueue, start, cancel, remove, retry and clear. The frontend still hydrated with an unversioned job list and subscribed only to job updates. Enqueue/remove/clear in one surface therefore did not reliably update the other surface; delayed job events or initial lists could restore removed rows.

- Added the typed queue-snapshot command and event bridge to `fileServiceCore.ts` and `fileService.ts`.
- `useFileConversion` registers capability, job and queue listeners before initial reads; all listeners are disposed, including registrations resolving after unmount.
- Hydration now uses the authoritative queue snapshot, retaining its revision together with rows. Older full snapshots are rejected. Job events and action responses cannot recreate an absent row at or before the accepted snapshot revision; newer events survive older initial snapshots.
- Enqueue/start/cancel/retry responses use the same revision-aware merge as events. The existing native event payload and command registration remain unchanged.
- Updated the existing source-contract check for the new hydration/listener cleanup. Behavioral model tests separately exercise ordering and removal, rather than treating source matching as runtime evidence.

## Native review conclusions

No additional concrete critical/important provider integration defect was found in the reviewed source:

- `preferences.rs` validates known direction/platform provider IDs, bounds reads to 4096 bytes, normalizes unknown/cross-platform choices to built-in with a disclosure, and persists only schema/revision/provider selections. Atomic replacement precedes the in-memory revision update; existing tests cover restart and failed writes.
- `capabilities.rs` exposes supported per-platform choices and computes availability from the preferred provider, including known unavailable choices; it does not pick an installed alternative automatically.
- `runtime.rs` freezes selected IDs before dispatch, rechecks capability generation while holding its guard, and serializes preferences across batch binding. Probing/input disk work occurs outside the queue lock. `queue.rs` keeps batch-bound jobs distinct from newly enqueued pending jobs.
- Worker dispatch calls `select_id` for the bound provider. That path re-probes the same ID and returns structured unavailability without fallback.
- Ordinary retry retains the prior ID; explicit retry validates the requested direction/provider availability. Input is inspected again before mutation, the original job revision is checked afterward, and invalid/password/unsupported input cannot become retryable by choosing another provider.
- Settings, explicit retry, configuration navigation and authoritative queue read check main/tray callers. The File engine remains outside the default capability window list.

## Verification performed in this review

1. Added service/model regressions first. Isolated initial run: **11 passed, 2 failed**, specifically missing `getQueueSnapshot` and queue-state reconciliation APIs. This establishes the missing integration before the fix.
2. Compiled the focused TypeScript modules with the existing compiler into `/private/tmp/zero-provider-review-tests`, using the same module/target settings as fixture preparation. Copied the two test files with only their temporary import root changed; no shared fixture directory was prepared or replaced.
3. Focused model/service run after implementation: **14 passed, 0 failed**. Coverage includes the native snapshot command/event envelope and listener disposal, stale job revisions, stale capability preferences, removal tombstones, newer job events surviving an older initial snapshot, and all six delivery orders of initial hydration/completion/cross-window clear.
4. `pnpm exec tsc --noEmit`: **passed**.
5. `node --test tests/integration/sourceContracts/fileEnginePackaging.test.mjs`: **11 passed, 1 failed**. The queue listener/lifetime source contract passed. The failure was the separate existing DOCX CSS assertion in `DOCX render readiness waits for images and fonts before measuring isolated export pages`: it expected `/body\.zero-file-engine-export/`, whereas the current engine CSS uses `body.zero-file-engine-layout`. Reported to the root implementer, who owns engine/CSS changes; this review did not alter that assertion or CSS.
6. `git diff --check`: **passed** at this review point.

The root implementer owns the serialized full `pnpm test`, build, Cargo and strict OpenSpec gates and will report their fresh results separately. This review did not run concurrent shared fixture preparation, broad builds, signing or release actions.

## Unverified / retained gates

- Real main/tray interaction, keyboard behavior, language switching and native picker/drag/drop remain maintainer-owned manual checks (N01 / task 7.2).
- Windows runtime, actual Word/LibreOffice provider permissions/activation and uninstall-before-dispatch remain device/provider acceptance, separate from the reviewed source and synthetic tests.
- Restart persistence has state/storage unit coverage; a real app restart with two visible surfaces was not performed here.
- Native engine/corpus/PDF quality and signed package approval are outside this provider review. No manual/device task was checked complete by this review.
