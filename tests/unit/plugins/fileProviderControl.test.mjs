import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileProviderControl } from "/private/tmp/zero-tests/plugins/file/FileProviderControl.js";
import { createFileTranslator } from "/private/tmp/zero-tests/plugins/file/i18n.js";

const unavailable = { kind: "unavailable", error: { code: "engineUnavailable", retryable: true, message: "missing" } };
const capability = {
  direction: "docxToPdf", available: false, preferredProviderId: "zeroFileDocxToPdfMacos",
  providers: [
    { id: "zeroFileDocxToPdfMacos", availability: unavailable },
    { id: "libreOffice", availability: { kind: "available" } },
    { id: "microsoftWordMacos", availability: unavailable },
  ], unavailability: unavailable.error,
};
const props = { direction: "docxToPdf", capability, invalidSavedChoice: true, disabled: false, onSelect() {} };

test("provider control keeps unavailable built-in selected and labels supported alternatives", () => {
  for (const language of ["zh-CN", "en-US"]) {
    const t = createFileTranslator(language);
    const html = renderToStaticMarkup(createElement(FileProviderControl, { ...props, t }));
    assert.match(html, /<label[^>]*for="file-provider-docxToPdf"/);
    assert.match(html, /<select[^>]*aria-label=/);
    assert.match(html, /<option value="zeroFileDocxToPdfMacos" disabled="" selected=""/);
    assert.match(html, /<option value="libreOffice">LibreOffice<\/option>/);
    assert.ok(html.includes(t("provider.invalidSavedChoice")));
    assert.ok(html.includes(t("error.engineUnavailable")));
    assert.ok(!html.includes("microsoftWordWindows"));
    assert.ok(!html.includes("sourcePath"));
  }
});

test("saving disables the native keyboard-operable provider control", () => {
  const html = renderToStaticMarkup(createElement(FileProviderControl, { ...props, disabled: true, t: createFileTranslator("en-US") }));
  assert.match(html, /<select[^>]*disabled=""/);
});
