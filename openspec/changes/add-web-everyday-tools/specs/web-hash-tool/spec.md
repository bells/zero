## Purpose

Allow browser-local byte-accurate text and file fingerprinting with four explicit algorithms and expected-digest checking, while bounding file processing and avoiding ambiguous security claims.

## ADDED Requirements

### Requirement: Exact-byte digests with explicit algorithms
The tool SHALL provide MD5, SHA-1, SHA-256 and SHA-512, defaulting to SHA-256 and one selected algorithm per execution. Valid Unicode text SHALL be encoded as its exact UTF-8 bytes without trimming, normalization or newline rewriting. Files SHALL be hashed as original bytes. Empty text and zero-byte files SHALL be valid. Results SHALL identify the algorithm and show a lowercase hexadecimal digest. MD5 and SHA-1 guidance SHALL explain their collision limitations and checksum use.

#### Scenario: Empty inputs have standard digests
- **WHEN** empty text or a zero-byte file is hashed with SHA-256
- **THEN** both produce the standard SHA-256 digest for an empty byte sequence
- **AND** whitespace or newline additions change the digest

### Requirement: Expected-digest comparison
An optional expected digest SHALL accept leading or trailing ASCII whitespace and either hexadecimal letter case. It SHALL have the exact hexadecimal length of the selected algorithm. Invalid expected input SHALL be reported separately from a valid but mismatching digest. Comparing a valid expected digest SHALL show an explicit match or mismatch for the current result.

#### Scenario: Uppercase expected digest matches
- **WHEN** the visitor supplies the current digest in uppercase with surrounding ASCII whitespace
- **THEN** the comparison reports a match
- **AND** a non-hexadecimal character produces an input error

### Requirement: Bounded local files and stale-state prevention
Text input SHALL have a 1 MiB UTF-8 limit and a five-second computation deadline. One file of at most 256 MiB SHALL be accepted, processed with reads of at most 1 MiB and a 60-second end-to-end deadline. File bytes SHALL be processed incrementally without loading the entire file into one application buffer. Mode, algorithm, file or source changes SHALL invalidate the current digest and comparison. Copy and TXT download SHALL identify the current algorithm and digest.

#### Scenario: Visitor replaces a hashing file
- **WHEN** the visitor selects another file while hashing is pending
- **THEN** the earlier operation is cancelled and its late digest cannot replace the new state
- **AND** its file and temporary buffers are released
