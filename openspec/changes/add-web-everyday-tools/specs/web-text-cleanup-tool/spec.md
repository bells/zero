## Purpose

Provide explicit, repeatable line-oriented text cleanup for everyday pasted content, with predictable operation ordering, Unicode handling and complete local copy or download results.

## ADDED Requirements

### Requirement: Selected operations have a fixed visible order
The tool SHALL offer per-line leading and trailing ASCII space and tab removal, standard non-locale uppercase or lowercase conversion, empty-line removal, duplicate-line removal and ascending or descending sorting. Selected operations SHALL run in that order, with case conversion before deduplication. Only deduplication SHALL be enabled by default. Deduplication SHALL be case-sensitive at its execution stage and preserve the first occurrence. Sorting SHALL be stable and use deterministic UTF-16 code-unit ordering. The interface SHALL disclose operation order and lexical sorting semantics.

#### Scenario: Case conversion affects duplicates
- **WHEN** the visitor processes lines A and a with lowercase conversion and deduplication selected
- **THEN** the result contains one line a
- **AND** disabling lowercase conversion retains the two distinct lines

#### Scenario: Sorting is deterministic
- **WHEN** the visitor sorts lines 2, 10 and 1 in ascending order
- **THEN** the result order is 1, 10, 2 in both interface languages

### Requirement: Line and empty-result semantics
CRLF and CR input separators SHALL be normalized to LF. A final separator SHALL be tracked separately from content lines and retained when the result still has content. Empty-line removal SHALL remove zero-length lines and lines containing only ASCII spaces and tabs. If every content line is removed, the successful result SHALL be empty text. Other Unicode characters and spaces SHALL be preserved unless changed by the explicitly selected case conversion.

#### Scenario: Terminal newline is retained
- **WHEN** the visitor deduplicates the input a followed by LF, a and a final LF
- **THEN** the result is a followed by one final LF
- **AND** the terminal separator is not treated as an extra duplicate content line

#### Scenario: Every line is removed
- **WHEN** empty-line removal removes all content
- **THEN** the tool reports a successful empty result and offers the complete empty TXT download

### Requirement: Bounded explicit cleanup
The tool SHALL accept at most 1 MiB UTF-8 and 20,000 logical content lines, return at most 8 MiB UTF-8 and stop processing after five seconds. All output growth, including Unicode case expansion, SHALL count toward the limit. Processing SHALL use only the selected options and the common new-tool revision, cancellation and download behavior.

#### Scenario: Input exceeds the line limit
- **WHEN** an input contains 20,001 content lines
- **THEN** execution reports a line-limit error with the original input available for editing
- **AND** no truncated result is presented
