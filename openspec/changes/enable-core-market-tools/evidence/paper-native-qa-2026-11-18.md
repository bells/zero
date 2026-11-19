# Paper independent package — 2026-11-18

## Scope and artifact identity

This record distinguishes source checks, a real macOS source harness and maintainer acceptance. It does not establish an ordinary-user signed installer, public runtime, published package, Windows acceptance or completion of all five migrations.

| Artifact | Version | SHA-256 | Status |
| --- | --- | --- | --- |
| `build/core-market/packages/zero.paper-0.1.0.zplugin` | 0.1.0 | `f9e0b38ccc5a4dca11802b6fae36837ef431403ef680a2871d6ca0c93bb88594` | Unsigned, unpublished candidate |
| `build/core-market/qa/example.paper-0.1.0.zplugin` | 0.1.0 | `13972c67e1c88b9ae4f9d9df4f67217f747cd7ce19a18851af172bc9653cc6f8` | Development-only derivative |

Two final independent canonical builds produced identical bytes: 82,770 bytes, six archive entries, including the package-owned background entry. The derivative changes manifest identity, display name and view activation identifiers; every non-manifest archive byte was compared and is identical. Neither artifact carries official publisher approval. Native shared-provider changes require the updated host 0.2.0; reinstalling this archive cannot update an older host. Earlier build reports retain the superseded pre-export-deadline hashes; `paper-qa-final.json` identifies the current artifacts.

## Fresh automated/source evidence

- Root `pnpm test`: final run 779 passed. The first attempt stopped during fixture compilation at the SDK background completion union; explicit failure discrimination fixed it without changing compiler settings. All attempts are preserved.
- Full/standard/core frontend builds passed. Actual core evidence reports no bundled tools, zero concrete plugin modules and 415,584 frontend bytes. Build graph budgets passed for all three actual profile manifests.
- Paper adapter fix regressions: 74 scoped Rust library tests, 30 selected Rust integration tests, one debug-runtime canonical manifest admission test and two isolated SDK tests passed. Independent scoped rereview closed missing provider registration and Windows preview origin findings. Windows source/contract checks are not WebView2 device evidence.
- JPEG completeness correction independently reviewed with 132 valid controls matching the original decoder's pixel hashes and 196 rejected negative controls; narrow vendored patch/source checks accepted. This does not claim universal JPEG conformance.
- Final Rust format/all-targets check and strict OpenSpec validation passed. Full Rust regression did **not** pass: the first run had restricted native-service/loopback failures and an obsolete ownership assertion. After updating the ownership regression, default/core boundary tests passed 5/4 and the permitted market tests passed 8. A permitted library rerun passed 460 tests with two ignored, but the unchanged Vision blank-image recognition test still failed. Two standalone diagnostics did not establish its cause: bilingual recognition timed out, while blank recognition succeeded with zero observations. No test was ignored or weakened to conceal this unresolved gate.
- Native metadata/binary transport classification tests passed 22; scoped review accepted the typed malformed-HTTP parser correction. Export's 120-second interaction deadline passed 50 focused native/session/protocol tests and five SDK tests, with independent review. The native picker is still a manual acceptance gate.

Ignored execution logs and machine-readable build/checksum reports are under `build/core-market/evidence/2026-11-18/`; review records are under `.superpowers/sdd/2026-11-14-core-market-tools/`.

## Real macOS source harness

`src-tauri/examples/paper_package_smoke.rs` installs the development derivative into a new temporary registry and data root, then opens the actual package through the native SDK/WebView runtime. It refuses `wallpaper.apply` and `media.exportImage`, so it cannot change the desktop or open a Save dialog.

The final run exited 0 and observed:

- Real Bing metadata request through `network.fetch`.
- Real native image download, strict decoding/cache and `media.preview`.
- A loaded `<img>` with nonzero natural dimensions, no UI alert and daily automation off.
- Closing and reopening the view with the same successful preview/default-off checks.
- Successful resource revocation at the end.

The restricted first launch could not connect to native macOS services and was terminated. The next run exposed the harness's `/var` system alias in its temporary root; native symlink rejection remained intact. Canonicalizing the harness-created directory fixed that setup issue. The first successful run is `paper-native-smoke-canonical-root.log`; the final run against the current derivative is `paper-native-smoke-final.log`, also exit 0. Failed attempts remain alongside them. No production path check was weakened.

The current core debug `Zero QA.app` was rebuilt at its existing `src-tauri/target/debug/bundle/macos/` path. Its ad-hoc signature passed verification, identifier is `com.watson.zero.native-qa`, version is 0.2.0 and embedded development data root is `/private/tmp/zero-core-native-qa-home`. Executable SHA-256 is `61746cce6e0e11ef571ea9ca1b464b65e30f0fa17af6d3bce16f04b8db67b218`. This is not official publisher signing or notarization. Final isolated Awake and hidden-background source smokes also exited 0 against the updated host code; they do not replace maintainer Paper acceptance.

## Maintainer acceptance and remaining checks

On 2026-11-19 the maintainer confirmed “预览、切换、保存和应用均正常” on the QA app and Paper derivative identified above. This confirms local installation, working preview and history navigation, saving, and applying a wallpaper on macOS. Save cancellation and recovery from an uncertain OS outcome were not reported separately.

On 2026-11-19 the QA host was rebuilt with the media quota retry fix. The executable SHA-256 is `046f05ae140ff4688b78ef19f31fee0926c67089ff7bc1a131db243e04a15039`. Ad-hoc signature verification passed and the Paper archive stayed byte-identical. The maintainer tested this build and confirmed “停用、启用、卸载、重启、重装均正常，应用记录仍在”. This closes the requested local Paper lifecycle, including restart without automatic reinstall and preservation of the last applied wallpaper record.

The expanded native source harness independently verified session revocation, persistent registry reload after removal, reinstall with the same digest, retained package storage and a loaded preview after reinstall. Its first run timed out waiting for the re-enabled preview. A later run showed that a cached preview can become ready while the initial refresh is still running, and closing the view correctly canceled that request. The final probe waited for the live refresh to settle and exited 0. It also uses the recorded test result for its process exit code. See `paper-lifecycle-native-settled.log` and the earlier logs in `build/core-market/evidence/2026-11-19/`. The harness reloads the registry within one process. The maintainer's check provides the full process restart result.

Deliberate opt-in daily execution and Windows remain open. The view-only Save request allows 120 seconds from native admission. Ordinary RPCs allow ten seconds and network work eight seconds. After timeout the picker retains its resource slot until dismissal, and a later selection cannot write. Legacy bundled `paper-state.json` migration remains pending. The public Web runtime remains disabled and production publisher trust remains empty.

On 2026-11-19 both `https://www.usezero.cn/plugins/` and `https://www.usezero.cn/en/plugins/` returned 404. The desktop's configured source is `https://raw.githubusercontent.com/bells/zero/main/market.json`. Direct access reset in this environment. The GitHub Contents API returned the same index from `bells/zero` main with schema 1, no catalog field and zero installable entries.
