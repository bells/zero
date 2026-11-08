## Purpose

Let visitors format and conservatively compact SQL locally for three named dialects, preserving lexical meaning and providing explicit failures for unsupported or excessive input.

## ADDED Requirements

### Requirement: Explicit dialect formatting
The tool SHALL provide MySQL, PostgreSQL and SQLite, defaulting to MySQL, with separate Format and Compact actions. Formatting SHALL use two-space indentation by default and preserve identifier and keyword case. String literals, quoted identifiers, parameter tokens and comment contents SHALL retain their lexical meaning and content. The interface SHALL distinguish formatting from database execution and validity guarantees.

#### Scenario: Visitor formats a supported statement
- **WHEN** a visitor formats a statement in its selected dialect
- **THEN** the result uses consistent indentation while retaining literals, identifier spelling and parameters
- **AND** the page makes no database connection

### Requirement: Compaction preserves SQL meaning
Compaction SHALL reduce only syntactically dispensable whitespace using the selected dialect's lexical boundaries. It SHALL preserve ordinary comments, executable comments and optimizer hints, token separation, line-comment termination and semantically necessary newlines. Whitespace within literals and quoted identifiers MUST remain intact. Unsupported lexical constructs SHALL yield an explicit error instead of a potentially changed query.

#### Scenario: Comments and literals survive compaction
- **WHEN** SQL contains a string with repeated spaces and a line comment before another statement
- **THEN** compaction preserves the string bytes and a terminating newline after the comment
- **AND** the following statement remains outside the comment

#### Scenario: PostgreSQL newline concatenation is retained
- **WHEN** a PostgreSQL query uses adjacent string literals whose concatenation depends on an intervening newline
- **THEN** compaction retains a newline required for the same lexical meaning

### Requirement: Bounded editable input and current output
SQL input SHALL be limited to 1 MiB UTF-8, output to 8 MiB and computation to five seconds. Errors SHALL provide localized reasons and available source positions. Input or dialect changes SHALL invalidate current output. Format and Compact SHALL follow common cancellation, complete-result copy, TXT download and lifecycle rules.

#### Scenario: Dialect changes during processing
- **WHEN** a visitor switches from MySQL to PostgreSQL while work is pending
- **THEN** the previous task is cancelled and its output cannot appear as a PostgreSQL result
