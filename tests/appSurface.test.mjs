import assert from "node:assert/strict";
import test from "node:test";
import { resolveAppSurface } from "/private/tmp/ztool-app-shell-test/appShell/appSurface.js";

test("routes known Tauri window labels to app surfaces", () => {
  assert.equal(resolveAppSurface("tray"), "tray");
  assert.equal(resolveAppSurface("main"), "main");
  assert.equal(resolveAppSurface("preferences"), "preferences");
  assert.equal(resolveAppSurface("about"), "about");
  assert.equal(resolveAppSurface("capture"), "capture");
  assert.equal(resolveAppSurface("pin-123"), "pin");
});

test("falls back unknown window labels to the tray surface", () => {
  assert.equal(resolveAppSurface("unexpected-window"), "tray");
  assert.equal(resolveAppSurface(""), "tray");
});
