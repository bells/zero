# Zero File engine third-party notices

Zero File redistributes only browser assets and JavaScript code from the pinned packages below. The exact package versions are locked in `pnpm-lock.yaml`; release builds copy their license texts into the engine bundle.

## Direct components

| Component | Version | License | Upstream revision |
| --- | --- | --- | --- |
| pdfjs-dist | 6.2.108 | Apache-2.0 | `0365cbde028bd92e58f2dab1bb70cd30ac7acfd7` |
| docx | 9.7.1 | MIT | `4934d310c724520ad9d3e7e6d5d47430664ea9f7` |
| docx-preview | 0.4.0 | Apache-2.0 | `191d3e0db009da578fbe4da70d55305cd8d50226` |

## Runtime transitive components

The `docx` and `docx-preview` browser bundles resolve the following pinned runtime dependencies. Dual-licensed packages are used under the permissive license named first.

| Component | Version | License used |
| --- | --- | --- |
| hash.js | 1.1.7 | MIT |
| inherits | 2.0.4 | ISC |
| minimalistic-assert | 1.0.1 | ISC |
| jszip | 3.10.1 | MIT |
| lie | 3.3.0 | MIT |
| immediate | 3.0.6 | MIT |
| pako | 1.0.11 | MIT and Zlib |
| readable-stream | 2.3.8 | MIT |
| core-util-is | 1.0.3 | MIT |
| isarray | 1.0.0 | MIT |
| process-nextick-args | 2.0.1 | MIT |
| safe-buffer | 5.1.2 | MIT |
| string_decoder | 1.1.1 | MIT |
| util-deprecate | 1.0.2 | MIT |
| setimmediate | 1.0.5 | MIT |
| nanoid | 5.1.16 | MIT |
| xml | 1.0.1 | MIT |
| xml-js | 1.6.11 | MIT |
| sax | 1.6.1 | BlueOak-1.0.0 |

`@types/node` is a type-only dependency of `docx` and is not emitted into the runtime engine bundle. PDF.js's optional Node canvas dependency is not installed into or copied to the browser engine bundle.

No Python runtime, PyMuPDF, OpenCV, LibreOffice, ONLYOFFICE, Chromium, or Microsoft Office component is redistributed by Zero File.

## Host system adapters

Candidate 1.3.0 / host protocol 3 uses macOS WebKit/PDFKit for native PDF capture and CoreText/CoreFoundation for local font-family probing. Windows font probing uses DirectWrite through the existing `windows` 0.52.0 host binding (MIT OR Apache-2.0). These system frameworks and installed system fonts are not copied into the File engine assets; missing fonts are not downloaded automatically.

The staged Windows printing adapter uses the already locked `webview2-com` 0.38.2 host binding (MIT), with its `windows` 0.61.3 dependency (MIT OR Apache-2.0). The adapter depends on the installed system WebView2 runtime, which is not redistributed by this package. Its device qualification gate remains closed; the presence of these bindings is not a Windows export support claim.

OCR remains the shared host service: Apple Vision on macOS and the existing local Windows adapter subject to separately provisioned model/DLL assets and their own notices. This refinement adds no recognition model or OCR runtime to the File browser asset bundle. Fixture-only Python libraries and the synthetic corpus are test tooling, not redistributed production conversion components.
