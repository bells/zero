# Awake 0.1.0 development package

This is the independently built Awake candidate for Zero host >=0.2.0 <0.3.0 and `power.lease` >=1.1.0 and `storage.plugin` >=1.1.0. It imports only its owned source, the public SDK, and locked React dependencies. The bundled Awake remains available for comparison. Its calendar/DST resolver and bilingual messages derive from the existing Awake source; no host implementation is imported.

Build from the repository with explicit source roots:

```sh
node scripts/plugin-packages/build.mjs build src/plugins/caffeine/package src/sdk /tmp/zero-awake
node scripts/plugin-packages/build.mjs check /tmp/zero-awake/zero.awake-0.1.0.zplugin
node node_modules/typescript/bin/tsc -p src/plugins/caffeine/package/tsconfig.json
node --test tests/integration/extensionHost/awakeIndependentPackage.test.mjs
```

A clean independent source checkout must install the exact dependencies in this directory's `pnpm-lock.yaml` and receive the public SDK source separately. No other desktop source or host `node_modules` is an archive dependency. The package builder checks the full resolved source graph, including type-only imports and assets, before producing the archive.

Manual unlimited, 1–1440 minute duration and local-time-until plans use native task ownership. Closing a view does not stop the task. Reopening reads the live task; disable/update/uninstall/host exit releases it. Duration uses the host's suspend-inclusive elapsed clock; local-time plans resolve DST in this package and pass an absolute deadline. No task resumes after restarting the host and no future-start scheduler is declared.

Configuration retains `awake.preferences.v1`, version 1 and the existing `custom_input` / `battery_policy` shape. `storage.plugin` determines its host-owned root (`~/.zero/data/plugins/zero.awake` for the official ID). Battery conditions are enforced natively while running; a manual low-battery override applies only to the current task and never bypasses low-power-mode protection. Unknown readings are visible and retried.

The archive is an unsigned local candidate. The public Web Plugin runtime remains disabled. The manifest's macOS/Windows platform list matches implemented provider source, not completed platform acceptance. A macOS debug native harness verifies rendered startup, a five-minute native task, and UI close/reopen. In the isolated Zero QA host, the maintainer confirmed the distinct `example.awake` derivative installs, starts/counts down, survives UI close/reopen, disables/re-enables, stays absent after uninstall/restart, reinstalls and retains a saved twelve-minute custom plan. Physical sleep/battery, Windows devices and official release/signature acceptance remain pending. There is no public market upload or release approval.

Configuration-dependent actions require a successful validated storage read. A transient config/power error retries complete initialization through visible polling and the retry control. Views read the current config before starting, merge only changed fields through atomic storage comparison, and fence native policy updates with task/conditions revisions. Saved but unapplied guards show an explicit pending warning and last confirmed protection. Each reconciliation has at most three attempts, then retries through the active view's next poll or explicit retry. Stop remains available when native status is ready but config is unavailable. A closed view does not execute JavaScript reconciliation; the existing native task continues enforcing its last accepted conditions.

## Native development smoke

On macOS, after preparing the distinct `example.awake` QA derivative, run:

```sh
ZERO_PLUGIN_WEB_DEV=1 cargo run --manifest-path src-tauri/Cargo.toml --locked --no-default-features --example awake_package_smoke -- build/core-market/qa/example.awake-0.1.0.zplugin
```

The harness installs into new temporary registry/storage, checks actual rendered controls and native initialization requests, starts a five-minute task through the UI, verifies it survives closing/reopening the plugin view, and revokes resources before exit. It does not modify the maintainer's installed QA package. This is debug source acceptance, not signed release, physical sleep/battery, or Windows acceptance.
