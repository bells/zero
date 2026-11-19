# Paper independent package source

This directory owns Paper's browser-compatible domain, controller, finite background business workflow, React presentation and public SDK factory/entries. It builds an independent unsigned 0.1.0 candidate for host 0.2.0. A real macOS source harness has verified Bing download, native preview and close/reopen with automation off. Maintainer/device acceptance, official signing and publication remain separate gates; see the [dated evidence](../../../../openspec/changes/enable-core-market-tools/evidence/paper-native-qa-2026-11-18.md).

## Ownership

- `policy.ts`, `archive.ts`, `selection.ts`, `automation.ts`: fixed Bing zh-CN/UTC+8 calendar policy, bounded metadata parsing, latest versus deliberate-history selection, strict default-off state and immutable automation decisions.
- `ports.ts`: typed package-local `PaperHostPort`. It contains no raw IPC method strings or file paths; parent integration supplies implementations over the public SDK. Host failures must expose sanitized typed errors and a truthful `retryable` flag. `prepareWallpaper` must create an exclusive per-call workflow claim (factory-generated UUID): distinct concurrent flows cannot share an intent token, so a CAS loser cannot cancel a peer operation. Native claim isolation is a separate parent integration gate.
- `network.ts`: public SDK scoped metadata GET, strict UTF-8/JSON validation and cancellation.
- `host.ts`, `entry.tsx`, `backgroundEntry.ts`: public SDK bindings, package UI activation/disposal and finite background registration. The factory generates a fresh native workflow claim per prepare and preserves sanitized error retryability. Preview URLs are native-issued root-relative paths, retaining the current WebView origin on macOS and Windows.
- `storage.ts`: strict automation state at `paper.preferences.v1`, bounded metadata cache at `paper.archive.v1`, bounded CAS merges. Read failures/corruption preserve original values. A successful `null` read means fresh/default-off, without silently writing defaults.
- `applyWorkflow.ts`: cache image, re-read settings, prepare native token, CAS-persist it as pending **before** OS application, recheck authority, apply and CAS-persist settlement. Failed pending writes prevent application and cancel only the known prepared token. Ambiguous receipts or failed settlement retain uncertainty and prohibit replay.
- `controller.ts`: independent foreground queue, cache-first session selection, cancellable refresh/preview, lease cleanup, explicit export/apply/opt-in/recovery and saved-versus-scheduled status. Closing a view disposes presentation work and unstarted foreground actions; it does not disable saved automation.
- `backgroundWorkflow.ts`: finite `runPaperBackground(host, context)` with no interactive recovery/dialog or permanent timer. It rereads opt-in, respects manual same-day protection and stable-ID dedupe, applies through the durable workflow and returns `{outcome,nextAtMs}`. Retry uses SDK attempt minus one and the package UTC+8 policy; normal completion returns next market midnight.
- `PaperView.tsx`, `usePaper.ts`, `mount.tsx`, `i18n.ts`, `style.css`: own bilingual photo-first main/tray UI and `mountPaper(node,host,{locale,surface}) -> {dispose()}`. Visible views use focus/visibility status refresh and one market-midnight timeout; they do not poll the network.

The daily task/event are `paper-daily` / `paper.daily`. Only successful explicit opt-in creates a schedule. The payload is `{explicitEnableAtMs:number|null}`; parent background entry maps its finite numeric timestamp to `context.explicitEnableAtMs`. The historical-latest exception is valid only during the initial 60-second immediate-enable window, matching the finite background deadline; carrying a stale payload into later daily occurrences does not renew consent. `context.attempt` must be a positive integer; `context.now` is an optional synthetic-test clock.

The pure domain's false→true transition can move pending to a recovery marker. The controller deliberately blocks enabling while either marker remains: only an explicit interactive recovery acknowledgement can clear matching captured markers. Background never invokes recovery, and native receipt/token ownership remains authoritative. `recoverWallpaper():Promise<void>` must resolve only after native recovery acknowledgement; it must reject an ambiguous result.

## Limits and compatibility

Archive parsing accepts at most 1 MiB/1,024 candidates and returns at most ten unique items. Network metadata has a separate 512 KiB limit. Cache schema 1 retains at most ten strict metadata items with bounded strings and Bing-only URLs. Image bytes/previews/export/native application belong to host providers; React never consumes raw host paths.

`readAutomationState` validates this package's schema. It does not migrate the bundled native `paper-state.json`, wallpaper slots or old file cache. Existing settings/native data remain untouched. A future migration must preserve native safety state and stable IDs explicitly.

Own locked dependencies match Awake: React/React DOM 19.2.5, React types 19.2.14/19.2.3 and TypeScript 5.8.3. No private Tauri/host/peer imports or TypeScript `any` are used.

## Isolated verification

```sh
pnpm --dir src/plugins/bingWallpaper/package install --frozen-lockfile --ignore-scripts
pnpm --dir src/plugins/bingWallpaper/package check
node --test tests/integration/extensionHost/paperIndependentDomain.test.mjs tests/integration/extensionHost/paperIndependentNetwork.test.mjs tests/integration/extensionHost/paperIndependentController.test.mjs tests/integration/extensionHost/paperIndependentView.test.mjs
```

Tests compile package sources into fresh temporary directories and use synthetic in-memory ports/metadata. No root fixture preparation, user data, live Bing requests, download dialog or OS wallpaper operation is involved. Scoped automated and controlled React browser evidence is recorded in the task report; full runtime/package and real-device gates remain open.
