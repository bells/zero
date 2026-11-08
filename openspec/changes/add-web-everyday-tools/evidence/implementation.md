# Everyday tools implementation

## Baseline — 2026-11-08

- Branch `codex/add-web-everyday-tools`, existing untracked proposal preserved. Work stays in the supplied checkout so the maintainer can review the integrated result.
- Source catalog has nine tools. `categories.ts`, `Page.astro`, `page.ts`, `job-runner.ts` and generic `Result` are the integration points. Existing image input inspection is reusable for static QR images, with explicit HEIC/HEIF rejection.
- Active website changes referenced by this design retain their dated evidence. This implementation extends their current source without archiving them.
- Domain rules remain in `lib/web-tools`, adapters/Workers in `scripts/web-tools`, static bilingual guidance in `content`, workspaces in `components/webTools`. New content does not enter site storage, URLs, logs or feedback.
- Shared interfaces checked before implementation. All new jobs return typed `Result`, use independent request/result contracts and reuse `JobRunner`. SQL/Cron dependency work is delegated under the subagent-driven-development skill. Catalog registration follows working domain/UI integration.

## Verification ledger

Pending. Device checks stay separate from automated evidence.

## Dependency evaluation

Registry metadata was verified on 2026-11-08 through the configured local proxy. Exact installed production candidates are qrcode 1.5.4 (MIT, registry modified 2025-11-13), qr-scanner 1.4.2 (MIT, 2022-11-23), hash-wasm 4.13.0 (MIT plus embedded permissive C notices, 2026-11-07), sql-formatter 15.9.0 (MIT, 2026-09-23) and croner 11.0.0 (MIT, 2026-11-04). cron-parser 5.10.4 was evaluated as a candidate. Its differing DST/calendar behavior was assessed in the SQL/Cron dependency report.

QR Scanner has an older stable release. Its small static decoder was selected after actual content-based rejection, independent QR encoder/decoder round trips and Worker/base-path tests. Camera/browser-scanner APIs are never instantiated. The worker source map embeds twelve jsqr-es6 source files. All twelve exactly match jsqr-es6 1.4.0-1's published source map. That fork is Apache-2.0, so its complete license and source-match hashes are retained separately, alongside qr-scanner's MIT notice. The four hash C algorithm headers are also preserved. `prepare-everyday-notices.mjs --check` verifies these materials offline at predev/prebuild.

The hash implementation shares one incremental WASM API across four algorithms. WASM is embedded in its on-demand code, with no input-bearing fetch. Files are supplied as Blob references and sliced inside the Worker at 1 MiB. QR generation uses controlled module geometry and complete integer-pixel PNG squares. Recognition reuses the existing static-image signature/dimension/animation policy while rejecting HEIC/HEIF, then runs the pinned decoder in a dedicated computation context. Both outer computation and its nested decoder are disposed at job completion or termination.

SQL source/adaptation, full Spring reference details, fixed Unix UTC sequences and strict parser evidence are in [dependency-sql-cron.md](dependency-sql-cron.md). In addition, `website/experiments/everyday/postgresql-reference.mjs` uses the independent feedback development install of PGlite only as a local reference. PostgreSQL 18.6 (PGlite 0.5.10) passed ten format/compact comparisons covering dollar strings, adjacent-string newlines, E strings, nested comments, line comments and quoted identifiers. Production website code has no feedback dependency. MySQL execution evidence remains pending because the installed Docker CLI has no running daemon and no local MySQL server is available.

## Review and corrected regressions

A fresh read-only agent reviewed the new domains and lifecycle adapter. It identified missing-name replacement lookups resolving inherited Object properties. A new native-JavaScript comparison test failed for `$<toString>`, `$<constructor>`, `$<__proto__>` and `$<hasOwnProperty>`, then passed after own-property lookup. Main-thread text preflight was added and proved RED→GREEN before Worker cloning. Export URLs are cached per current filename and revoked on invalidation. A browser regression verifies repeated QR downloads retain only the current preview/export URLs and clear releases them. Password item copy uses delegated events so detached buttons do not retain earlier passwords through AbortSignal listeners.

The first full browser run exposed obsolete nine-tool search expectations, dark checked-label contrast and the fourth English category causing toolbar overflow at 720 CSS pixels. Updated catalog assertions, tool-scoped checked-label backgrounds and explicit toolbar row wrapping resolved these failures. Thirty focused browser regressions then passed, including all eight tools below a base path, actual PNG/SVG round trips, static-image rejection, keyboard execution at 200% zoom, blocked clipboard fallback, WASM initialization failure, cancellation, late dependency completion and end-to-end file timeout configuration. The configured 60-second file timeout is accelerated to 50 ms in that fault-injection test, while pathological regex runs against its real five-second cutoff.

## Initial native channel delay

Safari's native application window was returned by `cua.getApp('Safari')`, but the single UI acquisition call took approximately 2001 seconds. No representative calculation/copy/download/device acceptance was established through that response. This initially blocked task 11.5. A later bounded native-state recheck recovered normally and allowed the completed Safari acceptance recorded below. Task 11.6 requires a real iPhone, unavailable to this session. Responsive Chrome, Chrome headless and static/source evidence remain separate.

A further delayed-execution regression observed the Cron default baseline being populated at page load. The default field is now blank with localized guidance, and an explicit execution freezes its current instant. Entered ISO baselines remain reproducible; Use current time explicitly fills one. The browser test advances the clock by an hour before running and checks the resulting frozen baseline, then supplies an explicit baseline and checks reproducibility. Installed macOS and Safari versions are both 27.2, read from system/app metadata only.

The final Cron calendar fix was independently re-reviewed. The reviewer confirmed the skipped predicate depends only on the rejected civil date and reran all six exact-sequence regressions in 23 ms. No further important finding remained within that correction scope.

## Final verification — 2026-11-08

| Gate | Result |
| --- | --- |
| `pnpm --dir website check` | Exit 0, 199 files, zero diagnostics |
| `pnpm --dir website test` | Exit 0, 131 tests plus image-domain type checking |
| `pnpm --dir website build` | Exit 0, 54 public pages and 2 error pages |
| `pnpm --dir website test:seo` | Exit 0, 10 tests |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website test:browser` | Exit 0, 189 tests, including original nine tool entries and all eight additions |
| `pnpm --dir website verify:links` | Exit 0 with explicit HTTP_PROXY/HTTPS_PROXY and Node `--use-env-proxy`, five project links, zero current public release assets |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website verify:performance` | Exit 0, 44 routes, performance 99–100 and accessibility 100 |
| `cd website && node scripts/everyday-resource-probe.mjs` | Exit 0, real PNG decoding and 256 MiB hash with byte-exact expected digest, cancellation, real regex deadline and sparse Cron |
| `pnpm --dir feedback check` | Exit 0 |
| `pnpm --dir feedback test` | Exit 0, 12 tests |
| `pnpm --dir feedback build` | Exit 0 |
| `pnpm --dir feedback verify:client` | Exit 0, 8,257 gzip bytes across four independent assets |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir feedback test:browser` | Exit 0, 31 real two-origin tests, including sixteen localized new-tool embeds and password service-failure isolation |
| Local Markdown links | 153 checked targets, zero missing |
| `openspec validate --all --strict` | Exit 0, 42 items passed |
| `git diff --check` | Exit 0 |

Final Chrome version is 156.0.8078.82 under Node 24.20.0 on macOS arm64. Both themes, Chinese/English, keyboard/focus/status behavior, 320 CSS pixels and 200% zoom are exercised by rendered browser and axe checks. Screenshots remain in ignored `website/output/screenshots/web-tools/`. Test logs remain at `/tmp/zero-everyday-*.log` and reproducible scripts/fixtures are retained in the repository.

The final first-viewport maximum is 24,626 bytes initial JS gzip and 217,036 resource-body bytes, below the 50 KiB / 1 MiB budgets. On-demand bytes and gzip sizes, timing and process-tree RSS are retained in [resources.json](resources.json). Final measurements are QR generation 105 ms, 11.56 MP decoding 339 ms, 256 MiB hashing 1,361 ms, hash cancellation 35 ms, pathological regex cutoff 5,057 ms and sparse fifty-year Cron 73 ms. These are local desktop measurements. RSS includes the entire dedicated Chrome tree and source-file storage, is sampled at 100 ms, and can be reclaimed asynchronously after clear.

The initial link run failed while directly connecting to GitHub. Explicit uppercase proxy variables and Node's environment-proxy option resolved it. The initial resource probe could not read a terminated Worker's response body. It now measures that same verified local script asset through a local fetch when the browser has discarded the response. Both original failures remain in `/tmp/zero-everyday-links-initial.log` and `/tmp/zero-everyday-resources-initial.log`. No product error handling or test assertions were weakened.

Password example insertion was also checked after changing settings. Its new regression first failed with the prior length still selected, then passed after filling the documented length/count/groups without starting generation.

## Remaining acceptance

43 of 46 tasks are complete. Tasks 1.3 and 6.2 retain the actual MySQL execution-reference gap. SQLite and PostgreSQL comparisons and three-dialect token fixtures passed. Task 11.6 retains real iPhone selection/copy/download/memory/cancellation acceptance. These open tasks do not become complete from source, simulated mobile layouts, Chrome or static-spec validation. Publication and deployed behavior require their own evidence.

## Completed native Safari acceptance

After the initial channel delay, a bounded recheck returned in 0.21 seconds. Subsequent native Safari UI calls responded normally. The actual Safari 27.2 application on macOS 27.2 completed all eight representative examples, real clipboard operations with Copied status, and downloads. The downloaded PNG was selected through Safari's native chooser and decoded back to the Chinese/emoji payload. Cron was independently changed to Asia/Shanghai and returned `2026-11-08T01:00:00.000Z` / `2026-11-08T09:00:00 +08:00`.

Normal Safari file hashing completed for the 256 MiB synthetic input under both SHA-256 and SHA-512. A 256 MiB + 1 byte file was rejected before computation with empty result and disabled exports. Safari also enforced the real five-second text deadline while a same-origin module was deliberately delayed. The Cancel processing button was explicitly exercised in file mode against the same production static assets with a ten-second local module-load delay on port 4325. The page showed Processing cancelled, empty result and disabled exports, and retained that state after another ten seconds. This loading-delay fault injection is separate from normal CPU/file timing.

All eight owned downloaded files were independently read back and checked. Text cleanup is exactly four UTF-8 bytes, regex seven bytes, SQL 34 bytes, date one byte, and SHA-256 TXT 71 bytes. PNG is 1024 × 1024 and 22,861 bytes. Password TXT has twenty characters with the required groups. Cron TXT is 745 bytes with baseline, UTC zone and ten occurrences. Password content is omitted from evidence. Full non-sensitive results are in [safari.json](safari.json).

`TZ=UTC`, `TZ=America/New_York` and `TZ=Asia/Shanghai` reruns of core/Cron domain tests also passed. Task 11.5 is complete. Task 11.6 still requires actual iPhone evidence. Final scope remains 43/46, with the two MySQL reference tasks and the iPhone task open.

## Commit preparation

The staged-file whitespace check additionally covered the new license artifacts. Their display text now uses LF, removes trailing layout whitespace and ends with one newline. Installed-package source hashes remain calculated from the original bytes. The separately retained jsqr-es6 license manifest records both its original upstream hash and its normalized distributed-file hash. Complete legal text is preserved. Offline notice verification and the staged diff check pass after regeneration.
