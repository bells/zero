import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";

// Use a real canvas implementation for PDF.js' Node environment, not a parser mock.
const canvasModule = process.env.ZERO_FILE_TEST_CANVAS_MODULE;
if (!canvasModule) throw new Error("Set ZERO_FILE_TEST_CANVAS_MODULE to an installed @napi-rs/canvas index.js; run pnpm test:prepare first.");
const canvas = await import(pathToFileURL(canvasModule).href);
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
const root = process.cwd();
// The browser wrapper intentionally exports nothing; Node's fake worker needs the upstream handler.
globalThis.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
globalThis.document = {
  baseURI: pathToFileURL(`${root}/`).href,
  createElement(name) {
    assert.equal(name, "canvas");
    const value = canvas.createCanvas(1, 1);
    value.toBlob = (callback) => callback(new Blob([value.toBuffer("image/png")]));
    return value;
  },
};
const { convertPdfToDocx } = await import("/private/tmp/zero-tests/plugins/file/engine/pdfToDocx.js");
const { writeEditableDocx } = await import("/private/tmp/zero-tests/plugins/file/engine/editableDocx.js");
const sourceRoot = path.join(root, "tests/fixtures/fileConversion");
const corpus = JSON.parse(fs.readFileSync(path.join(sourceRoot, "expected.json")));
const outputRoot = "/private/tmp/zero-editable-pdf-results";
fs.mkdirSync(outputRoot, { recursive: true });
const options = { assetBaseUrl: pathToFileURL(`${root}/public/file-engine/`).href };
let passed = 0;
for (const fixture of corpus.cases.filter((entry) => entry.direction === "pdfToDocx" && entry.expectedPreflight === "valid")) {
  const input = () => new Uint8Array(fs.readFileSync(path.join(sourceRoot, fixture.file)));
  if (fixture.expectedConversionError) {
    await assert.rejects(convertPdfToDocx(input(), new AbortController().signal, async () => {}, options), (error) => {
      assert.equal(error.message, fixture.expectedConversionError); return true;
    });
  } else {
    const result = await convertPdfToDocx(input(), new AbortController().signal, async () => {}, options);
    assert.equal(result.qualityProfile, "editableReconstruction");
    const zip = await JSZip.loadAsync(result.bytes);
    const xml = await zip.file("word/document.xml").async("string");
    const text = [...xml.matchAll(/<w:t\b[^>]*>(.*?)<\/w:t>/gs)].map((match) => match[1]
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")).join("");
    assert.ok(text.trim().length > 0);
    const characters = (value) => [...value.replace(/\s/gu, "")].sort().join("");
    assert.equal(characters(text), characters(fixture.expectedFullText), `${fixture.file}: full visible text coverage`);
    let offset = 0;
    for (const expected of fixture.expectedText ?? []) {
      const found = text.indexOf(expected, offset);
      assert.ok(found >= offset, `${fixture.file}: expected ordered text ${expected}`);
      offset = found + expected.length;
    }
    if (fixture.expectedPageCount) assert.equal(result.pageCount, fixture.expectedPageCount);
    assert.equal((xml.match(/<w:sectPr\b/g) ?? []).length, result.pageCount);
    assert.ok(result.warningKeys.includes("file.quality.editableReconstructionWarning"));
    if (fixture.coverage.includes("image") || fixture.file.includes("table-image")) {
      assert.ok(Object.keys(zip.files).some((name) => name.startsWith("word/media/") && !zip.files[name].dir));
      const relationships = await zip.file("word/_rels/document.xml.rels").async("string");
      assert.match(relationships, /relationships\/image/);
      assert.ok(result.warningKeys.includes("file.quality.imagesRetained"));
      assert.ok(result.warningKeys.includes("file.quality.structureSimplified"));
    }
    assert.doesNotMatch(xml, /w:vanish|w:webHidden/);
    fs.writeFileSync(path.join(outputRoot, fixture.file.replace(/\.pdf$/, ".docx")), result.bytes);
  }
  passed += 1;
  console.log(`PASS ${fixture.file}`);
}
const short = () => new Uint8Array(fs.readFileSync(path.join(sourceRoot, "editable-short.pdf")));
await assert.rejects(convertPdfToDocx(short(), new AbortController().signal, async () => {}, {
  ...options, writeDocx: async () => { throw new Error("injected packaging failure"); },
}), /injected packaging failure/);
const cancellation = new AbortController();
await assert.rejects(convertPdfToDocx(short(), cancellation.signal, async (progress) => {
  if (progress.stage === "analyzing") cancellation.abort();
}, options), { name: "FileEngineCancelledError" });
await assert.rejects(convertPdfToDocx(short(), new AbortController().signal, async () => {}, {
  ...options, deadlineMs: Date.now() - 1,
}), /timeout/);
let writerCalled = false;
await assert.rejects(convertPdfToDocx(new Uint8Array(fs.readFileSync(path.join(sourceRoot, "encrypted.pdf"))), new AbortController().signal,
  async () => {}, { ...options, writeDocx: async (...args) => { writerCalled = true; return writeEditableDocx(...args); } }), /passwordRequired/);
assert.equal(writerCalled, false);
console.log(`${passed} real PDF conversions/error cases plus packaging failure, cancellation, timeout and password checks passed. Outputs: ${outputRoot}`);
