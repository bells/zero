## Purpose

Provide a browser-local, bilingual Unicode escape converter for developers reading mixed text from logs, JSON and configuration, with reversible encoding, strict errors and bounded, cancellable processing that preserves user content and privacy.

## ADDED Requirements

### Requirement: Decode supported Unicode escapes in mixed text
The tool SHALL decode lowercase-u fixed escapes containing exactly four hexadecimal digits and brace escapes containing one to six hexadecimal digits. Hexadecimal digits SHALL be case-insensitive. Brace escapes MUST represent Unicode scalar values at or below U+10FFFF. Adjacent fixed high/low surrogate escapes SHALL decode as one supplementary character. Ordinary valid text SHALL remain unchanged, without trimming or Unicode normalization. The tool MUST NOT interpret code-point notation, HTML entities, URL encoding, JSON structure or non-Unicode escapes.

#### Scenario: Mixed logs and emoji are decoded
- **WHEN** the visitor decodes `用户：\u4F60\u597D，\uD83D\uDE00 / \u{1f600}`
- **THEN** the result is `用户：你好，😀 / 😀`

#### Scenario: Other representations and escapes are preserved
- **WHEN** the visitor decodes `U+4E2D &#x4E2D; %E4%B8%AD \n \t \"` together with ordinary text
- **THEN** those representations, backslashes and ordinary text remain unchanged
- **AND** JSON validation or formatting is not performed and the guide states that decoded output is not guaranteed to remain valid JSON

#### Scenario: Fixed escapes consume four digits
- **WHEN** the visitor decodes `\u0041B`
- **THEN** the result is `AB`

### Requirement: Decode one original escape layer
The tool SHALL preserve each pair of consecutive original backslashes verbatim. Only an unpaired final backslash in an original run SHALL start a Unicode escape. Characters produced by decoding MUST NOT be scanned again during that operation. A backslash not starting an active Unicode escape SHALL remain unchanged.

#### Scenario: Escaped backslashes protect a literal sequence
- **WHEN** the input contains two consecutive backslashes followed by `u4F60`
- **THEN** both backslashes and `u4F60` remain unchanged

#### Scenario: Odd backslash runs allow one active escape
- **WHEN** the input contains three consecutive backslashes followed by `u4F60`
- **THEN** the result contains two backslashes followed by `你`

#### Scenario: A decoded backslash does not trigger recursion
- **WHEN** the visitor decodes `\u005Cu4F60`
- **THEN** the result is the literal six-character sequence `\u4F60`, rather than `你`

### Requirement: Encode valid text reversibly
The tool SHALL encode non-ASCII characters as fixed four-digit uppercase-hexadecimal Unicode escapes, using a high/low surrogate escape pair for supplementary characters. It SHALL retain printable ASCII by default except backslash, which MUST always become `\u005C`. ASCII controls U+0000–U+001F and U+007F MUST always be escaped. An initially unchecked option SHALL additionally escape all printable ASCII characters. For valid text whose encoded result also fits the decoding input limit, decoding its encoded representation SHALL reproduce the original text exactly. Encoding MUST NOT normalize or trim text or silently repair isolated surrogate code units.

#### Scenario: Default encoding preserves readable ASCII
- **WHEN** the visitor encodes `你好，Zero 😀` with the ASCII option unchecked
- **THEN** the result is `\u4F60\u597D\uFF0CZero \uD83D\uDE00`

#### Scenario: Printable ASCII can also be escaped
- **WHEN** the visitor encodes `A 你` with the ASCII option checked
- **THEN** the result is `\u0041\u0020\u4F60`

#### Scenario: Literal escape text survives a round trip
- **WHEN** the original text is the literal sequence `\u4F60` and the visitor encodes then decodes it within limits
- **THEN** encoding produces `\u005Cu4F60` and decoding restores the original literal sequence

#### Scenario: Actual controls differ from visible escape text
- **WHEN** the visitor encodes text containing an actual LF, an actual tab and a backslash followed by the letter `n`
- **THEN** these portions become `\u000A`, `\u0009` and `\u005Cn` respectively
- **AND** decoding restores the original distinct portions exactly

### Requirement: Strict failures identify original positions
An active malformed or incomplete Unicode escape, out-of-range brace value, brace surrogate value or isolated surrogate code unit SHALL fail the entire operation. Fixed high surrogate escapes MUST be immediately followed by fixed low surrogate escapes. The tool SHALL report the first failure with a localized reason and 1-based line/column in the original input, counting columns in UTF-16 code units and CRLF as one line break. Failures SHALL retain input and options and MUST NOT expose partial or stale successful results.

#### Scenario: Invalid escape forms fail
- **WHEN** the visitor decodes any of `\u12`, `\u12G4`, `\u{}`, `\u{1234567}`, `\u{110000}`, `\u{D800}`, `\uD800` or `\uDC00\uD800`
- **THEN** the whole operation fails with the reason and source location, and copying/downloading a successful result is unavailable

#### Scenario: Escaped malformed-looking text stays literal
- **WHEN** the input has two backslashes followed by `u12G4`
- **THEN** it is preserved as literal text without an invalid-escape error

#### Scenario: An error follows a supplementary character and a line break
- **WHEN** the input is `😀` followed by CRLF and then `a\u12G4`
- **THEN** the reported error starts at line 2, column 2

#### Scenario: Raw invalid UTF-16 is rejected
- **WHEN** either direction receives an isolated raw high or low surrogate code unit
- **THEN** it fails without replacing that unit with U+FFFD

### Requirement: Explicit conversion and safe result actions
The page SHALL expose labeled editable input and read-only output with default line numbers, two explicit direction buttons, the ASCII option, example insertion, clear, copy, TXT download and cancellation while processing. Conversion SHALL start only from an explicit direction action. Example insertion SHALL replace input and invalidate old work without automatically converting. Empty input SHALL produce a localized empty-input message. Input or option changes, new work, errors, cancellation and timeouts SHALL invalidate previous output and exports. A successful complete result SHALL be copyable or downloadable only by user action, with a copy-failure fallback. Downloaded TXT SHALL contain the complete UTF-8 result without an added BOM or truncation. Text MUST remain inert even when it contains HTML or script syntax.

#### Scenario: Input changes during conversion
- **WHEN** the visitor starts conversion and edits input or changes the ASCII option before completion
- **THEN** previous work is cancelled and late responses cannot restore an old result or enable old exports

#### Scenario: A script-like decoded result is exported
- **WHEN** valid input decodes to HTML/script-like text and the visitor copies or downloads it
- **THEN** the literal complete text is exported without execution, rendering as HTML or automatic downloads

#### Scenario: Copy fails or no input is supplied
- **WHEN** clipboard permission is denied for a successful result
- **THEN** a manual-copy fallback exposes that result without discarding input
- **AND** attempting conversion with empty input instead reports the empty-input state without a successful result

### Requirement: Processing is bounded and recoverable
Each operation SHALL accept at most 1,048,576 UTF-8 input bytes and produce at most 8,388,608 UTF-8 output bytes. Over-limit input/output MUST fail without truncation or partial success. Work SHALL avoid blocking page interaction, allow cancellation and stop after a 5-second deadline; timeout, cancellation and worker failure SHALL leave the source editable for retry. Clear and page exit SHALL release active work, retained content and result/download resources. Restoring the page from browser history MUST NOT restore cleared or departed tool content.

#### Scenario: A limit is exceeded
- **WHEN** input exceeds 1 MiB UTF-8 or a result would exceed 8 MiB UTF-8
- **THEN** processing fails with a localized limit message, source is retained and no truncated result is offered

#### Scenario: A slow or failed job is retried
- **WHEN** work exceeds 5 seconds, is cancelled or encounters a worker failure
- **THEN** no pending response can overwrite the current state, and a subsequent valid operation can succeed

#### Scenario: The visitor clears or leaves the page
- **WHEN** there is a result, active work, a download resource or manual-copy content and the visitor clears or leaves
- **THEN** those contents and resources are released, and late work or history restoration cannot repopulate them

### Requirement: Bilingual discovery and accessible workspace
The tool SHALL appear under development in both localized catalogs and searches with slug `unicode`, name “Unicode 转义转换 / Unicode escape converter” and descriptions covering Unicode-to-text and text-to-Unicode. `/tools/unicode/` and `/en/tools/unicode/` SHALL provide matching static steps, examples, limits and format explanations, language counterparts and canonical metadata. Sitemap and AI indexes SHALL include both production pages while preserving preview/error noindex and base-path behavior. The workspace SHALL support keyboard operation, visible focus, localized feedback, existing themes and narrow-screen vertical input/output layout without inaccessible controls.

#### Scenario: A crawler or visitor reads the page without JavaScript
- **WHEN** either localized page is opened without executable JavaScript
- **THEN** its purpose, supported syntax, examples, limits, local-processing boundary and counterpart link remain readable, without claiming an executable remote API

#### Scenario: A visitor uses a narrow screen and keyboard
- **WHEN** the tool is opened at 320 CSS pixels or at the existing 200-percent-zoom test layout
- **THEN** input and output stack vertically and all actions, options and status remain usable with keyboard and practical touch targets

### Requirement: Content privacy and existing feedback isolation
Tool input and results SHALL remain in current page memory and MUST NOT be put in URLs, persistent content storage, logging or feedback context. File import and content history SHALL be absent. Static asset loading SHALL remain distinct from computation, and wording MUST NOT promise first-visit offline operation or zero network requests. Any shared feedback entry SHALL retain the default-off, click-loaded cross-origin behavior, use only stable thread `tools/unicode` and locale context, and remain independent of conversion success. Both locales SHALL share that thread.

#### Scenario: Conversion takes place before feedback is opened
- **WHEN** the visitor converts text and has not activated feedback
- **THEN** no conversion content is uploaded, no content history is saved and no feedback connection is initiated

#### Scenario: Feedback is enabled but unavailable
- **WHEN** the visitor explicitly opens feedback for either locale and its service fails
- **THEN** no tool input or result is included in the request, and conversion, copy and TXT download remain usable
