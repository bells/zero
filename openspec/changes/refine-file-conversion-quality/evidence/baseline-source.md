# Implementation source baseline

Date: 2026-11-03. Baseline commit: `6068c69e9f4bc3dd49df462d650bcde0ddf039f0`. This is the **before-change source** record. Subsequent files in the working tree may implement improvements; neither this baseline nor the proposal proves native or released behavior.

## Owning sources and observed boundaries

| Concern | Owning baseline source | Consequence for this change |
| --- | --- | --- |
| PDF interpretation | [pdfToDocx.ts](../../../../src/plugins/file/engine/pdfToDocx.ts), [pdfComplexity.ts](../../../../src/plugins/file/engine/pdfComplexity.ts) | PDF.js text/image operations and bounded text reconstruction exist; nonzero rotation fails and OCR is requested for pages without text. Same-page scan body needs new content accounting. |
| OOXML | [editableDocx.ts](../../../../src/plugins/file/engine/editableDocx.ts) | Editable paragraphs and page sections exist. There is no native table output or interleaved figure model at the baseline. A text-only table test cannot demonstrate true table support. |
| DOCX layout/native PDF | [docxToPdf.ts](../../../../src/plugins/file/engine/docxToPdf.ts), [native_print.rs](../../../../src-tauri/src/services/file/native_print.rs) | macOS WKWebView/PDFKit capture is implemented. Non-macOS native exporter availability returns false. Windows COM bindings in the lockfile do not establish a working exporter. |
| Provider selection | [provider.rs](../../../../src-tauri/src/services/file/provider.rs), [capabilities.rs](../../../../src-tauri/src/services/file/capabilities.rs) | Fixed provider routing precedes this change; installed compatibility providers are not an authorization to silently change a user selection. |
| Shared OCR | [File bridge](../../../../src-tauri/src/services/file/engine_bridge/ocr.rs), [provider dispatch](../../../../src-tauri/src/services/ocr/mod.rs), [Windows adapter](../../../../src-tauri/src/services/ocr/windows.rs) | File already calls the shared service. Windows PaddleOCR code exists and discovers prepared model/DLL assets. There is no need for a second File OCR runtime. Availability and device quality still depend on actual assets/runtime. |
| Released identity | [policy](../../../../src-tauri/file-engine-policy.json), [guide](../../../../docs/plugins/zero-file-offline-engines.md) | Baseline candidate 1.2.0/protocol 2 is unapproved; approved package list empty. Debug source fallback is not a signed package. |

Use `git show 6068c69:<repository-relative path>` to inspect the immutable baseline; relative links above intentionally identify the owning file in the current checkout. Baseline facts were checked against that commit and lockfiles, rather than copied from the older project memory's Windows OCR limitation.

## Reference implementation and licensing

[Filee fixed commit](https://github.com/KnifeLemon/Filee/commit/31438ee8d36151c1f256a98695aa20a093fdee7a) remains the comparison pointer in [research](../research.md). Its layout/table/font/test source pointers identify specific code to inspect. This fixture work copies no Filee source, imports no .NET/HWPX/rhwp stack, and makes no claim to have run the Filee application or measured comparative quality. Upstream dependency licenses are not inferred from the repository's top-level MIT license. Nontrivial future porting must record actual copied source and notices.

## Delta precedence, scoped to this change

The mapping in [design](../design.md) remains authoritative. Existing scenario names are preserved in their owning old deltas:

- [add-file-plugin](../../add-file-plugin/specs/file-conversion-workflow/spec.md): `User retries a failed job`, `No conversion engine is installed`, `User-installed provider is selected`, `Scanned PDF is rejected`. New selection and OCR behavior supplements the old validation, queue and safe-output guarantees; old automatic routing cannot override explicit selection.
- [offline engine](../../bundle-zero-file-offline-engines/specs/zero-file-offline-engines/spec.md): whole-page image fallback remains prohibited; new local figures do not reinstate it.
- [editable conversion](../../refine-zero-file-editable-conversion/specs/editable-pdf-to-docx/spec.md): supported ruled tables now require table OOXML, while unrecoverable content must still fail.
- [shared OCR](../../enhance-snap-and-share-offline-ocr/specs/file-scanned-pdf-ocr/spec.md): supported printed scans, missing-provider and cancellation guarantees continue; bounded same-page regions refine page-only OCR without expanding Snap authority.

No old task, delta, main spec or historical evidence is synchronized, archived or marked passed by this baseline review.
