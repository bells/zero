import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { writeEditableDocx } from "/private/tmp/zero-tests/plugins/file/engine/editableDocx.js";
import { reconstructPdfPage } from "/private/tmp/zero-tests/plugins/file/engine/pdfComplexity.js";
import { reconstructStructuredPage } from "/private/tmp/zero-tests/plugins/file/engine/pdfStructure.js";

test("structured writer emits editable merged cells and keeps figures in content order", async () => {
  const sample=(text,x,y,width=30)=>({text,x,y,width,height:12,rotationDegrees:0});
  const model=reconstructStructuredPage({width:600,height:800,text:[sample("Before",40,40),sample("AB",50,125),sample("C",250,125),sample("A2",50,165),sample("B2",150,165),sample("C2",250,165),sample("After",40,400)],
    lines:[...[100,140,180].map(y=>({x1:40,y1:y,x2:340,y2:y})),...[40,240,340].map(x=>({x1:x,y1:100,x2:x,y2:180})),{x1:140,y1:140,x2:140,y2:180}],
    figures:[{id:"image0",bounds:{x:40,y:220,width:200,height:100},nonEditable:false}]});
  const data=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=","base64"));
  const bytes=await writeEditableDocx([{...model,images:[{id:"image0",data,width:200,height:100}]}],new AbortController().signal);
  const zip=await JSZip.loadAsync(bytes),xml=await zip.file("word/document.xml").async("string");
  assert.match(xml,/<w:tbl>/);assert.match(xml,/<w:gridSpan w:val="2"/);
  assert.equal((xml.match(/>AB<\/w:t>/g)??[]).length,1);
  assert.ok(xml.indexOf("Before")<xml.indexOf("<w:tbl>"));
  assert.ok(xml.indexOf("</w:tbl>")<xml.indexOf("<w:drawing>"));
  assert.ok(xml.indexOf("<w:drawing>")<xml.indexOf("After"));
  assert.match(xml,/cx="2540000" cy="1270000"/);
});

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
