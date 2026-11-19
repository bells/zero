# Zero plugin SDK (local development)

This package owns the public TypeScript protocol, diagnostics inputs, capability comparison and session-bound Bridge. It builds from this directory with its declared dependencies; it imports no private host implementation or Tauri API. React integration is available at `@zero/sdk/react`.

Run `node scripts/build-plugin-sdk.mjs --output /tmp/zero-plugin-sdk` from the repository to produce a local package using only SDK source and declared installed dependencies. From an independent checkout of this directory, install the declared dependencies and run `npm run build`.

`compareCapabilities(required, providers)` compares the explicit catalog supplied by the host. It never invents, discovers or enables providers. `requiredCapabilities` and `background` declarations do not enable native methods, background execution or the public runtime. Native release gates and permission checks still apply.

Host-only registry snapshots remain in the host contracts. They are not available to installed plugins through the Bridge. The SDK has not been published; this package is a local build artifact, not a public compatibility or release claim.

## Power lease provider (development)

On macOS and Windows the compiled catalog includes `power.lease` version `1.1.0`; calls require the explicit `power.preventSleep` grant. Public runtime release gates still apply. There is no native power provider on Linux.

| Bridge method | Input | Result value |
| --- | --- | --- |
| `power.acquire` | `{ durationMinutes: number | null }`, integer 1–10080 or unlimited `null` | `{ leaseId, generation, expiresAtMs }` |
| `power.status` | `{}` | `{ leases: PowerLeaseInfo[] }` for this installed package |
| `power.release` | `{ leaseId, generation }` | `null` |

The host allows four concurrent leases per package and sixteen globally. Native resources outlive the view and JavaScript request; a newly authorized view of the same installed package can inspect and release them. Expiry, request cancellation during acquisition, disable, uninstall, update and host shutdown release owned resources. A different plugin or package digest cannot inspect or release them. Lease state is in memory and is not restored after application restart. Backend startup failure, resource limits and stale/denied sessions produce typed errors; no raw invoke fallback exists.

Version 1.1 retains those lease methods and adds a single guarded task per installed package identity:

| Bridge method | Input | Result value |
| --- | --- | --- |
| `power.startTask` | `{ expectedGeneration: number \| null, expectedConditionsRevision: number \| null, schedule, conditions }` | `PowerTaskStatus` |
| `power.taskStatus` | `{}` | `PowerTaskStatus \| null` |
| `power.stopTask` | `{ generation }` | `null` |
| `power.updateTaskConditions` | `{ generation, expectedConditionsRevision, conditions }` | `PowerTaskStatus` |
| `power.readSnapshot` | `{}` | `PowerSnapshot` |

Schedules are `{kind:"unlimited"}`, `{kind:"duration",minutes:1..1440}` or `{kind:"until",expiresAtMs}`. Absolute deadlines must be future safe-integer milliseconds within 48 hours. Calendar and DST resolution belong to the tool. Durations use suspend-inclusive elapsed time; absolute deadlines use wall time. Conditions contain required nullable `batteryThresholdPercent` (10–90 in steps of 5), `stopOnLowPowerMode` and `allowLowBatteryStart`. Guards apply only while on battery; a start-time low-battery override cannot bypass low-power-mode protection. Unknown readings are reported through `protectionUnavailable` and retried; they are never fabricated as supported readings.

`expectedGeneration:null` requires no active task. A numeric generation replaces exactly that active task, acquiring and checking the candidate before releasing the prior native resource. Failed validation, native acquisition or battery admission leaves the previous task intact. Guarded tasks and old leases share the same four-per-package/sixteen-global native-worker limits, including abandoned timed-out startups. Task status reports schedule, conditions, native timing, guard availability/override and the most recent stop reason. Conditions updates enforce new protections before returning. UI closure retains task ownership; disable, update, uninstall and shutdown revoke it. Neither task nor lease execution resumes after host restart. This is development support under the disabled public runtime gate, not a released Awake package ecosystem.

### Storage comparison and policy revisions (development)

`storage.plugin@1.1.0` retains the 1.0 get/set methods and adds `storage.compareAndSet({key,expectedValue,value})` → `{swapped,currentValue}`. Comparison, staging and live-session commit share the existing per-plugin storage operation gate. A mismatch returns the actual value without changing it; cancelled/revoked requests cannot commit the stage. No config key or tool policy is hardcoded in this provider.

Guarded task status now includes `conditionsRevision`. Start requires an explicit nullable `expectedConditionsRevision` paired with `expectedGeneration`; condition updates require the task generation and the current conditions revision. A successful update increments the revision. Stale condition updates or task replacements return `power.taskConflict` without modifying the task. Awake reads task revision before fresh config, merges only changed config fields through CAS, and retries at most three conflicts/applications per reconciliation. Saved settings awaiting effective native protection are visible as pending; active-view polling and a user retry reconcile them. With every view closed, no JavaScript config-reconciliation scheduler is claimed; already-applied native guards continue autonomously.

## Bounded background events (development runtime)

`background.events@1.0.0` is compiled on macOS and Windows. Request the explicit public `background.schedule` grant and declare `background: {main, events}` in the package manifest. This catalog entry does not enable the disabled public runtime or establish Windows device acceptance.

From a ready view, use `context.bridge.schedule.upsert({taskId,eventId,nextAtMs,payload})` or `.cancel({taskId})`. Deadlines are absolute nonnegative JavaScript-safe epoch milliseconds; the package owns calendars and retry policy. Upsert returns `{generation}`, cancel returns `{cancelled}`. Task ownership always comes from the native session.

The host imports the declared background module in a hidden isolated view. That module calls `registerBackground(async (event, context) => ({outcome:'completed',nextAtMs:null}))`. `event` is the exact native-issued `{taskId,eventId,occurrenceId,attempt,payload,scheduleGeneration}` context. Use the ordinary approved bridge for storage/network/provider work. Return `retry` with an absolute `nextAtMs` to retain occurrence identity and advance its bounded attempt, `completed` with an optional next absolute deadline for a new occurrence, or `failed` with `nextAtMs:null`. Thrown handler failures report failure; they do not claim completion. The explicit bridge method `background.complete` returns `{generation:number|null}` and is available only in native background sessions.

The native lifetime is at most 60 seconds using suspend-inclusive time; there are at most four workers globally and one per installed owner. Background sessions cannot show UI messages, open windows or request new grants. Ready must occur within five seconds. Completion persists its receipt/next schedule before teardown. Failed/interrupted effects do not replay automatically. Normal view closure retains scheduled work; disable/update/uninstall revoke it. Normal host exit interrupts active work while preserving future schedules for fresh owner/grant validation on restart. Empty hosts start no tool loop or worker. Scheduling uses at most 16 tasks per owner/256 total and payloads of at most 16 KiB/32 container levels.

For an isolated source smoke, build `examples/plugin-background` with `scripts/plugin-packages/build.mjs`; `src-tauri/examples/plugin_background_smoke.rs` uses only its own temporary registry/data and checks view closure, hidden storage work, completion cleanup and disable revocation. It performs no wallpaper or other desktop effects.

## Installed applications (macOS development runtime)

Declare `system.apps@^1.0.0` in `requiredCapabilities`. These methods are available in a ready view.

| Bridge method | Input | Result value |
| --- | --- | --- |
| `apps.scan` | `{}` | `{catalogId, itemCount}` |
| `apps.page` | `{catalogId, offset}` | `{items, nextOffset}`, where an item has `id`, `title`, `wordInitials`, `pinyin` and `pinyinInitials` |
| `apps.activate` | `{catalogId, itemId}` | `"focused"` or `"launched"` |

Scan and page require `system.apps.read`. Activation also requires `system.apps.execute` and `system.window.focus`. Start at offset zero, then follow `nextOffset` until it is null. A scan may return up to 4,096 items and each page up to 128. A new scan replaces the previous catalog for that view. Catalog IDs expire after ten minutes, on close or on revoke. Requests use the existing ten-second deadline. Search ranking and usage storage belong to the package.

The item identifier is an index lookup. The host validates the view, live grants, current catalog and native bundle identity before requesting activation. If activation times out, check the desktop before retrying.

## System capture (Windows capability)

Declare `screen.system-capture@^1.0.0` and request `screen.capture`. From a ready view, call `screen.openSystemCapture` with `{}`. A successful response is `null` after Windows accepts the request. Windows controls screenshot interaction and output. This method supplies no image, path or clipboard data. Windows device conformance is pending.
