import assert from "node:assert/strict";
import test from "node:test";
import { resolveCaptureHotkey } from "/private/tmp/zero-tests/plugins/screenshot/capture/captureHotkeys.js";

test("maps capture editor keyboard shortcuts", () => {
  assert.equal(resolveCaptureHotkey({ key: "Escape" }), "cancel");
  assert.equal(resolveCaptureHotkey({ key: "Delete" }), "removeSelected");
  assert.equal(resolveCaptureHotkey({ key: "Backspace" }), "removeSelected");
  assert.equal(resolveCaptureHotkey({ key: "z", metaKey: true }), "undo");
  assert.equal(resolveCaptureHotkey({ key: "z", ctrlKey: true }), "undo");
  assert.equal(resolveCaptureHotkey({ key: "z", metaKey: true, shiftKey: true }), "redo");
  assert.equal(resolveCaptureHotkey({ key: "z", ctrlKey: true, shiftKey: true }), "redo");
  assert.equal(resolveCaptureHotkey({ key: "y", ctrlKey: true }), "redo");
  assert.equal(resolveCaptureHotkey({ key: "y", metaKey: true }), "redo");
  assert.equal(resolveCaptureHotkey({ key: "a" }), null);
});

test("OCR-only selection confirms explicitly and withholds editor shortcuts", () => {
  assert.equal(resolveCaptureHotkey({ key: "Enter" }, "ocr-selection"), "recognize");
  assert.equal(resolveCaptureHotkey({ key: "Escape" }, "ocr-selection"), "cancel");
  for (const event of [{ key: "Delete" }, { key: "z", ctrlKey: true }, { key: "y", metaKey: true }]) {
    assert.equal(resolveCaptureHotkey(event, "ocr-selection"), null);
  }
  assert.equal(resolveCaptureHotkey({ key: "Enter" }, "full"), null);
});
