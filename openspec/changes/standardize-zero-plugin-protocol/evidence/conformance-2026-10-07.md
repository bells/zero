# Protocol v1 continuation evidence — 2026-10-07

This is a partial conformance record for the current working tree on macOS. Host remains 0.1.0; public Web runtime remains closed. API freeze, SDK publication and proposed Host 0.2.x support are not approved by these results.

## Implemented and checked

- Restore now acquires the same per-plugin operation gates as install/enable/disable/uninstall. Batch gates are sorted and deduplicated to avoid deadlock. Registry mutation, native adapter effects and revision notification run within those gates; unrelated plugins can proceed. Only bundled records receive restore adapters, so unchanged external packages (including an installed signed File engine) do not receive a spurious lifecycle reset. Adapter failures do not suppress other restored adapters or notification of the committed state.
- Failed restore persistence restores the previous in-memory records without advancing revision. Tests force atomic replacement failure and verify the saved bytes, records and staging cleanup.
- Startup restores the committed revision, and migration advances from it instead of zero. Tests cover unchanged restart, the next commit and a schema migration from revision 42 to 43. Native two-window convergence remains pending.
- Provider side effects use the session commit gate. Actual file tests verify that a prepared storage write cannot replace old data after cancellation, revocation, replacement generation or deadline; its private staging file is removed. SDK tests cover pre-abort, request/lifetime abort, timeout cancellation and ignored late replies. The earlier cancel-before-dispatch tombstone test also passes.
- Protocol, MVP, developer and publishing docs distinguish legacy/internal contracts, implemented debug providers, bundled native adapters and the unavailable public profile. Canonical IDs and independent versions remain intact; signed File payload and approval code are unchanged by this continuation.

## Automated verification

Raw logs are local ignored artifacts under `build/plugin-verification/`.

| Check | Result | Log/artifact |
| --- | --- | --- |
| `pnpm test` | 313 passed; fixture preparation ran once | `frontend-20261007.log` |
| `pnpm build` | Passed; existing lazy PDF chunk size warning remains | `build-20261007.log` |
| Lifecycle focused tests | 3 passed, including overlapping restore/disable and reverse batch ordering | `lifecycle-20261007.log` |
| Registry focused tests | 18 passed | `registry-20261007.log` |
| `cargo fmt --check`, `cargo check --locked`, `git diff --check` | Passed | Command results for this continuation |
| First sandbox `cargo test --locked` | Library: 190 passed, 1 failed; private native pasteboard unavailable; Cargo stopped before integration suites | `rust-first-20261007.log` |
| Approved sandbox-external `cargo test --locked -- --test-threads=1` | Full run: 296 passed, 0 failed, 1 ignored | `rust-serial-20261007.log` |
| Build graph budget | Passed; no forbidden eager imports; initial JS 269,672 bytes / gzip 82,985; largest lazy chunk 795,338 bytes | `/tmp/zero-build-graph.json`; historical evidence not overwritten |
| `openspec validate --all --strict` | 20 passed, 0 failed; pre-existing icon-spec archive dependency notice remains | `openspec-20261007.log` |

## Native development verification

Rebuilt notes with `node scripts/package-plugin-notes.mjs --development`. Its package digest is:

`ab04c5924955527bce2e1cd787c0c529fb6dcd3fa3b1b9c4946ec759dd62f6ba`

Ran `ZERO_PLUGIN_WEB_DEV=1 cargo run --manifest-path src-tauri/Cargo.toml --locked --example plugin_web_smoke -- build/plugin-notes-development.zplugin` outside the sandbox. The example uses its own temporary registry and storage. It does not install the test package into the user's registry.

`native-notes-20261007.log` records storage commit, disable/re-enable generation revocation, restored data, default-uninstall data preservation and `ZERO_WEB_SMOKE result=Ok(())`. This is a development probe, not packaged distribution or UI approval evidence.

`pnpm tauri dev` initially failed because the sandbox denied the local Vite port (`listen EPERM ::1:1420`). The approved external retry started Vite and `target/debug/zero`; logs are `tauri-dev-20261007.log` and `tauri-dev-native-20261007.log`. Desktop automation inventory timed out once, then `getApp("Zero")` returned `Invalid app: Zero`; the subsequent app inventory did not include the unbundled process. The dev session was stopped after checking this limitation. No full UI or two-window pass is claimed.

Follow-up: this automation limitation was subsequently bypassed on the same local Mac. A Tauri debug `.app` with a test-only configuration that also shows the main window was successfully selected by its absolute bundle path. Real UI navigation, tool panels, native Launch query and the public-runtime refusal were verified. See [macOS UI evidence](macos-ui-2026-10-07.md). The earlier failed discovery describes that attempt, not an inability to validate macOS locally.

## Remaining boundaries

Windows/WebView2 and packaged runtime evidence, full shell/message/approval/multi-window flows, hung-WebView recovery repetition and process-tree performance remain pending. Network provider, command activation, short-lock registry persistence, recoverable update transactions, explicit data removal and Paper native cancellation still require implementation/acceptance. Existing bundled tool device gates remain separate.

Task progress is 14/36. Only 1.1, 2.5, 3.1, 5.4, 6.1 and 6.2 were checked in this continuation. No old-change manual checkbox, File engine policy, Host version, commit, publication or archive was changed.
