import assert from "node:assert/strict";
import test from "node:test";
import { classifyPdfComplexity, reconstructPdfPage } from "/private/tmp/zero-tests/plugins/file/engine/pdfComplexity.js";
const text = (value, x = 40, y = 40, width = 100) => ({ text: value, x, y, width, height: 12, rotationDegrees: 0 });
const page = (items = [text("A simple editable paragraph")], overrides = {}) => ({ width: 612, height: 792, text: items, vectorOperationCount: 0, imageCount: 0, ...overrides });
const body = (result) => result.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
test("short text, normal text and dense vector table text remain editable", () => {
  for (const candidate of [page([text("Hi")]), page(), page(undefined, { vectorOperationCount: 40 })]) {
    assert.equal(classifyPdfComplexity([candidate]).profile, "editableReconstruction");
  }
});
test("scans and mixed documents require OCR; blank pages preserve pagination", () => {
  const scan = page([], { imageCount: 1 });
  for (const pages of [[scan], [page(), scan]]) assert.throws(() => classifyPdfComplexity(pages), { code: "ocrRequired" });
  assert.equal(reconstructPdfPage(page([])).paragraphs.length, 0);
  assert.throws(() => classifyPdfComplexity([page([])]), { code: "unsupportedInput" });
});
test("unrecoverable rotations, overlapping text and invalid mappings fail", () => {
  for (const candidate of [page([{ ...text("rotated"), rotationDegrees: 90 }]), page([text("left"), text("overlap", 50)]), page([text("bad\ufffd")])]) {
    assert.throws(() => reconstructPdfPage(candidate), { code: "unsupportedInput" });
  }
});
test("reconstructs column order and preserves text instead of interleaving rows", () => {
  const items = [0, 1, 2].flatMap((i) => [text(`Left ${i}`, 40, 40 + i * 30, 150), text(`Right ${i}`, 340, 40 + i * 30, 150)]);
  const result = reconstructPdfPage(page(items));
  assert.equal(body(result), "Left 0\nLeft 1\nLeft 2\nRight 0\nRight 1\nRight 2");
  assert.ok(result.warningKeys.includes("file.quality.structureSimplified"));
});
test("restores English spacing, joins CJK and merges paragraph lines", () => {
  assert.equal(body(reconstructPdfPage(page([text("Hello", 40, 40, 30), text("World", 80, 40, 30)]))), "Hello World");
  assert.equal(body(reconstructPdfPage(page([text("中文", 40, 40, 24), text("内容", 70, 40, 24), text("测试", 40, 55, 24)]))), "中文内容测试");
});
