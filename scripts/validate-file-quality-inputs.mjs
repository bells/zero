// Real PDF.js input checks; future conversion and native acceptance remain separate.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "tests/fixtures/fileConversion/quality");
const manifest = JSON.parse(await readFile(path.join(fixtures, "expected.json"), "utf8"));
const normalize = value => value.normalize("NFC").replace(/\s+/gu, " ").trim();
let pages = 0;
for (const name of (await readdir(fixtures)).filter(name => name.endsWith(".pdf"))) {
  const expected = manifest.cases.find(entry => entry.file === name);
  assert.ok(expected, `${name}: missing input source contract`);
  const task = getDocument({
    data: new Uint8Array(await readFile(path.join(fixtures, name))),
    useSystemFonts: false,
    standardFontDataUrl: path.join(root, "node_modules/pdfjs-dist/standard_fonts/"),
  });
  try {
    const document = await task.promise;
    assert.equal(document.numPages, expected.source.fullTextByPage.length);
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.filter(item => "str" in item).map(item => item.str).join("\n");
      assert.doesNotMatch(text, /[\u0000\ufffd]/u, `${name}: invalid source glyph mapping`);
      assert.equal(normalize(text), normalize(expected.source.fullTextByPage[number - 1]), `${name} page ${number}: full input text`);
      if (name === "P06.pdf") assert.ok(text.includes("x + 1"), "P06: formula source label must preserve plus glyph");
      pages += 1;
    }
  } finally {
    await task.destroy();
  }
}
console.log(`PDF.js validated ${pages} synthetic input pages: complete text and glyph mappings. Conversion targets were not executed.`);
