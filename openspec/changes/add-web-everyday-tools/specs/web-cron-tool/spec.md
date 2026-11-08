## Purpose

Explain and evaluate two explicitly selected Cron dialects in the browser, showing reproducible future instants with timezone context and clearly bounded search and compatibility behavior.

## ADDED Requirements

### Requirement: Separate Unix and Spring dialect semantics
The tool SHALL default to Unix five fields and provide a Spring six-field mode with leading seconds. It SHALL require the selected field count and reject year fields and macro forms. Both modes SHALL support field ranges, lists, steps, month and weekday names, with Sunday numbered 0 or 7. Unix mode SHALL follow its documented Vixie day-of-month and day-of-week rules, including wildcard-origin behavior for step fields. Spring mode SHALL intersect day-of-month and day-of-week and support its field-specific ?, L, L-n (n from 1 through 27), LW, nW, dL and d#n forms as documented by Spring CronExpression. Invalid fields and symbols SHALL produce localized errors. Explanations SHALL be available in Chinese and English and agree with computed results.

#### Scenario: Modes disagree on restricted day fields
- **WHEN** the visitor evaluates Unix 0 9 1 * MON and Spring 0 0 9 1 * MON
- **THEN** Unix matches the documented first-of-month or Monday rule and Spring requires the first of the month to be Monday
- **AND** the localized explanation states the selected mode's rule

#### Scenario: Spring special calendar form is evaluated
- **WHEN** the visitor evaluates Spring 0 0 9 LW * *
- **THEN** results occur at 09:00 on the last weekday of each month
- **AND** they agree with reference Spring CronExpression fixtures for the same baseline and timezone

### Requirement: Reproducible baseline and timezone
Each execution SHALL freeze one UTC baseline instant, defaulting to execution time. Visitors SHALL be able to enter an ISO baseline with explicit UTC or numeric offset and select an IANA timezone. The initial timezone SHALL be the detected browser timezone, with a visibly identified UTC fallback if unavailable. Successful results SHALL be strictly after the baseline, increasing by UTC instant, and display target-zone local time, numeric UTC offset, selected dialect and baseline.

#### Scenario: Visitor reproduces a schedule in another zone
- **WHEN** the visitor supplies a fixed baseline and selects Asia/Shanghai
- **THEN** repeated execution with identical inputs yields identical future instants and offsets
- **AND** another browser's local timezone does not change those results

### Requirement: Explicit daylight-saving behavior
Unix mode SHALL classify schedules with a single numeric minute and hour as fixed-time. A fixed missing local time SHALL move to the first valid instant on that day and a repeated fixed time SHALL use its first occurrence. Schedules with wildcard, list, range or step minute or hour fields SHALL skip nonexistent times and include both instants for repeated times. Spring mode SHALL match Spring Framework 7.0.10 CronExpression.next results for ZonedDateTime across both DST directions. Results during repeated local times SHALL be disambiguated by offset and ordered by instant. The tool SHALL publish mode-specific DST guidance and MUST NOT silently substitute a dependency's incompatible default behavior.

#### Scenario: Daylight-saving fixtures are evaluated
- **WHEN** fixed-time and interval schedules are evaluated across the spring and autumn transitions in America/New_York
- **THEN** each mode agrees with its own reference fixtures
- **AND** repeated wall-clock labels remain distinguishable by their displayed offsets

#### Scenario: Fixed Unix schedule encounters a missing hour
- **WHEN** Unix 30 2 * * * is evaluated in America/New_York after 2026-03-08T06:00:00Z
- **THEN** its first result is 2026-03-08T07:00:00Z, followed by 2026-03-09T06:30:00Z
- **AND** Unix 30 1 * * * after 2026-11-01T04:00:00Z returns 2026-11-01T05:30:00Z and then 2026-11-02T06:30:00Z

#### Scenario: Interval Unix schedule crosses a repeated hour
- **WHEN** Unix */30 * * * * is evaluated in America/New_York after 2026-11-01T04:45:00Z
- **THEN** its first three results are 2026-11-01T05:00:00Z, 2026-11-01T05:30:00Z and 2026-11-01T06:00:00Z
- **AND** the 01:00 local labels at the first and third instants show their different UTC offsets

### Requirement: Bounded future-time search and lifecycle
Expressions SHALL be limited to 1 KiB UTF-8. The tool SHALL seek ten future executions within 50 calendar years after the fixed baseline and stop computation after five seconds. Exhausting the search horizon SHALL return the found count and explicit horizon, including zero results. Timeout SHALL be a distinct failure. Changes to expression, mode, baseline or timezone SHALL invalidate results. Copy and TXT download SHALL include the current mode, timezone, baseline and complete result list under the common lifecycle rules.

#### Scenario: Search horizon contains too few occurrences
- **WHEN** a valid expression has fewer than ten executions within the search horizon
- **THEN** the result shows the exact found count and horizon
- **AND** a timed-out search reports timeout without asserting that no occurrence exists

#### Scenario: Unsupported Spring last-day offset fails explicitly
- **WHEN** a visitor evaluates Spring L-28 or a larger last-day offset
- **THEN** execution reports an unsupported-expression error and exposes no occurrence list
- **AND** the guide states that supported offsets are L-1 through L-27
