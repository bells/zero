## Purpose

Provide a bilingual browser-local comparison workflow for two text sources or UTF-8 text files, with understandable line and inline differences, accessible navigation, bounded processing and integration into the existing Zero online toolbox.

## ADDED Requirements

### Requirement: Two editable sources accept local text files
The tool SHALL provide labeled original and changed text inputs, each with line-number assistance and an Open file action, plus example, swap, clear and explicit Find differences controls. Either source SHALL accept pasted text or one local UTF-8 text file with optional UTF-8 BOM. Successful reads SHALL replace only the chosen side, display its basename and remain editable. Editing loaded content SHALL clear the file-origin label. A cancelled picker or failed read MUST retain the previous source. Comparisons MUST NOT run automatically on editing or file selection.

Files SHALL be checked against byte limits before reading and decoded strictly. Invalid UTF-8, NUL content and recognized common binary/container signatures such as PDF, PNG, JPEG and ZIP/Office MUST produce a localized unsupported-text error, without relying only on extension/MIME or promising exhaustive binary detection. Pasted NUL content MUST also be rejected. Pages MUST state UTF-8 text support and exclusion of image, PDF, Word, Excel and folder comparison; incompatible encodings MUST NOT silently become replacement-character text.

#### Scenario: A file is compared with pasted content
- **WHEN** a visitor opens a valid UTF-8 JSON file on the original side, pastes edited JSON on the changed side and clicks Find differences
- **THEN** both sources are compared as text without upload or JSON normalization
- **AND** editing the original source retains its editable content while clearing the filename label

#### Scenario: Unsupported files do not replace source content
- **WHEN** a visitor selects invalid UTF-8, a NUL-containing file or a recognized PDF/ZIP file
- **THEN** the previous side remains unchanged and a localized UTF-8-text guidance message appears
- **AND** cancelling the file picker also leaves the previous source unchanged

### Requirement: Comparison has explicit newline and empty-input semantics
Comparison SHALL be case- and whitespace-sensitive, except that CRLF and CR separators SHALL be treated as LF. It MUST preserve final-newline presence, other whitespace and Unicode code points without Unicode normalization. A leading UTF-8 encoding BOM SHALL be consumed when reading files. The interface SHALL disclose newline normalization and explicitly mark a final-newline difference.

Empty versus empty SHALL return identical; empty versus nonempty SHALL return all additions or all deletions according to direction. Results SHALL expose original/changed line numbers, added/deleted line counts and contiguous difference-block counts. Replacements SHALL count as deletions plus additions; no unique semantic pairing or move detection is promised.

#### Scenario: Newline style alone differs
- **WHEN** `alpha\r\nbeta\r\n` is compared with `alpha\nbeta\n`
- **THEN** the result reports identical content with zero differences and explains normalized line endings

#### Scenario: Final newline and whitespace remain significant
- **WHEN** `alpha\n` is compared with `alpha`, or `alpha ` with `alpha`
- **THEN** the result identifies a difference rather than trimming it away
- **AND** final-newline differences have an explicit visible marker

#### Scenario: Empty sources have defined results
- **WHEN** both sources are empty
- **THEN** the result reports identical without an error
- **AND** comparing empty original text with `alpha\n` reports its line as an addition, while swapping reports a deletion

### Requirement: Results show line and bounded inline differences
Completed comparisons SHALL show equal, added and deleted lines, with inline highlighting for sequentially paired changed lines within a difference block. Inline segments MUST NOT split UTF-16 surrogate pairs. A pair with either line exceeding 4,096 Unicode code points, or a pair that would exceed a 100,000-code-point cumulative inline budget, SHALL fall back to whole-line highlighting with an explicit partial-inline notice, retaining the full line-level result.

The tool SHALL provide side-by-side and unified views without recomputation, defaulting to unified at viewport widths of 720 CSS pixels or less. Side-by-side result panes SHALL synchronize vertical scrolling. Additions/deletions MUST have textual markers or accessible labels beyond color, and display correct source line numbers without numbering alignment placeholders as real lines. User content MUST be displayed as text, never executed as HTML.

#### Scenario: Replacement and script-like text are displayed safely
- **WHEN** one line changes from `hello world` to `hello Zero` and another contains `<script>alert(1)</script>`
- **THEN** the result shows the removed/added line and its changed text segments with original/changed line numbers
- **AND** the script-like source remains visible text without script execution

#### Scenario: Long lines receive an honest fallback
- **WHEN** a changed pair exceeds the per-line or cumulative inline budget
- **THEN** the affected lines retain complete line-level comparison with a notice that inline highlighting was limited
- **AND** emoji surrogate pairs are never split into invalid segment boundaries

### Requirement: Difference navigation and rendering remain accessible and bounded
The tool SHALL show a current/total difference-block indicator and previous/next controls with disabled boundaries, without wrapping. Navigation MUST reveal the target block even across folded or paged sections and announce concise state without reading the whole document. Identical results SHALL explicitly report no differences and disable difference navigation.

Results SHALL show three context lines around changes by default and identify omitted equal sections with accurate counts and a means of inspecting them. The mounted result SHALL be bounded to 400 text rows across both sides and 200 KiB UTF-8 of source text at a time, including segmented or progressively revealed long lines; it MUST NOT silently truncate the complete comparison model. Essential controls SHALL support keyboard use, visible focus, 44 CSS pixel targets, light/dark themes, WCAG AA contrast and 320 CSS pixel/200 percent zoom layouts without page-wide horizontal overflow. Horizontal scrolling MAY occur inside text containers.

#### Scenario: Visitor navigates a distant difference
- **WHEN** a visitor uses Next difference to reach a block outside the mounted result window
- **THEN** that block becomes visible with correct line numbers and a current/total update
- **AND** rendering remains within both row and source-byte bounds, with Previous available and Next disabled at the last block

#### Scenario: Narrow-screen keyboard visitor reads the result
- **WHEN** a visitor compares content at 320 CSS pixels using keyboard controls in dark theme
- **THEN** unified results, source labels, change markers and focus remain readable and operable
- **AND** long content scrolls within its container without forcing the entire page sideways

### Requirement: File reads and comparisons have safe lifecycles and limits
Each source SHALL be limited to 1 MiB UTF-8 and 20,000 logical lines; combined input SHALL not exceed 2 MiB. Line counting SHALL exclude one final separator-created empty element. Result data including text segments and metadata MUST fit within 8 MiB serialized UTF-8, with resource-limit errors instead of truncated success. Limits SHALL be published and enforced before expensive reading/comparison or unbounded result construction.

Each file read and comparison SHALL have a 5-second timeout and be cancellable while editing/navigation remain responsive. Comparing SHALL be unavailable during any active read. Source edits, new file selection, swap, clear, new execution, cancellation, failure and page exit MUST invalidate old results/statistics/navigation and reject late reads or completions. Failures SHALL retain source text. Only the latest completed valid comparison can activate results.

#### Scenario: A late file read cannot overwrite an edit
- **WHEN** a visitor starts reading a file and then edits that side, selects another file, swaps sources or clears the tool
- **THEN** the abandoned read cannot replace current source content or restore old statistics
- **AND** a fresh explicit comparison is required for current results

#### Scenario: Large or expensive comparisons fail without freezing navigation
- **WHEN** an input exceeds its byte/line bound, result construction exceeds 8 MiB, or a comparison reaches 5 seconds
- **THEN** the tool reports a localized limit/timeout error without claiming a complete comparison
- **AND** source text, clear, retry, cancel and navigation remain usable as appropriate

### Requirement: Comparison contents stay local and ephemeral
Text, file names, file contents and comparison results MUST remain in current-page memory and MUST NOT be uploaded, logged, included in URLs, sent to telemetry or persisted to site storage. Only existing theme-enum storage is permitted. Tool code MUST NOT fetch user-content URLs or use third-party runtime resources. Clear and page exit SHALL release file references, pending work and comparison state. Privacy copy MUST distinguish local processing from first-visit offline operation and absolute security claims.

#### Scenario: Synthetic private file contents do not leave the page
- **WHEN** a synthetic private filename and marker are compared with URL-like and HTML-like content, then cleared or navigated away
- **THEN** network, URL, logging and site-storage observations contain no filename or marker and no user-content URL is fetched
- **AND** associated sources, results, file references and pending work are released

### Requirement: The fourth tool integrates into bilingual discovery without regressions
The website SHALL serve `/tools/diff/` and `/en/tools/diff/` and list four online tools in localized directories, tool navigation and keyboard search, extending the preceding three-tool baseline. Language switching SHALL reach the equivalent route, and all routes/assets/worker resources SHALL respect configured site base. Existing timestamp/JSON/Base64 behavior and five desktop-documentation URLs MUST remain available.

Both diff pages SHALL pre-render unique title/description, one H1, instructions, example, UTF-8/file-format scope, newline semantics, limits, privacy and FAQ. Timestamp pages SHALL describe batch behavior and export format. Canonical/hreflang, sitemap, WebApplication structured data and generated AI indexes SHALL include the new tool; expected indexable HTML SHALL increase from 26 to 28. Preview/noindex, error-page exclusion, truthful desktop CTA and no-JavaScript navigation/content MUST remain intact. No JavaScript computation SHALL be claimed when scripts are disabled.

The independent static website SHALL retain initial executable JS gzip ≤50 KiB and first-viewport resources ≤1 MiB on the new/updated tool pages and directory. Fixed mobile laboratory targets SHALL remain performance/accessibility ≥95, LCP ≤2.5s and CLS ≤0.1. Comparison algorithm resources SHALL load only after explicit comparison, and product/desktop documentation pages MUST NOT acquire tool algorithm/editor dependencies.

#### Scenario: A visitor discovers and changes language under a site base
- **WHEN** a visitor searches for the comparison tool from `/zero-preview/tools/` and changes language on its page
- **THEN** search includes all four online tools and navigation reaches `/zero-preview/en/tools/diff/` with working local assets and comparison
- **AND** old desktop documentation links remain unchanged

#### Scenario: Static crawlers and no-script visitors see accurate content
- **WHEN** the new pages are loaded without JavaScript or inspected in the generated sitemap/AI indexes
- **THEN** localized meaningful content and reciprocal discovery links identify a browser text-comparison tool, with limits and exclusions
- **AND** computation is identified as requiring JavaScript, previews/errors remain excluded and desktop delivery claims are unchanged

#### Scenario: Algorithm loading respects initial-page budgets
- **WHEN** a visitor loads a directory or tool page before clicking Find differences
- **THEN** actual automatically loaded executable assets fit the existing initial budget and do not include comparison algorithm resources
- **AND** a later comparison keeps cancellation and navigation usable
