## Purpose

Generate bounded batches of passwords locally from a cryptographically secure random source, with explicit character-group guarantees and no automatic content persistence or exposure.

## ADDED Requirements

### Requirement: Explicit bounded generation controls
The tool SHALL offer lengths 8 through 128 and batch counts 1 through 100. Selectable groups SHALL be ASCII uppercase letters, lowercase letters, digits and the fixed symbols !@#$%^&*()-_=+[]{}?. Defaults SHALL be length 20, count 1, uppercase, lowercase and digits. At least one group SHALL be selected and every generated password SHALL contain at least one character from every selected group. Generation SHALL require an explicit action.

#### Scenario: Visitor generates a selected batch
- **WHEN** the visitor generates five 20-character passwords with uppercase and digits selected
- **THEN** every result has 20 characters drawn from those groups and includes both groups
- **AND** changing a control invalidates the previous batch

### Requirement: Unbiased cryptographic sampling
Generation SHALL use the browser cryptographic random source with unbiased sampling over the allowed character set and a uniform distribution conditioned on the required character groups. An unavailable or failing secure random source SHALL produce an error. Execution SHALL have a five-second deadline and at most 10,000 candidate attempts per batch, reporting explicit failure upon exhaustion.

#### Scenario: Secure randomness is unavailable
- **WHEN** the cryptographic random source fails
- **THEN** generation reports failure and exposes no new password batch
- **AND** it does not fall back to a non-cryptographic random source

### Requirement: Explicit local result access and disposal
The tool SHALL offer per-password and complete-batch copy plus an explicit UTF-8 TXT download with one password per line. Results, settings and manual-copy content SHALL remain in page memory and follow the common invalidation and disposal rules. Page load SHALL contain no generated passwords, and copying or downloading SHALL require explicit user action.

#### Scenario: Visitor clears a generated batch
- **WHEN** the visitor clears the tool or leaves the page
- **THEN** generated passwords, fallback-copy content and download resources are released
- **AND** browser-history restoration cannot revive the earlier batch
