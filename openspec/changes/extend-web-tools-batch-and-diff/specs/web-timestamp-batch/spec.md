## Purpose

Let Chinese and English website visitors convert multiple timestamp or date lines in one local operation, retaining source line identity, strict interpretation, individual failures and a complete portable result without changing the existing single-value tool.

## ADDED Requirements

### Requirement: Batch mode preserves the existing timestamp workflow
The existing Chinese and English timestamp pages SHALL provide labeled single/batch mode controls without adding a new route. The live clock and single conversion behavior MUST remain available. Switching modes SHALL retain source drafts within the current page, cancel pending batch work and invalidate batch results. Batch input SHALL be a multiline field with explicit conversion, unit auto/seconds/milliseconds and unzoned timezone UTC+08:00/UTC controls, defaulting to auto and fixed UTC+08:00. Inputs and mode MUST NOT be persisted or placed in the URL.

#### Scenario: Visitor switches between modes
- **WHEN** a visitor enters a single value, switches to batch, enters multiple lines and returns to single
- **THEN** the single draft and live-clock controls remain usable
- **AND** switching back to batch preserves its source draft but requires a new explicit conversion before results can be copied or exported

### Requirement: Each physical line has an independent strict result
Batch conversion SHALL accept LF, CRLF and CR line separators, ignore one final separator-created empty element, skip whitespace-only lines and retain original 1-based physical line numbers and original source strings for processed lines. It SHALL report successful, failed and skipped counts. Empty or all-whitespace input MUST produce guidance without an active export. A row error MUST NOT prevent valid rows from converting.

Each nonblank line SHALL follow the existing single-value rules: auto inference only for signed integers with 10/13 absolute decimal digits; other integer lengths require an explicit unit; fractional/scientific/unsafe/out-of-range numbers fail; validated ISO offset date-times and supported unzoned dates use the selected explicit interpretation, never the host timezone or lenient date normalization. Unix seconds MUST floor pre-epoch milliseconds. Every valid row SHALL expose its adopted interpretation.

#### Scenario: Mixed input retains source positions
- **WHEN** auto mode converts `1700000000`, a blank line, `not-a-date` and `1700000000000` on four physical lines followed by a final newline
- **THEN** the summary is two successful rows, one failed row and one skipped line
- **AND** result rows retain source line numbers 1, 3 and 4, with lines 1 and 4 resolving to `2023-11-14T22:13:20.000Z`

#### Scenario: Batch follows explicit units and timezone
- **WHEN** a batch contains `0`, `-1` and `2026-02-30 12:00:00` in auto mode
- **THEN** the first two rows request an explicit unit and the invalid date fails without normalization
- **AND** re-running with milliseconds converts `-1` to `1969-12-31T23:59:59.999Z` and Unix seconds `-1`

#### Scenario: Unzoned dates do not inherit the computer timezone
- **WHEN** `2026-10-15 08:00:00` is batch-converted with UTC+08:00 and then UTC
- **THEN** the respective ISO outputs are `2026-10-15T00:00:00.000Z` and `2026-10-15T08:00:00.000Z`
- **AND** a line with an explicit offset retains that offset interpretation in either run

### Requirement: Batch results are stable and fully exportable
A completed batch SHALL show ordered results with original line/source, status, adopted interpretation and Unix seconds/milliseconds, fixed Beijing time, UTC and ISO 8601 for successes; failures SHALL show localized reasons. It SHALL record one reference-time snapshot per run and MUST NOT automatically recompute with the live clock. Relative time SHALL remain part of single conversion only. Result pagination MUST NOT omit rows from exports.

Explicitly labeled Copy JSON and Download JSON actions SHALL produce the same complete versioned structure containing run settings, reference time, counts and all nonblank rows, including failures with stable error codes and localized descriptions. Download SHALL use a fixed content-independent filename. Clipboard failure MUST provide manual selection without reporting success. No automatic download SHALL occur.

#### Scenario: Visitor exports a mixed batch across result pages
- **WHEN** a visitor completes a batch larger than one displayed result page, waits for the live clock to advance and copies or downloads JSON
- **THEN** the ordered export contains all successful and failed rows and the original run settings/snapshot
- **AND** the displayed values and downloaded values remain consistent without a new conversion

#### Scenario: Clipboard permission is denied
- **WHEN** Copy JSON is requested and clipboard access fails
- **THEN** the complete JSON remains selectable for manual copying and a localized failure is announced
- **AND** the page does not claim that copying succeeded

### Requirement: Batch processing is bounded and stale results are unusable
Batch input SHALL be limited to 1 MiB UTF-8 and 1,000 physical lines excluding the single final separator-created empty element, counting internal blank lines. Exceeding either whole-input bound MUST reject the batch. Each nonblank line SHALL retain the 256-character single-value bound; exceeding it SHALL be a row error. Structured output and its JSON export MUST fit within 8 MiB UTF-8. Display SHALL mount at most 100 result rows at a time while keeping the full result available through pagination and export.

Execution SHALL keep editing/navigation/cancellation responsive, terminate after 5 seconds and ignore cancelled or superseded completions. Any batch input/settings change, mode change, new run, failure, cancellation, clear or page exit MUST invalidate previous result copying/export and release associated resources. Source drafts MUST survive processing errors. Content MUST remain in current-page memory except explicit clipboard/download actions, with no upload, URL inclusion, logging, telemetry or site-storage persistence.

#### Scenario: Whole-input and row limits differ
- **WHEN** input has 1,001 physical lines or exceeds 1 MiB UTF-8
- **THEN** no partial batch is presented as a completed result and the original input remains editable
- **AND** an otherwise bounded batch with one 257-character row reports that row as failed while processing its other valid rows

#### Scenario: Edited input cannot export an older result
- **WHEN** a visitor edits batch input or settings after a successful run, or a cancelled run later completes
- **THEN** older results cannot be copied/downloaded or restored by the late completion
- **AND** retry remains available with the current source

#### Scenario: Private synthetic data stays local
- **WHEN** a synthetic private marker is batch-converted, cleared and the visitor leaves the page
- **THEN** network, URL, logging and site-storage observation show no marker content
- **AND** result references, pending work, manual-copy values and export object URLs are released
