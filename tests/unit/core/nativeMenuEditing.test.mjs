import assert from "node:assert/strict";
import test from "node:test";
import { dispatchNativeMenuEdit, isTextEditingElement } from "/private/tmp/zero-tests/core/windowing/nativeMenuEditing.js";
import { isToolVisibleInNavigation } from "/private/tmp/zero-tests/appShell/mainNavigation.js";

test("undo and redo fall back to text history unless an editor consumes them", () => {
  const commands = [];
  const document = {
    dispatchEvent(event) {
      assert.equal(event.type, "zero:native-menu-edit");
      assert.equal(event.cancelable, true);
      return true;
    },
    execCommand(action) { commands.push(action); return true; },
  };
  dispatchNativeMenuEdit({ action: "undo" }, document);
  dispatchNativeMenuEdit({ action: "redo" }, document);
  assert.deepEqual(commands, ["undo", "redo"]);
  document.dispatchEvent = (event) => { event.preventDefault(); return false; };
  dispatchNativeMenuEdit({ action: "undo" }, document);
  assert.deepEqual(commands, ["undo", "redo"]);
});

test("invalid native editing payloads cannot invoke document commands", () => {
  const document = { dispatchEvent() { assert.fail(); }, execCommand() { assert.fail(); } };
  for (const input of [null, undefined, "undo", {}, { action: "copy" }, { action: {} }]) {
    dispatchNativeMenuEdit(input, document);
  }
});

test("text fields and editable ancestors keep native text history", () => {
  assert.equal(isTextEditingElement(null), false);
  assert.equal(isTextEditingElement({ closest: () => null }), false);
  assert.equal(isTextEditingElement({ closest: () => ({}) }), true);
});

test("explicit tool requests reveal a hidden page without mutating visibility", () => {
  const visibleIds = ["zero.snap"];
  assert.equal(isToolVisibleInNavigation("zero.snap", visibleIds), true);
  assert.equal(isToolVisibleInNavigation("zero.awake", visibleIds), false);
  assert.equal(isToolVisibleInNavigation("zero.awake", visibleIds, "zero.awake"), true);
  assert.equal(isToolVisibleInNavigation("zero.paper", visibleIds, "zero.awake"), false);
  assert.deepEqual(visibleIds, ["zero.snap"]);
});
