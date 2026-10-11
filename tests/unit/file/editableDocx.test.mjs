import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { writeEditableDocx } from "/private/tmp/zero-tests/plugins/file/engine/editableDocx.js";
import { reconstructPdfPage } from "/private/tmp/zero-tests/plugins/file/engine/pdfComplexity.js";

test("DOCX contains visible English/CJK runs, page sections and separately embedded figures", async () => {
  const model = reconstructPdfPage({ width: 612, height: 792, text: [
    { text: "Hello", x: 40, y: 40, width: 30, height: 12, rotationDegrees: 0 },
    { text: "World", x: 80, y: 40, width: 30, height: 12, rotationDegrees: 0 },
    { text: "中文", x: 40, y: 70, width: 24, height: 12, rotationDegrees: 0 },
    { text: "内容", x: 68, y: 70, width: 24, height: 12, rotationDegrees: 0 },
  ], vectorOperationCount: 0, imageCount: 1 });
  const image = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=", "base64"));
  const result = await writeEditableDocx([
    { ...model, images: [{ data: image, width: 1, height: 1 }] },
    { width: 612, height: 792, paragraphs: [], images: [], warningKeys: [] },
  ], new AbortController().signal);
  const zip = await JSZip.loadAsync(result);
  const xml = await zip.file("word/document.xml").async("string");
  const text = [...xml.matchAll(/<w:t\b[^>]*>(.*?)<\/w:t>/gs)].map((match) => match[1]).join("");
  assert.equal(text, "Hello World中文内容");
  assert.doesNotMatch(xml, /w:vanish|w:webHidden/);
  assert.equal((xml.match(/<w:sectPr\b/g) ?? []).length, 2);
  assert.match(xml, /<w:drawing>/);
  assert.equal(Object.keys(zip.files).filter((name) => name.startsWith("word/media/") && !zip.files[name].dir).length, 1);
});

test("DOCX writer honours cancellation before and after packaging", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(writeEditableDocx([], controller.signal), { name: "FileEngineCancelledError" });
  const active = new AbortController();
  const writing = writeEditableDocx([{ width: 612, height: 792, paragraphs: [], images: [], warningKeys: [] }], active.signal);
  active.abort();
  await assert.rejects(writing, { name: "FileEngineCancelledError" });
});
