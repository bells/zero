# Independent runtime review

Review date: 2026-11-04. Scope: current PDF drawing/model/OCR/DOCX writer and Rust engine/print/font/quality boundaries. Native device/editor/release acceptance was reserved by the user and was not executed. Passed broad suites were not rerun. This is a pre-fix review snapshot: root is addressing the first two findings concurrently; it must record its own regression results.

## Findings

### R1 — P1: Unknown visible painting operators disappear while conversion succeeds

Location: `src/plugins/file/engine/pdfDrawing.ts:32` (operator dispatch; no `OPS.shadingFill` branch or unsupported-content fallback).

A real PDF containing two text paragraphs with an axial shading graphic between them produces `shadingFill` in PDF.js's operator list, but `extractPdfDrawing` returns `{lines:[], vectors:[], images:[]}`. Conversion succeeds and the actual DOCX contains only the before/after text, zero media files, and no graphical-content warning. Tracking extracted text identities cannot detect this loss because the omitted painting operation never enters the model.

Repro below generates `/tmp/review-gradient-figure.pdf` and actual `.docx`. Expected: bounded local preservation or `unsupportedInput`; observed: editable success with missing graphic. Other unsupported painting operators need an explicit accounting/rejection policy, rather than a blanket ignore.

### R2 — P1: Clipped-away text becomes visible editable output

Location: `src/plugins/file/engine/pdfToDocx.ts:65-80`, together with ignored `clip`/`eoClip` in `pdfDrawing.ts`.

`getTextContent()` is not a visibility filter. A page with `q 10 10 10 10 re W n`, followed by text at `(50,600)` outside that clip, yields the clipped text in extraction. The current implementation calls every extracted nonempty item visible and writes it into DOCX. The actual output contains `Visible body` and `Invisible clipped secret`, although the second string does not render in the source PDF. This corrupts visible-text fidelity and can expose intentionally hidden or clipped content when sharing a converted document. This is not secure PDF redaction, but conversion must still avoid turning nonvisible source text into visible output.

Repro below generates `/tmp/review-clipped-text.pdf` and actual `.docx`. Expected: conservatively reject unsupported clipping or faithfully account for visible text; observed: success exposing clipped text. Text rendering modes, transparency and visibility state require equivalent consideration; scan OCR overlays need their own verified ownership rather than an unrestricted invisible-text exception.

### R3 — P1: A digital title suppresses OCR for required scanned table body

Location: `src/plugins/file/engine/pdfToDocx.ts:120-130`, `:157-159`; component size heuristic in `src/plugins/file/engine/pdfOcr.ts:77`.

The overlay precheck assumes any residual accepted by `scanResidualRegions()` is already a proven graphic. That function only groups dark pixels and rejects small components; it does not distinguish required body text from an illustration. In a real synthetic PDF with a reliable digital title plus a shaded scanned 2×2 table, the shaded rectangle connects all remaining ink into one accepted component. `result` remains the title overlay, `needsOcr` is false, the recognizer is never called, and every scanned cell is embedded as a noneditable picture.

The actual DOCX contains only `Digital title` as editable text and one media file; `SCANNED A/B/C/D` are absent from OOXML. The result is successful with `nonEditableGraphic`, no `ocrUsed`, and `ocrCalls = 0`, even when an OCR callback is supplied. Required scanned table/body text must be recognized or rejected; component geometry alone cannot authorize treating it as an illustration. Repro below generates `/tmp/review-digital-title-scanned-table.pdf` and actual `.docx`.

## Verification observations

All three findings were reproduced using the existing prepared TypeScript test output, pinned PDF.js and the same maintained Node canvas adapter as `tests/unit/file/pdfOutput.test.mjs`. The injected writer records the intermediate model and delegates to the actual `writeEditableDocx`; ZIP inspection confirms the real OOXML text and media count. These are automated source/output findings, not native/editor acceptance.

| Input | Actual OOXML text | Media count | OCR calls |
| --- | --- | --- | --- |
| axial shading between paragraphs | `Before visible chart`, `After visible chart` | 0 | n/a |
| clipped text | `Visible body`, `Invisible clipped secret` | 0 | n/a |
| title + shaded scanned table | `Digital title` | 1 | 0 |

The Node environment reported a standard-font data load warning. The findings do not depend on font matching: the first two use operator/text extraction, while the third raster contains the title/table glyphs directly in its JPEG. All examples contain synthetic English text only, no private documents.

No additional concrete native/quality privacy or commit-authority defect was proven in this review. Native/font changes were concurrently owned by another finishing agent and must be assessed against its final verification, not this snapshot.

## Reproducer

This script is preserved here because `/tmp` is transient. Extract it to `/tmp/review-runtime-repro.mjs` and run from the repository after the normal test fixture preparation has compiled the current engine to `/private/tmp/zero-tests`. It writes only synthetic review artifacts in `/tmp`; it does not launch a native app or change source. Paths assume this checkout; adjust the absolute checkout prefix if moved.

```javascript
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire('/Users/watson/work/zero/package.json');
const pdfPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const canvas = createRequire(pdfPath)('@napi-rs/canvas');
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
globalThis.pdfjsWorker=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')));
globalThis.document={baseURI:pathToFileURL('/Users/watson/work/zero/').href,createElement(){const c=canvas.createCanvas(1,1);c.toBlob=cb=>cb(new Blob([c.toBuffer('image/png')]));return c;}};
const { convertPdfToDocx }=await import('/private/tmp/zero-tests/plugins/file/engine/pdfToDocx.js');
const {writeEditableDocx}=await import('/private/tmp/zero-tests/plugins/file/engine/editableDocx.js');
const JSZip = require('jszip');
const {extractPdfDrawing}=await import('/private/tmp/zero-tests/plugins/file/engine/pdfDrawing.js');
const { getDocument, OPS }=await import(pathToFileURL(pdfPath));
function makePdf(content,extras='',extraObjs=[]){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> ${extras} >> /Contents 5 0 R >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,...extraObjs];
 let pdf='%PDF-1.4\n',offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return new Uint8Array(Buffer.from(pdf));
}
const samples={
 'gradient-figure':makePdf('BT /F1 12 Tf 50 750 Td (Before visible chart) Tj ET\nq 150 0 0 90 50 500 cm /Sh1 sh Q\nBT /F1 12 Tf 50 450 Td (After visible chart) Tj ET','/Shading << /Sh1 6 0 R >>',['<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 1 1] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> /Extend [true true] >>']),
 'clipped-text':makePdf('BT /F1 12 Tf 50 750 Td (Visible body) Tj ET\nq 10 10 10 10 re W n BT /F1 12 Tf 50 600 Td (Invisible clipped secret) Tj ET Q'),
};
for(const [name,bytes]of Object.entries(samples)){
 fs.writeFileSync(`/tmp/review-${name}.pdf`,bytes);
 const doc=await getDocument({data:bytes.slice(),useSystemFonts:true}).promise;const page=await doc.getPage(1);const ops=await page.getOperatorList();const text=await page.getTextContent();
 console.log(name,'ops',ops.fnArray.map(op=>Object.keys(OPS).find(k=>OPS[k]===op)), 'text',text.items.map(t=>t.str), 'styles',text.styles);
 console.log('drawing',extractPdfDrawing(ops.fnArray,ops.argsArray,page.getViewport({scale:1}).transform));await page.cleanup();
 let model;
 const result=await convertPdfToDocx(bytes.slice(),new AbortController().signal,async()=>{},{assetBaseUrl:pathToFileURL('/Users/watson/work/zero/public/file-engine/').href,writeDocx:async pages=>{model=pages;return writeEditableDocx(pages,new AbortController().signal);}});
 fs.writeFileSync(`/tmp/review-${name}.docx`,result.bytes);const zip=await JSZip.loadAsync(result.bytes);console.log('DOCX',name,'imagefiles',Object.keys(zip.files).filter(n=>n.startsWith('word/media/')&&!zip.files[n].dir).length);
 console.log(name,'SUCCESS',JSON.stringify(model.map(p=>({text:p.paragraphs.flatMap(p=>p.runs.map(r=>r.text)).join(''),images:p.images.length}))),result.qualityIssues);
}
function binaryPdf(objects){
 let pdf=Buffer.from('%PDF-1.4\n'),offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(pdf.length);pdf=Buffer.concat([pdf,Buffer.from(`${i+1} 0 obj\n`),Buffer.isBuffer(obj)?obj:Buffer.from(obj),Buffer.from('\nendobj\n')]);}const xref=pdf.length;return new Uint8Array(Buffer.concat([pdf,Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)]));
}
const scan=canvas.createCanvas(500,450),cx=scan.getContext('2d');cx.fillStyle='white';cx.fillRect(0,0,500,450);cx.fillStyle='black';cx.font='12px sans-serif';cx.fillText('Digital title',30,50);cx.fillStyle='#dddddd';cx.fillRect(50,180,400,180);cx.fillStyle='black';cx.strokeStyle='black';cx.lineWidth=2;cx.strokeRect(50,180,400,180);cx.beginPath();cx.moveTo(250,180);cx.lineTo(250,360);cx.moveTo(50,270);cx.lineTo(450,270);cx.stroke();for(const [s,x,y] of [['SCANNED A',70,220],['SCANNED B',270,220],['SCANNED C',70,310],['SCANNED D',270,310]])cx.fillText(s,x,y);
const jpeg=scan.toBuffer('image/jpeg'),content='q 500 0 0 450 50 150 cm /Im1 Do Q\nBT /F1 12 Tf 80 550 Td (Digital title) Tj ET';
const mixed=binaryPdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 500 /Height 450 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,Buffer.from('\nendstream')])]);
fs.writeFileSync('/tmp/review-digital-title-scanned-table.pdf',mixed);let mixedModel,ocrCalls=0;
try{const result=await convertPdfToDocx(mixed,new AbortController().signal,async()=>{},{assetBaseUrl:pathToFileURL('/Users/watson/work/zero/node_modules/pdfjs-dist/').href,writeDocx:async pages=>{mixedModel=pages;return writeEditableDocx(pages,new AbortController().signal);},recognizePage:async()=>{ocrCalls++;throw new Error('ocr should be required');}});fs.writeFileSync('/tmp/review-digital-title-scanned-table.docx',result.bytes);console.log('digital-title-scanned-table SUCCESS',JSON.stringify(mixedModel.map(p=>({text:p.paragraphs.flatMap(p=>p.runs.map(r=>r.text)).join(''),images:p.images.length}))),result.qualityIssues, 'ocrCalls',ocrCalls);}catch(e){console.log('digital-title-scanned-table error',e.message,'ocrCalls',ocrCalls);}

```

## Resolution checkpoint — 2026-11-04

R1–R3 are fixed with actual-output regression cases in `tests/unit/file/pdfOutput.test.mjs` and operator tests in `pdfDrawing.test.mjs`. Unsupported shading/clipping/visibility operations reject before output; unbacked invisible text is rejected, and title-only scan overlays cannot promote required residual body into a picture. The final 462-test frontend run passes. See [implementation.md](implementation.md) for the exact fixes, scope and independent native acceptance boundaries. The original findings above describe the reviewed pre-fix source.
