# SQL and Cron dependency verification

Recorded 2026-11-08 against the current implementation. Domain checks and reference execution are recorded separately from browser, Worker integration, device and deployed behavior.

## Dependencies and source boundaries

- `sql-formatter` 15.9.0, MIT, from the actively published sql-formatter-org project. Production imports name `formatDialect`, `mysql`, `postgresql` and `sqlite` only. Its public package exports provide dialect configurations but omit the lexer constructor. The SQL adapter reuses the pinned upstream lexer as `sql-vendor-*.ts`, preserving the complete MIT license in each source file. Local mechanical changes use erasable TypeScript, local imports, explicit type imports and checked/established array indices. The public dialect configuration and vendored tokenizer share the exact 15.9.0 shape. The double assertion crosses only the duplicate enum type identity. No query values are asserted into types.
- Upstream source was retrieved from `https://raw.githubusercontent.com/sql-formatter-org/sql-formatter/v15.9.0/src/`. Vendored files cover Tokenizer, TokenizerEngine, TokenizerOptions, token, regexFactory, regexUtil, NestedComment, lineColFromIndex and utils. Future formatter upgrades must update and reverify this lexer set together.
- `sql-formatter` declares `argparse ^2.0.1` and `nearley ^2.20.1`. Nearley declares commander, moo, railroad-diagrams and randexp. The website lockfile fixes the resolved graph. Actual lazy browser resource size and tree-shaking need the parent build/resource verification.
- `sql-parser-cst` 0.44.1 was evaluated as a public CST/tokenization alternative. Its GPL-2.0-or-later license would expand the website license scope, so it was excluded.
- `croner` 11.0.0, MIT, has no runtime dependencies. Its public `Cron`, `nextRun` and `match` APIs are used solely for UTC calendar candidate enumeration and ordinary field validation. No callback or scheduled timer is installed.
- `cron-parser` 5.10.4, MIT, depends on Luxon. It was compared through its public `CronExpressionParser.parse` API in the development experiment. Production Cron domain imports only Croner.

## SQL domain

`executeSql(SqlInput)` returns the shared `Result<{ text: string }>` contract. It enforces 1 MiB UTF-8 input and 8 MiB output. Errors use `sql` with `syntax` or `unsupported`, retaining safe line/column metadata when the tokenizer supplies it. Exception messages containing query fragments are discarded.

Formatting uses the selected public dialect and two spaces, preserving keyword, identifier, function and datatype case. Both actions validate original token content against output token content. Compaction retains an existing whitespace separator, reduces runs to one space or LF, preserves comments and their internal bytes, and always terminates a nonfinal line comment with LF. All existing newlines are conservatively retained. Unknown/unclosed lexemes fail.

A failing fixture exposed a real formatter behavior change for PostgreSQL `select 'a'\n'b'`. Upstream formatting collapsed the newline to a space. The adapter restores source newlines before affected string tokens using output token positions. The regression passes. MySQL `--` without a following whitespace character is explicitly rejected because the upstream lexer recognizes it as a comment while MySQL's dialect rule differs.

Fixtures cover three dialects, repeated literal whitespace, escaped strings, dollar-quoted strings, quoted identifiers, numbered/named/positional parameters, ordinary/nested/line comments, executable comments and optimizer hints. SQLite reference execution compares both output actions with the original query in a real local SQLite process. Eight comparisons pass under SQLite 3.54.0. Reproduce with `node website/experiments/everyday/sql-reference.mjs`. Output is retained in `website/experiments/everyday/sqlite-reference.txt`.

**Remaining SQL acceptance**. The local MySQL client/server is unavailable and the installed Docker CLI has no running daemon. MySQL lexical/token fixtures pass, while actual MySQL result comparisons remain open, so tasks 1.3 and 6.2 retain that gap. PostgreSQL 18.6 (PGlite 0.5.10) subsequently passed ten actual format/compact comparisons, retained in `website/experiments/everyday/postgresql-reference.txt` and reproduced with its sibling `.mjs` script. This experiment uses the separate feedback development install solely as a database reference. Compaction deliberately retains more whitespace than a maximal minifier.

## Cron candidate comparison

Reproduce with `node website/experiments/everyday/cron-candidates.mjs`. Fixed output is retained in `website/experiments/everyday/cron-candidates.txt`.

Both candidates omit the second repeated fixed 01:30 in the autumn transition, whereas Spring returns both instants. For the missing 02:30 spring transition, Croner moves to 03:00 and cron-parser moves to 03:30, whereas Spring skips that day's missing time. Neither candidate accepts `L-2`. Cron-parser also rejects `LW`. Croner was selected with an explicit adapter.

The adapter enforces five/six fields, rejects macros/year fields, applies Vixie wildcard-origin AND versus restricted-day OR semantics in Unix mode, and uses AND for Spring. Spring `?`, last-day offsets, last weekdays, nearest weekdays and nth/last weekday selectors use mode-specific parsing/calendar handling. Last-day offsets and nearest weekdays are normalized into bounded calendar predicates. End-of-month Sunday `nW` differs between Croner and Spring, so the adapter skips that occurrence as shown by the additional `31W` official fixture.

UTC calendar candidates are mapped to target-zone instants using `Intl` timezone offsets around the candidate. Unix fixed-time mode chooses the first repeated occurrence and shifts missing times to the first valid minute of that day. Interval and Spring schedules emit both repeated instants and skip gaps. Sorting/deduplication uses UTC instants. The result contains ten or fewer occurrences, a fixed UTC baseline, target local timestamps, numeric offsets, mode/field explanation, exact count and a fifty-year horizon. A computation deadline returns `timeout`, including when no results have yet been found. Parent Worker cancellation/termination remains the authoritative five-second outer deadline.

Baseline validation rejects missing offsets, impossible calendar dates such as February 30, hour 24 and invalid IANA zones. Identical explicit-offset baselines reproduce the same results in a selected target zone. Browser timezone detection and visible UTC fallback belong to the parent UI adapter.

## Official Spring reference

Reference jars are Spring Framework `spring-context` and `spring-core` 7.0.10 from Maven Central. SHA-256 values are `f0065166b6a5101a871ab8702d6c4011cf39faed370a64e7ef14a3ad2bf2a99a` and `a236f31a7c07e3a1a8e7839ec5c0d47b5cc75709132db50416d5dad320341f12` respectively. Jars remain outside the repository.

The actual reference runtime is Oracle Java 21.0.12+7-LTS-205 with JDK tzdata 2026b. The Node adapter ran under Node v24.20.0, ICU 78.3 and tzdata 2026c. The selected reference fixtures agree despite that database version difference. Browser engines may ship other tzdata and need their own acceptance evidence.

`website/experiments/everyday/SpringCronReference.java` calls the actual `CronExpression.next(ZonedDateTime)`. `spring-7.0.10-reference.txt` contains metadata and ten UTC instants for each of eleven expressions, including both DST directions, interval/fixed forms, LW, 1W, 31W, L-2, 5L, MON#2 and the day intersection. All 110 official instants match the adapter. `generate-spring-reference.sh` downloads pinned jars into a temporary directory, compiles the sources and reproduces both reference files.

### Unresolved Spring offset conflict

`SpringCronOffsetReference.java` and `spring-offset-edge-reference.txt` preserve additional actual upstream results. With baseline `2026-01-01T00:00:00Z` in UTC, `L-30` returns January 1 then January 29 repeatedly. `L-31` returns January 28 repeatedly. `L-100` returns September 22, 2025, September 22, 2024, then March 22, 2024. This upstream behavior conflicts with the approved result requirement that each occurrence is strictly after baseline and strictly increasing. Spring rejects `L-0`.

The maintainer explicitly approved this restriction on 2026-11-08. The adapter rejects `L-n` outside 1–27 with the localized `unsupported` reason. This is an intentional compatibility limitation. The design and Cron spec now document the accepted 1–27 range. The current passing fixtures do not establish full equivalence for all possible Spring expressions and baselines.

## Fresh verification

- Red phase observed missing SQL/Cron modules, the PostgreSQL newline regression, impossible-baseline normalization, mixed last-day-offset lists and the 31W mismatch before their implementation fixes.
- `node --test website/tests/everyday-sql.test.mjs website/tests/everyday-cron.test.mjs` passes 18 tests. Coverage includes all four exact Unix DST sequences, 110 official Spring instants, dialect field counts, wildcard-origin days, names, last-day-offset lists, sparse/fewer-than-ten and zero-result horizons, explicit-offset reproduction, target-zone offsets, bilingual explanations, invalid dates/timezones, timeout distinction and SQL dialect lexical cases.
- `pnpm --dir website exec astro check` passes 197 files with zero errors, warnings and hints. Log is `/tmp/zero-cron-sql-check.log`.
- Real SQLite reference comparison passes eight action/query pairs.
- `git diff --check` passes.

Full website test/build/browser/resource verification and manual Safari/iPhone acceptance belong to the parent integration task. No runtime deployment or database connection is made by either browser domain.

## Final-review dense special-day regression

The final read-only review reproduced `* * * L-1 * *` in Spring mode after `2026-11-08T00:00:00Z` in UTC timing out. Normalization broadened the DOM field to `*`, and the adapter evaluated every scheduled second on rejected dates. A new regression failed with the original implementation after 4515 ms.

The correction advances the UTC-represented wall-clock cursor to 23:59:59.999 of a rejected civil day before requesting Croner's next candidate. Croner still applies the selected month, weekday, hour, minute and second constraints, and the existing timezone mapping applies to accepted candidates. Ordinary DOM list alternatives are checked before any day is skipped. The independent deadline remains active.

The regression covers dense L-1, 15W, both mixed with ordinary day 10, explicit November/Sunday filtering, and a mixed November/Monday schedule in America/New_York. Every case returns all ten exact expected UTC seconds and has an individual subsecond assertion. The six-case regression completes in approximately 13 ms locally. All 13 Cron tests pass, including the 110 Spring reference instants and four Unix DST sequences.

Fresh scoped source checking passes with `website/node_modules/.bin/tsc --noEmit --allowImportingTsExtensions --moduleResolution bundler --module esnext --target es2022 --skipLibCheck --strict --noUncheckedIndexedAccess website/src/lib/web-tools/cron.ts`. `git diff --check` also passes. Integration/build/device results remain the parent task's separate evidence. The previously discussed L-1 through L-27 contract has since received user approval and is reflected in the updated design/spec/content.
