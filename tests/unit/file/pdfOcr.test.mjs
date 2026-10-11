import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
import { ocrTextSamples } from "/private/tmp/zero-tests/plugins/file/engine/pdfOcr.js";

const nativeResult = { width:1400,height:1800,warnings:["lowConfidence"],lines:[
  { text:"Zero OCR synthetic page",bounds:{x:60,y:24,width:550,height:48},confidence:.9 },
  { text:"中文测试内容",bounds:{x:60,y:240,width:290,height:48},confidence:.9 },
  { text:"Editable text from offline OCR",bounds:{x:60,y:420,width:700,height:48},confidence:.5 },
  { text:"Bottom edge text 2026",bounds:{x:60,y:1700,width:550,height:48},confidence:.9 },
] };

test("pixel-to-point adapter validates provider geometry and preserves top-left positions",()=>{
  const text=ocrTextSamples(nativeResult,560,720);
  assert.equal(text[0].x,24);assert.equal(text[0].y,9.6);assert.equal(text[3].y,680);
  assert.throws(()=>ocrTextSamples({...nativeResult,width:0},560,720),/providerFailed/);
  assert.throws(()=>ocrTextSamples({...nativeResult,lines:[{...nativeResult.lines[0],confidence:NaN}]},560,720),/providerFailed/);
  assert.throws(()=>ocrTextSamples({...nativeResult,lines:[{...nativeResult.lines[0],bounds:{x:1399,y:0,width:20,height:20}}]},560,720),/providerFailed/);
});

test("OCR fixtures are reproducible synthetic content without user attachments",()=>{
  const root="tests/fixtures/ocr";
  const expected=JSON.parse(fs.readFileSync(path.join(root,"expected.json"),"utf8"));
  assert.equal(expected.containsUserData,false);
  for (const fixture of expected.cases) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root,fixture.file))).digest("hex"),fixture.sha256);
});

// PDF.js legacy initializes the maintained Node canvas bindings; the converter still imports its browser build.
await import("pdfjs-dist/legacy/build/pdf.mjs");
globalThis.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.mjs");
const {convertPdfToDocx}=await import("/private/tmp/zero-tests/plugins/file/engine/pdfToDocx.js");
const options={assetBaseUrl:new URL("../../../public/file-engine/",import.meta.url).href};
const bytes=name=>new Uint8Array(fs.readFileSync(`tests/fixtures/ocr/${name}`));

test("mixed text, scan, ordinary blank and image blank become visible editable DOCX pages",async()=>{
  const calls=[];const rasters=[];
  const result=await convertPdfToDocx(bytes("mixed.pdf"),new AbortController().signal,async()=>{}, {
    ...options,
    rasterizePage:async page=>{ const raster={bytes:new Uint8Array([1,2,3]),width:1400,height:1800,blank:page.pageNumber===4,downsampled:true};rasters.push(raster);return raster; },
    recognizePage:async (_raster,page)=>{calls.push(page);return nativeResult;},
  });
  assert.deepEqual(calls,[2]);assert.equal(result.pageCount,4);
  assert.ok(result.warningKeys.includes("file.quality.ocrUsed"));
  assert.ok(result.warningKeys.includes("file.quality.ocrLowConfidence"));
  assert.ok(result.warningKeys.includes("file.quality.ocrDownsampled"));
  for (const raster of rasters) assert.ok(raster.bytes.every(byte=>byte===0));
  const zip=await JSZip.loadAsync(result.bytes);
  const xml=await zip.file("word/document.xml").async("string");
  assert.match(xml,/Original text layer first/);assert.match(xml,/中文测试内容/);
  assert.ok(xml.indexOf("Original text layer first")<xml.indexOf("Zero OCR synthetic page"));
  assert.equal((xml.match(/<w:sectPr\b/g)??[]).length,4);
  assert.doesNotMatch(xml,/w:drawing|w:vanish|w:webHidden/);
});

test("missing provider, failed scan, cancellation and deadline never return partial DOCX",async()=>{
  const rasterizePage=async()=>({bytes:new Uint8Array([1]),width:1400,height:1800,blank:false,downsampled:false});
  let writes=0;const writeDocx=async()=>{writes++;return new Uint8Array();};
  await assert.rejects(convertPdfToDocx(bytes("scan.pdf"),new AbortController().signal,async()=>{}, {...options,rasterizePage,writeDocx}), {code:"ocrRequired"});
  await assert.rejects(convertPdfToDocx(bytes("mixed.pdf"),new AbortController().signal,async()=>{}, {...options,rasterizePage,writeDocx,recognizePage:async()=>{throw new Error("providerFailed");}}),/providerFailed/);
  const controller=new AbortController();
  await assert.rejects(convertPdfToDocx(bytes("scan.pdf"),controller.signal,async()=>{}, {...options,rasterizePage,writeDocx,recognizePage:async()=>{controller.abort();return nativeResult;}}),{name:"FileEngineCancelledError"});
  await assert.rejects(convertPdfToDocx(bytes("scan.pdf"),new AbortController().signal,async()=>{}, {...options,deadlineMs:Date.now()-1,rasterizePage,writeDocx}),/timeout/);
  assert.equal(writes,0);
});

test("hidden engine raster uses print intent and releases canvas after encoding or abort",async()=>{
  const {rasterizeOcrPage}=await import("/private/tmp/zero-tests/plugins/file/engine/pdfOcr.js");
  const oldDocument=globalThis.document;
  const canvas={width:0,height:0,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([255,255,255,255])})}),toBlob:callback=>callback(new Blob([new Uint8Array([1])]))};
  globalThis.document={createElement:()=>canvas};
  const page={getViewport:({scale})=>({width:100*scale,height:200*scale}),render:options=>{assert.equal(options.intent,"print");return {promise:Promise.resolve(),cancel:()=>{}};}};
  try {
    const raster=await rasterizeOcrPage(page,new AbortController().signal);assert.equal(raster.blank,true);assert.ok(raster.width>0);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
    const controller=new AbortController();controller.abort();await assert.rejects(rasterizeOcrPage({...page,render:()=>{throw new Error("already cancelled request must not render");}},controller.signal),{name:"AbortError"});assert.equal(canvas.width,0);
    await assert.rejects(rasterizeOcrPage({...page,render:()=>{throw new Error("render failure");}},new AbortController().signal),/render failure/);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
  } finally {globalThis.document=oldDocument;}
});
