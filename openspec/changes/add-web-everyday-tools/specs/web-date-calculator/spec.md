## Purpose

Offer deterministic Gregorian date differences and date shifts for everyday planning, with explicit endpoint and weekend rules that stay independent of device timezone and daylight-saving transitions.

## ADDED Requirements

### Requirement: Strict civil-date inputs
The tool SHALL accept Gregorian dates from 0001-01-01 through 9999-12-31 in YYYY-MM-DD form, rejecting nonexistent dates and unsupported forms. Date calculations SHALL use civil calendar days independently of local timezone and DST. Weekends SHALL mean Saturday and Sunday, with the absence of statutory-holiday and compensatory-workday adjustment stated beside the option.

#### Scenario: Leap date is validated
- **WHEN** a visitor enters 2024-02-29 or 2023-02-29
- **THEN** the first is accepted and the second is rejected
- **AND** changing device timezone does not change a valid calculation

### Requirement: Signed differences with visible endpoint rules
Natural-day difference SHALL equal end date minus start date, with same-day result zero and reverse order producing a negative result. With weekend exclusion selected, the tool SHALL count weekdays after the earlier date through the later date inclusive, then apply the sign of the original input order. The interface SHALL explain the endpoint rule alongside results.

#### Scenario: Weekend-excluding difference is signed
- **WHEN** the visitor compares Friday 2026-11-06 with Monday 2026-11-09 while excluding weekends
- **THEN** the forward difference is 1 and the reversed difference is -1
- **AND** comparing the same date with itself gives 0

### Requirement: Bounded date addition and subtraction
The tool SHALL shift a start date by a signed integer whose absolute value is at most 3,652,058. Natural-day shifts SHALL move by that number of calendar days. Weekend-excluding shifts SHALL start counting strictly after or before the origin according to direction and count only weekdays. A zero shift SHALL preserve the origin even on a weekend. Results outside the supported date range SHALL fail explicitly. Execution SHALL obey the common five-second deadline and current-result rules.

#### Scenario: Visitor adds one weekday
- **WHEN** the visitor adds one day to Friday 2026-11-06 with weekend exclusion
- **THEN** the result is Monday 2026-11-09
- **AND** a zero shift from Saturday 2026-11-07 remains 2026-11-07

#### Scenario: Shift exceeds the calendar range
- **WHEN** one natural day is added to 9999-12-31
- **THEN** the tool reports a range error without normalizing into an unsupported year
