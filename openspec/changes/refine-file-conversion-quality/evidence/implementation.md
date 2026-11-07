# Implementation and verification

Date: 2026-11-04. The maintainer instructed “先实现，后面我来验证”. Source implementation and automated evidence are recorded here; native UI, Windows runtime, editor edit/save/reopen and release acceptance remain reserved for the maintainer. The implementation stays in the existing checkout; no commit, push, spec sync, archive, signing or package approval was performed.

Latest follow-up: the maintainer’s local conversion timeout was traced to late Vite dependency optimization/page reloads. The fix and actual-file outcome (typed unsupported input in 2.127s, no successful private-document conversion) are recorded in [timeout-investigation.md](timeout-investigation.md). Latest frontend regression: 465 passed; focused Rust bridge regression: 14 passed. The checkpoint results below retain their original scope.

## Implemented behavior

- PDF content is reconstructed into typed paragraph/table/figure blocks with source dispositions, shared point-space transforms, coherent right-angle normalization and bounded reading-order decisions. Ruled grids produce actual DOCX tables with row/column merges and relative widths; table cell text is removed from the ordinary paragraph stream. Borderless three-column tables keep row order with `tableSimplified`; word fragments in two-column paragraphs do not get mistaken for table cells.
- The writer interleaves supported images with body blocks, preserves blank page sections and emits heading/alignment/indentation hints. Local vector graphics are rendered as bounded pictures with their labels, with explicit non-editable quality information. The [actual P06 DOCX media](P06-local-graphic.png) was extracted and visually inspected: plot axes/polyline, legend and fraction/radical labels remain visible. This is media/output inspection, not Word/LibreOffice pagination or editability acceptance.
- Region OCR shares the original job deadline and the host OCR worker. Rust validates caller, run/job/engine identity, page/region, finite in-page crop geometry and consistent page geometry; one-use leases enforce 16 regions/page, 24MP cumulative page pixels and 256MiB cumulative document upload. Raw PNG inputs retain existing dimension/32MiB limits. Existing reliable text overlays are deduplicated; required unrecognized scan content fails the entire job. Independently bounded PDF figures are retained. Residual ink inside a scan that cannot be proved to be a figure is conservatively rejected, including shaded scanned tables; it is not silently made into a picture-only body.
- Detected missing content, unsupported gradients/clipping/transparency/group content, invalid mappings, ambiguous figure/body overlap and unbacked invisible text fail before writing/commit. The engine still requires nonempty visible editable body and Rust keeps its minimum semantic/output gate. Original files and collision-free final commit remain owned by Rust.
- Bounded PDF font preflight reads actual subset font identities instead of generic renderer fallback aliases. DOCX theme/explicit/embedded candidates and system font probing, typed quality reports, renderer resource readiness and native print lifetime changes are detailed in [native-implementation.md](native-implementation.md). Font readiness and family matching do not establish complete glyph coverage or an external editor's actual substitution.
- Rust persists direction-specific provider preferences atomically, defaults to built-in even when unavailable, freezes all eligible batch jobs, and never falls back implicitly. Normal retry retains the job's provider; explicit provider retry revalidates input and availability. Main/tray share revisioned capability and complete queue snapshots; delayed job events cannot resurrect removed jobs. See [provider-review.md](provider-review.md).
- Windows staging export is implemented behind the explicit debug-only prototype switch. Release qualification remains closed. Windows mixed paper geometry currently fails explicitly rather than silently becoming Letter. The ready-to-run PowerShell instructions and COM binding evidence are in [native-implementation.md](native-implementation.md).
- Descriptor, engine, bridge, preparation and packaging candidate use version **1.3.0 / protocol 3**. Older packages cannot claim these leases/capabilities. The policy remains unapproved with empty approval/download lists and null package digest. Asset manifest SHA-256 is `103d7ae9f01ed397eea2ab39ea401f93ec475120260311097639b13cd01093e6`; it identifies prepared assets, not a signed package.

## IPC example

The implementation uses `FileConversionProviderSelectionRequest` with `expectedRevision` in addition to direction/provider. This avoids overwriting a newer choice from the other surface.

```rust
#[tauri::command]
pub async fn set_file_conversion_provider(
    window: tauri::WebviewWindow,
    input: FileConversionProviderSelectionRequest,
    app: tauri::AppHandle,
) -> Result<FileConversionCapabilitySnapshot, FileConversionError>;
```

```typescript
const snapshot = await invoke<FileConversionCapabilitySnapshot>(
  "set_file_conversion_provider",
  { input: { direction, providerId, expectedRevision } },
);
```

The command checks main/tray caller identity. Preference/capability updates and complete queue membership snapshots have independent monotonic revisions; job events retain their per-job revision plus queue revision. OCR/font/native-print IPC stays restricted to the isolated engine's active run.

## Verification results

| Check | Current result | What it establishes |
| --- | --- | --- |
| `pnpm test` | **462 passed, 0 failed** | Unit/source/contract/rendered-component checks, including actual PDF.js→DOCX output. |
| `pnpm build` | Passed, full profile, 99 plugin source modules | TypeScript and production frontend build; 6,517,815 frontend bytes in build-profile evidence. |
| `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json` | Passed; initial entry **270,306 B / 83,301 B gzip**, largest chunk **458,174 B** | Existing 285,000/90,000/820,000 B gates unchanged. File panel translations and the DOCX writer now load on demand. No historical performance evidence was overwritten. |
| Cargo fmt `--check` and Cargo check `--locked` | Passed | Current host Rust formatting/build contracts. |
| Cargo test `--locked --no-fail-fast -- --test-threads=1` outside sandbox | **451 passed, 0 failed, 3 ignored**, across 20 test targets | Host unit/integration/doc-test targets. Ignored tests remain ignored; this is not N01–N05 acceptance. |
| `scripts/verify-editable-pdf.mjs` with existing Node canvas bindings | **11 actual legacy conversions/error cases**, plus packaging-failure/cancel/deadline/password checks passed | Legacy corpus source bytes/manifest remain unchanged. Script explicitly supersedes two historical right-angle rejection targets and now requires actual table OOXML rather than mandatory table-simplification warnings. |
| Python fixture validator | 18 legacy + 22 quality input cases and 11 unexecuted scenario contracts passed | Input hashes, full source expectations, table/geometry/scenario contracts. It does not execute conversion targets. |
| `scripts/test_file_conversion_quality_fixtures.py` | **13 passed** | Mutation rejection, deterministic regeneration and unchanged legacy inputs. |
| `scripts/validate-file-quality-inputs.mjs` | **20 PDF input pages passed** | Real PDF.js full source-text/glyph mappings; no NUL/replacement mappings. |
| `scripts/verify-file-engine-packaging.mjs` | Passed | Exact candidate/components/asset manifest and existing 20MiB compressed / 45MiB installed budgets; candidate remains unapproved. Prepared assets: **4,832,129 B installed / 2,475,058 B per-file gzip**. |
| Strict OpenSpec and `git diff --check` | Passed; **40 OpenSpec items** | Artifact validity/whitespace, independently of implementation/native acceptance. |

The real-output tests compare full normalized expected editable body, sequence, headings/indentation, `w:tbl`, gridSpan/vMerge, blank sections, image relationships/order, and absence of hidden text/OMML/chart objects. P08/P10/P12 use a controlled recognizer with real parsed/rasterized source and actual DOCX output: they establish region mapping/merging/cleanup, **not native OCR recognition accuracy**. Missing providers, unreadable scans, invalid/password inputs, ambiguity and cancellation are separately tested before packaging.

## Review findings and corrected failures

The independent [runtime review](runtime-review.md) first reproduced three important false successes with actual PDFs: missing shading, clipped text becoming visible, and a title hiding unrecognized shaded-table body. Regression cases now reject each before output. Unknown visibility operators, clipping and unbacked invisible text are conservatively unsupported. Text overlay prechecks only accept complete residual coverage; unresolved scan ink cannot be promoted into a graphical fallback. A word-fragmented-column regression also prevents false row-major table ordering. Ruled-table background fills aligned to the recognized grid are accounted as table decoration rather than overlapping figures; the legacy rich-layout output test covers that case.

The initial sandbox Cargo run was **337 passed / 2 failed / 2 ignored**: the system Vision test returned `RecognitionFailed`, and a private-pasteboard test reported the native pasteboard unavailable. The targeted serial Vision rerun still failed in sandbox. An authorized outside-sandbox serial run passed both native unit tests, then exposed the stale File 1.2.0 registry assertion, which was updated to 1.3.0. A subsequent run encountered one existing two-second process-runner timeout. The final full serial run above passed without weakening, excluding or extending any tests. These earlier results are preserved here rather than represented as an uninterrupted green run.

Fixture regeneration also caught a two-pixel raster-kerning difference when rebuilding the temporary Python environment. The generator now explicitly selects Pillow's BASIC layout engine instead of depending on wheel-specific RAQM availability; the new quality scan inputs/manifest were regenerated, and the exact reproduction tests passed. Legacy files and their manifest are unchanged. The pinned fixture dependencies remain outside the application/runtime.

## Acceptance still pending

The source portions of all planned areas are present; checkboxes requiring actual native/export/editor evidence remain open. In particular:

- N01 macOS picker/drop/queue/provider/cancel/open/reveal flow, quality UI/language changes and actual exported pagination/readability.
- N02/N03 real Windows WebView2 hidden export, runtime-interface absence, cold first start, A4/Letter, explicit mixed-paper rejection, long-table/notes/images, cancellation followed by the next task, qualified OCR assets and 100%/150% scaling.
- N04/N05 real Word/LibreOffice paragraph/table/merge edit-save-reopen and each explicitly installed provider's export/permission/activation failures. Media extraction and OOXML checks do not close these tasks.
- F01–F04 actual font/glyph/substitution/resource behavior on each output route; family probes and controlled rendering tests alone cannot prove readable glyphs or exact pagination.
- R01 exact signed artifact, digest/signature, offline installed smoke, package/memory/ready/cancel measurements and rollback/repair, under a separate authorized release workflow.

The conflict precedence remains the table in [design.md](../design.md): default explicit selection supersedes old auto-routing; actual supported ruled tables supersede flattening; local pictures never restore whole-page facsimile fallback; shared OCR platform availability follows the current provider rather than old macOS-only descriptions. No old delta, old task list, main spec or historical evidence was synced/archived/marked complete.
