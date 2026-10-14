## Purpose

Help Chinese and English visitors inspect a live Unix clock and convert timestamps or explicitly interpreted dates into consistent, copyable representations without relying on ambiguous browser date parsing.

## ADDED Requirements

### Requirement: Coherent live clock with pause and resume
The tool SHALL display Unix seconds and milliseconds derived from the same current-time sample, with separate copy actions and pause/resume. Pausing MUST freeze both display and copied values; resume MUST immediately sample current time. A hidden page SHALL suspend clock updates and resynchronize when visible if running. Relative-time output SHALL use the same reference snapshot and follow pause state.

#### Scenario: Visitor copies while paused
- **WHEN** a visitor pauses the clock, waits and copies seconds and milliseconds
- **THEN** both values describe the frozen sample rather than click-time values
- **AND** resuming shows the current clock and updates relative-time output

### Requirement: Explicit timestamp unit inference
The tool SHALL accept signed integer timestamps, with auto/seconds/milliseconds modes. Auto MUST infer seconds only for 10 absolute decimal digits and milliseconds only for 13; other lengths MUST request an explicit unit. The adopted unit MUST be visible. Fractions, scientific notation, unsafe integers and values outside the supported date range MUST fail without a plausible-looking result.

#### Scenario: Common seconds and milliseconds resolve to the same instant
- **WHEN** a visitor enters `1700000000` or `1700000000000` in auto mode
- **THEN** both yield `2023-11-14T22:13:20.000Z` and show the respective inferred unit

#### Scenario: Epoch zero or a negative short timestamp needs a unit
- **WHEN** a visitor enters `0` or `-1` in auto mode
- **THEN** the tool requests seconds or milliseconds rather than guessing
- **AND** explicit seconds converts `0` to the Unix epoch and `-1` to one second before it

### Requirement: Strict dates and visible timezone interpretation
The tool SHALL accept validated ISO date-times with `Z` or `±HH:mm` and unzoned `YYYY-MM-DD HH:mm:ss` with optional 1–3 fractional-second digits. Unzoned input SHALL default to fixed UTC+08:00 labeled Beijing time and allow explicit UTC selection. Offset input MUST retain its stated interpretation. Invalid calendar values, leap seconds, unsupported formats and out-of-range dates MUST produce localized guidance, without silent date normalization or host-timezone inference.

#### Scenario: The same unzoned date has a declared interpretation
- **WHEN** a visitor enters `2026-10-14 20:24:00` with the default timezone
- **THEN** the output is `2026-10-14T12:24:00.000Z` and the fixed UTC+08:00 interpretation is visible
- **AND** selecting UTC changes the instant to `2026-10-14T20:24:00.000Z`

#### Scenario: An invalid date is not normalized
- **WHEN** a visitor enters `2026-02-30 12:00:00` or unsupported slash-formatted input
- **THEN** the original input remains and an invalid-date or supported-format message replaces any active old result

### Requirement: Copyable representation matrix
A valid conversion SHALL show Unix seconds, Unix milliseconds, Beijing time at fixed UTC+08:00, UTC, ISO 8601 and localized relative time with per-row copying. Milliseconds MUST be preserved and Unix seconds MUST use floor division for pre-epoch values. Timezone names/offsets MUST be explicit rather than the ambiguous abbreviation CST alone.

#### Scenario: Visitor converts a pre-epoch millisecond
- **WHEN** the visitor explicitly converts `-1` as milliseconds
- **THEN** the ISO result is `1969-12-31T23:59:59.999Z`, the seconds result is `-1` and the milliseconds result is `-1`
- **AND** copied rows match their displayed representations
