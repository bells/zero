# Real desktop Safari acceptance — 2026-10-23

Tested the production preview at `http://127.0.0.1:4321/tools/markdown/` in installed Safari 27.0.1 on macOS 27.0.1 (26A434), through native accessibility controls and screenshots. Safari WebDriver remained unavailable because Allow Remote Automation was disabled; that setting was not changed. Native UI automation supplied this acceptance instead.

Only synthetic content was used. A UTF-8 `.md` fixture contained the heading `Safari 中文验收`, an English paragraph, one same-origin `/social.png` reference, a two-column 90-row Chinese table, 100 `const value = 42;` code lines and `SAFARI_END_SENTINEL`. The file was selected through Safari's ordinary file picker. Its UI labels the picker confirmation “上传”; the page itself reads the chosen file locally, with no upload endpoint.

| Flow | Observed result |
| --- | --- |
| Import and preview | File picker opened the UTF-8 fixture; heading/table/code appeared in split preview; source statistics showed 3,827 code points |
| Enhanced editing | CodeMirror loaded and exposed the original source as an editable native accessibility text area, both before and after draft restoration |
| Draft | Saving initially off; explicit opt-in reported saved. Reload returned an empty document with saving off. Explicit restore recovered the fixture and displayed that images still required permission |
| Image consent | Before consent, preview showed `[本站测试图片]`. Explicit Load image displayed the image and Loaded state. After restoration it was blocked again until re-authorized |
| HTML download and open | Accepted the ordinary local-origin download prompt. Downloads list showed a completed HTML. Opened that local file in Safari: Chinese heading, table and embedded image were visible |
| PDF download and open | Separate Download PDF produced a completed 69,189-byte file, opened directly in Safari's PDF reader with six pages |
| Chinese PDF search | Native Find for `中文行89` reported `1个匹配项` and navigated to the corresponding table row; PDF text was exposed by the native reader |
| Independent print | Print opened an eight-page A4 portrait browser print preview of the document, image, table and continued code without editor/site controls. No printer was selected; printing was cancelled |
| Cleanup | Turning draft saving off reported deletion while retaining source; clearing the synthetic document left zero characters and saving off |

Independent pypdf inspection of the actual Safari download confirmed all 90 Chinese rows, all 100 code lines, the end sentinel, one embedded image and no NUL text. The 94,705-byte HTML contained a data PNG, no script, and no automatic source-image URL. This is the actual downloaded-file check, in addition to native opening and Chinese search. Direct PDF and browser print have different layouts/page counts by design. Safari's own optional print headers/footers remained enabled in the print dialog; they are not present in the directly generated PDF.

Retained screenshots: [Safari PDF](screenshots/safari-pdf.png), showing Chinese table rows and code in the native PDF reader; [Safari print](screenshots/safari-print.png), showing the document-only print preview. Synthetic HTML/PDF downloads remain available in the local Downloads folder; no user file was modified or removed.

This establishes the representative desktop Safari flows in task 8.4. It does not establish real iPhone behavior, arbitrary glyph coverage, every remote CORS origin, mobile peak/reclamation, all documents at the published limits, or hosted deployment. Task 8.5 remains open.
