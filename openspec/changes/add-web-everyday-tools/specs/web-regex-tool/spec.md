## Purpose

Provide a browser-local JavaScript regular-expression workbench for matching and replacement, with explicit syntax, capture results and execution bounds that preserve interface responsiveness.

## ADDED Requirements

### Requirement: Explicit JavaScript regular-expression syntax
The tool SHALL accept a pattern body, sample text and the flags g, i, m, s, u and y, with JavaScript RegExp semantics. The interface SHALL identify JavaScript syntax and display localized compilation errors. Pattern input SHALL be limited to 8 KiB UTF-8 and sample text to 1 MiB UTF-8. Unsupported or repeated flags SHALL produce an error. Empty pattern and sample text SHALL follow JavaScript matching behavior.

#### Scenario: Invalid pattern fails clearly
- **WHEN** the visitor executes an unterminated character class
- **THEN** the tool reports a compilation error without discarding the pattern or sample
- **AND** no previous match result remains actionable

### Requirement: Accurate bounded matches and captures
Results SHALL expose match text, zero-based UTF-16 start and end offsets, numbered captures and named captures where present. Matching SHALL honor global and sticky flags and advance zero-length global matches according to the selected Unicode mode. At most 1,000 matches SHALL be accepted, with a maximum of 50 displayed per page and an 8 MiB complete serialized result limit. Exceeding either result bound SHALL fail explicitly. Match highlighting SHALL render source content as inert text.

#### Scenario: Zero-length Unicode matching terminates
- **WHEN** a global Unicode pattern matches zero-length positions around an astral character
- **THEN** enumeration advances by complete Unicode code points and terminates
- **AND** reported offsets remain UTF-16 positions in the original sample

### Requirement: JavaScript replacement previews
The tool SHALL offer a replacement preview using JavaScript replacement-string semantics including numbered and named captures. The template SHALL be limited to 64 KiB UTF-8 and the output to 8 MiB. Replacement SHALL use the selected flags, retain the original sample and provide the complete current replacement text for copy or TXT download.

#### Scenario: Captures are reordered
- **WHEN** the visitor replaces a two-capture match using $2-$1
- **THEN** the preview matches JavaScript replacement behavior
- **AND** the original sample is still editable and unchanged by preview execution

### Requirement: Hard-stop execution
Pattern compilation, matching and replacement SHALL execute in a terminable computation context with a five-second deadline. Cancellation or deadline expiry MUST stop computation and retain a responsive page. Changes to pattern, sample, flags or replacement template SHALL invalidate pending or completed results under the common lifecycle.

#### Scenario: Pathological expression exceeds its deadline
- **WHEN** a pattern causes excessive backtracking beyond five seconds
- **THEN** computation is terminated and the tool reports timeout
- **AND** the visitor can edit and execute another expression without reloading
