# Awake independent-package QA — 2026-11-16

## Observed native feedback

The maintainer confirmed that the isolated Zero QA app opens and that the local development package installs. Their screenshot then showed “此工具没有提供工作区界面，可以在偏好设置中查看状态。” The package's declared main/tray views were present in its installed registry metadata. Installation alone did not establish tool usability.

Root cause: navigation reconstruction dropped `viewId`; main/tray contribution order was also being treated as the main-view selection. The shell now preserves both surface routes through navigation/localization/preferences and prioritizes installed Web views over static bundled presentation. A regression with tray declared before main failed with `undefined` before the fix and passes afterward. The updated QA app was rebuilt and ad-hoc signature verification passed. The maintainer has been asked to quit/reopen the same app; installation records are retained.

The maintainer's subsequent screenshots confirmed the workspace entry appears and opens the real Awake window. That window then displayed a generic operation failure with disabled controls. After the concurrency fix below and the updated host, the maintainer confirmed “可以开始，倒计时正常” in response to the five-minute-start retest. They next confirmed “三步均正常” for closing/reopening with countdown continuing, disabling/re-enabling and using again, and uninstalling then completely restarting QA without the plugin returning. Finally, they confirmed “重装可用，12分钟设置保留” after reinstalling, saving/starting/stopping a custom twelve-minute plan, uninstalling, completely restarting QA, reinstalling the same archive, and checking the saved custom plan. This closes the local development-QA installation/use/lifecycle/configuration loop only.

| Maintainer's QA operation | Current result |
| --- | --- |
| Local install and opening Awake | Confirmed |
| Start five-minute task and countdown | Confirmed |
| Close/reopen tool UI while task continues | Confirmed |
| Disable closes UI; re-enable allows use | Confirmed |
| Uninstall; full QA restart does not reinstall | Confirmed |
| Reinstall and use again | Confirmed |
| Persist an explicit nondefault setting through uninstall/reinstall | Confirmed: custom 12-minute plan |

The retained custom twelve-minute plan is an explicit nondefault marker, rather than unchanged defaults. This acceptance applies to the development derivative and isolated macOS QA host, not the unsigned official-ID candidate, a public core installer, public runtime, physical sleep/battery behavior, or Windows. The broader release and five-tool tasks remain open.

## Follow-up: concurrent initialization failure

The same unchanged development package was installed into a fresh isolated native test host. `awake-native-probe-red.log` reproduced `power.taskStatus → plugin.unavailable` intermittently while the concurrently issued `power.readSnapshot` and subsequent `storage.get` succeeded. The registry bridge used `try_lock`; ordinary concurrent requests therefore failed authority lookup simply because another request held the registry mutex.

Added `PluginRegistryState::read_registry` for blocking-worker bridge paths only. The four power/storage/message/diagnostics admission paths now queue on the registry mutex before obtaining the session guard and performing their existing fresh permission, generation, cancellation and deadline checks. Nonblocking diagnostic observers retain `try_read_registry` to avoid reentrant diagnostic lock waits. SDK, archive bytes, approved permissions and runtime release gates are unchanged.

- Channel-based contention regression fails under `try_lock` (`registry-contention-red-default.log`), passes with queued reads; the complete registry suite passed 21/21 (`registry-contention-green.log`). The first attempted scoped command lacked the target's required feature flags; that invocation error is preserved separately.
- Raw native initialization probe passed with all requests successful (`awake-native-probe-green.log`). The first diagnostic harness logged `initialization=false` but did not correctly propagate the app's exit status; explicit result propagation was then added. A preliminary lifecycle run exited when its only window was destroyed and proves only initial rendering and task startup. These intermediate logs are not treated as a complete lifecycle pass.
- Completed native source harness: `ZERO_PLUGIN_WEB_DEV=1 cargo run --manifest-path src-tauri/Cargo.toml --locked --no-default-features --example awake_package_smoke -- build/core-market/qa/example.awake-0.1.0.zplugin`, exit 0 (`awake-native-lifecycle-complete.log`). It kept a hidden host shell alive, verified actual rendered controls were enabled with no alert, selected 5m and clicked Start through the real UI, observed an active native five-minute task, destroyed/reopened the plugin window, confirmed the task survived and the reopened UI became ready, then revoked the plugin's native resources. It used fresh temporary registry/storage, not the maintainer's QA installation.
- Independent scoped review approved the lock fix with no actionable P1/P2 issues (`.superpowers/sdd/2026-11-14-core-market-tools/awake-contention-review.md`). This source harness is macOS debug development evidence, not signed installer, public runtime, physical sleep/battery, Windows, or maintainer acceptance.

The fix is in the host; the existing Awake QA package does not require reinstalling. Updated core QA host rebuild passed (`qa-app-contention-rebuild.log`), and `codesign --verify --deep --strict` passed on the resulting app. Fresh complete serial Rust suite passed: 520 tests, 0 failures, 3 ignored across 26 targets/doc-test results (`awake-contention-rust-full.log`). The maintainer subsequently confirmed that the existing installation starts successfully and its countdown is normal; the remaining lifecycle checks above stay open. This feedback does not establish physical sleep prevention or battery-protection hardware behavior.

## Isolated artifacts

- App: `src-tauri/target/debug/bundle/macos/Zero QA.app`, QA identifier `com.watson.zero.native-qa`, host 0.2.0.
- QA environment: `ZERO_DEV_HOME=/private/tmp/zero-core-native-qa-home`, `ZERO_PLUGIN_WEB_DEV=1`; normal/release identity and data defaults are unchanged.
- Installed development derivative: `build/core-market/qa/example.awake-0.1.0.zplugin`, SHA-256 `2dfe7b7f8694fdbb466c06d28cd7054a9f13818dffcc47eeb35f71bde938dead`.
- Official-ID candidate: `build/core-market/packages/zero.awake-0.1.0.zplugin`, SHA-256 `465a956c2ffb1eb3a7d819842434ce4182682dad78919cc4b56eab9ea6e2a4ac`; unsigned and unpublished.

The derivative uses the same UI assets with a distinct development identity. Its installation is not evidence of an official signed package or public runtime acceptance. Public runtime remains disabled and production publisher trust remains empty. Automated native attachment timed out; this is an automation limitation, not proof that the app cannot open.

## Source checks and review

Durable logs are under `build/core-market/evidence/2026-11-16/` (generated, untracked).

- Latest frontend suite: 696 passed, 0 failed (`frontend-tests-final.log`).
- Full, standard and core frontend builds passed. Core reports `tools: []` and no plugin modules (`build-core.log`).
- Full build-graph CLI budget check passed. The CLI reads `dist/`; core/standard were separately measured from their actual profile manifests with its exported analyzer/budget functions. Both passed: core entry 219,300 bytes / 68,522 gzip; standard 271,191 / 83,734 (`build-graph-{core,standard}.json`). No profile-specific source-graph claim is made.
- Cargo all-targets check and formatting passed; strict OpenSpec validation: 47 passed, 0 failed.
- Independent signing/routing review found no actionable P1/P2 findings; isolated signing tests 14/14 and route model 6/6. See `.superpowers/sdd/2026-11-14-core-market-tools/signing-routing-review.md`.
- Initial Rust runs preserved native pasteboard/Vision failures; targeted runs passed. A later serial run found an existing one-second process-runner timeout, also reproduced once in isolation. The following no-fail-fast run passed all 369 library tests (2 ignored), but found two old-host package fixtures. Background/package fixtures now use `CARGO_PKG_VERSION` while retaining their original archive and canonical/legacy-key assertions; targeted background 1/1 and package 17/17 passed. An intermediate package fixture edit produced malformed JSON and was corrected; its failed log is retained. Final complete suite status is recorded separately after completion.

Final complete Rust command: `cargo test --manifest-path src-tauri/Cargo.toml --locked --no-fail-fast -- --test-threads=1`, exit 0 (`rust-final.log`). Library: 369 passed, 2 ignored; all integration targets and doc-tests passed. Earlier failures remain preserved rather than being presented as a clean first run. Final formatting and whitespace checks passed. Independent follow-up review accepted the three fixture updates without finding weakened assertions.

No real publisher keys were provisioned, no production trust was added, and no commit, upload or release was performed. Paper, Launch, Snap and File independent-package migration, standard same-package seeds, public/native conformance and release gates remain open.
