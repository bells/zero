## Purpose

Make the four existing browser tools understandable through search snippets, static instructions and browser-agent guidance without changing their computation or adding remote APIs.

## ADDED Requirements

### Requirement: Search metadata identifies tool capabilities
The bilingual directory SHALL describe JSON formatting/validation, timestamp conversion, Base64/URL encoding and text comparison. Each tool SHALL have a localized capability-specific search title while retaining its concise navigation name, canonical URL and language counterpart. Metadata MUST NOT claim unsupported actions or guaranteed search ranking.

#### Scenario: Search crawler reads a tool without JavaScript
- **WHEN** a crawler fetches a tool or directory HTML document
- **THEN** its title and description identify the actual tool capabilities
- **AND** the existing 28 indexable routes and noindex error/preview behavior remain intact

### Requirement: Steps and examples share the tool content source
Each tool SHALL pre-render ordered operating steps and labeled input/output examples with stable steps/examples anchors. The AI full-text index SHALL include the same content, preserving whitespace in examples. Examples SHALL match actual tool behavior; a text-diff illustration MUST identify its two input sides and illustrative output rather than imply a downloadable patch format.

#### Scenario: Visitor checks JSON precision using the example
- **WHEN** a visitor reads the JSON example in HTML or the AI full-text index
- **THEN** both show the same large integer and two-space formatted output
- **AND** the example is verified against the actual formatter

### Requirement: Browser-agent guidance explains execution boundaries
Each tool SHALL expose static guidance describing its input method, supported actions, result surface and limits. Guidance SHALL use actual page labels, distinguish browser interaction from HTTP APIs, and explain JavaScript/network requirements and local content processing. HTML, WebApplication feature lists and AI full-text guidance SHALL derive from the shared tool registry. No input or result MAY be encoded in discovery URLs.

#### Scenario: Agent executes a tool through browser controls
- **WHEN** an agent reads the JSON instructions, fills the labeled input and activates Format
- **THEN** the documented result surface contains the expected output
- **AND** the instructions describe current-result/error handling without claiming a remote computation endpoint
