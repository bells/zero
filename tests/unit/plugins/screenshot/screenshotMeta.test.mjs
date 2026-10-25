import assert from "node:assert/strict";
import test from "node:test";
import {
  SCREENSHOT_SHORTCUT,
  SCREENSHOT_USAGE_ITEMS,
} from "/private/tmp/zero-tests/plugins/screenshot/screenshotMeta.js";
import { screenshotFailureMessage } from "/private/tmp/zero-tests/plugins/screenshot/screenshotErrors.js";

test("preserves structured screenshot failure messages for permission diagnosis", () => {
  assert.equal(screenshotFailureMessage({ code: "screenshot.capture_permission", message: "Screen recording permission is required", retryable: true }), "Screen recording permission is required");
  assert.equal(screenshotFailureMessage(new Error("Capture failed")), "Capture failed");
});

test("uses a global shortcut suitable for macOS and Windows", () => {
  assert.equal(SCREENSHOT_SHORTCUT.accelerator, "Alt+A");
  assert.equal(SCREENSHOT_SHORTCUT.display, "⌥/Alt + A");
});

test("describes screenshot usage without mentioning source inspirations", () => {
  const text = SCREENSHOT_USAGE_ITEMS.join(" ");

  assert.match(text, /快捷键/);
  assert.match(text, /复制/);
  assert.match(text, /保存/);
  assert.doesNotMatch(text.toLowerCase(), /wechat|微信/);
});
