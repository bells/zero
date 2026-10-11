# Zero Paper cache and publication date verification

Date: 2026-10-11. Local macOS implementation and debug verification; no commit, push, archive, release approval, or Windows-device claim.

## Findings and resulting behavior

- Disk originals and versioned JPEG derivatives already existed in `~/.zero/data/wallpaper/`. Preview requests nevertheless decoded the original repeatedly and waited for the refresh batch lock. Frontend replacement/unmount also discarded all reusable preview bytes.
- Native preview now first resolves and validates the index-owned derivative on a blocking worker under the bounded per-image generation lock. It bypasses the refresh lock and original decode when that derivative is usable. Missing/invalid derivatives retain the original rebuild path. Apply/save retain full-resolution validation. Lease paths preserve the state's root spelling after containment checks, including `/tmp` versus `/private/tmp`.
- The plugin-owned WebView cache retains encoded Blobs, with ten entries, two MiB per entry, eight MiB total, least-recently-used eviction and a five-minute TTL checked on access. Same-image requests share one pending read; at most ten distinct reads are pending. URLs belong to each visible React owner and are revoked on replacement/hide/unmount. Native leases are released after bytes are read. No original images, decoded canvases, or filesystem paths are retained in React.
- Recent successful refreshes are shared for five minutes within the same China market day; explicit retry bypasses reuse. Stale/failed refreshes are not reused. Retry also reruns the preview request. Preview failures are tracked separately from refresh/action errors, and pending selection transitions show a loading state.
- Bing is displayed beside the date as the image source. Optional Rust `display_date` / TypeScript `displayDate` preserves the original `startDate` and disk filename. Old schema 1/2 indexes remain readable; absent/invalid publication time falls back to the original date until metadata refresh.
- Live public Bing zh-CN metadata returned `startdate=20261010`, `fullstartdate=202610101600`, `enddate=20261011` for the mill image. The UTC publication timestamp corresponds to 2026-10-11 00:00 in China Standard Time. The display now uses that market date, including year/leap-day rollover handling.

## Automated evidence

- `pnpm test`: 350 passed. New behavioral tests cover shared preview reads, lease release after failure, retry, count/byte/TTL/LRU bounds, refresh sharing, explicit retry and China-midnight rollover.
- `pnpm build`: passed. `node scripts/performance/build-graph.mjs --check --output /tmp/zero-paper-build-graph.json`: passed, with a separate untracked snapshot.
- Final serial `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1`: 340 passed, two ignored by their existing configurations; doctests passed. Paper integration suite: 20 passed, including cache presentation while refresh holds its lock, reuse without original decode, original validation for native actions, legacy cache, corrupt derivative rebuild and publication-date fallback.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `git diff --check`: passed.
- `openspec validate --all --strict`: 23 items passed. Existing icon delta/main-spec archive warning remains; no changes were archived or manual tasks marked complete.

Initial results are preserved separately in `/tmp/zero-paper-rust-full.log` (sandbox pasteboard failure), `/tmp/zero-paper-rust-full-native.log` (Rust documentation dependency mismatch while native build changed shared artifacts), `/tmp/zero-paper-rust-final.log` and `/tmp/zero-paper-process-rerun.log` (existing File process test hit its one-second deadline). The final serial run with other builds stopped passed; no unrelated tests, process deadlines or product behavior were weakened. Final log: `/tmp/zero-paper-rust-final-serial.log`.

## Native macOS evidence and limits

`pnpm tauri dev --config /tmp/zero-paper-dev.json` was attempted inside the sandbox and failed to bind Vite's port. The permitted native rerun started successfully. The temporary config makes a 400-by-500 tray window visible for inspection; it does not modify tracked window defaults.

A packaged local debug `Zero.app` from `pnpm tauri build --debug --bundles app --config /tmp/zero-paper-dev.json` was opened using native UI automation. The public mill preview was visible, Bing appeared beside `2026-10-11`, ten alternating older/newer selections retained an enabled preview action with no reported errors, and three Awake/Paper remount cycles retained a visible preview and correct date without another refreshing indicator.

These are actual macOS debug interaction observations. They do not establish a quantified latency improvement, p50/p95 target, RSS recovery, signed release packaging, Windows behavior, or the outstanding broader performance/device tasks. Offline legacy indexes cannot infer a missing publication timestamp; the corrected display date becomes available after metadata refresh.

## Local commit verification

On the maintainer's explicit local-commit request, the final source was revalidated: 350 frontend tests and the production build/bundle check passed; Rust format/check and the complete permitted serial suite passed with 340 tests and two existing ignored tests; strict OpenSpec validation passed all 23 items; diff whitespace checks passed. Logs are `/tmp/zero-paper-commit-{frontend,build,cargo-check,rust,openspec}.log`, with a separate build snapshot at `/tmp/zero-paper-commit-build-graph.json`. Commit scope is the Paper implementation, its tests, and these spec/evidence updates; no generated assets are included.
