## Purpose

Provide strict JSON validation, readable formatting and compact output for browser users while preserving document information, locating errors precisely and keeping editing accessible when optional enhancements fail.

## ADDED Requirements

### Requirement: Strict and information-preserving transformations
The tool SHALL validate strict JSON including any valid top-level JSON value, format with two-space indentation and compact by removing only insignificant whitespace. It MUST preserve key order, duplicate keys, string contents and numeric lexemes including integers beyond JavaScript's safe integer range. Comments and trailing commas MUST be rejected. Copy and clear SHALL be explicit actions; clear MUST invalidate running tasks and old output.

#### Scenario: Formatting preserves a large integer and duplicate keys
- **WHEN** a visitor formats then compacts `{"id":9007199254740993,"a":1,"a":2,"n":1e+03}`
- **THEN** the integer, both `a` members, their order and `1e+03` remain unchanged in meaning and lexical value
- **AND** no member is silently removed or number rounded

#### Scenario: Non-object valid JSON is accepted
- **WHEN** a visitor validates an array, string, number, boolean or null as the complete document
- **THEN** the tool accepts and transforms it under the same preservation rules

### Requirement: Localized errors with precise positions
Invalid JSON SHALL produce a localized reason and 1-based line/column corresponding to the source input, including CRLF and Unicode text. The tool MUST retain original input and prevent copying stale output. Enhanced editing SHALL mark the same source location; basic mode MUST expose textual position information.

#### Scenario: Syntax error follows a multibyte string on a CRLF line
- **WHEN** invalid JSON containing Unicode and CRLF is validated
- **THEN** the reported line/column identifies the erroneous source position consistently with the editor
- **AND** no previous valid output remains presented as the current copyable result

### Requirement: One-layer JSON string unescaping
The unescape action SHALL accept a valid top-level JSON string only when decoding it once yields a valid JSON document. Success SHALL replace the input with that once-decoded document. Other input MUST remain unchanged with explanatory feedback; the tool MUST NOT delete backslashes indiscriminately, recursively unwrap strings or execute input.

#### Scenario: Visitor unwraps one encoded document
- **WHEN** the input is `"{\"a\":1}"` and the visitor selects unescape
- **THEN** the input becomes `{"a":1}` through exactly one decoding operation

#### Scenario: Ordinary JSON or a non-document string is not destructively unescaped
- **WHEN** the visitor selects unescape on `{"path":"C:\\temp"}` or on `"hello"`
- **THEN** input stays unchanged and the tool explains why it cannot produce a decoded JSON document

### Requirement: Accessible syntax highlighting and folding enhancement
JSON editing SHALL offer syntax highlighting, node folding/unfolding and source error marks through a user-triggered enhancement. Loading or failure MUST preserve existing content and usable basic input; controls MUST remain keyboard accessible and long content MUST scroll within its workspace. The published input/depth limits SHALL apply in basic and enhanced modes.

#### Scenario: Editor enhancement fails after text entry
- **WHEN** the visitor has entered JSON and enhancement cannot load
- **THEN** input remains available in basic mode with working validate/format/compact/copy/clear controls
- **AND** the error is recoverable without re-entering the document
