import assert from "node:assert/strict";
import test from "node:test";
import * as shortcuts from "/private/tmp/zero-tests/plugins/quickLauncher/quickLauncherShortcuts.js";

const key = (value, overrides = {}) => ({
  key: value, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
  repeat: false, isComposing: false, ...overrides,
});

test("result shortcuts use the native modifier and absolute first-nine positions", () => {
  assert.equal(shortcuts.launcherShortcutPlatform("MacIntel"), "macos");
  assert.equal(shortcuts.launcherShortcutPlatform("Win32"), "windows");
  assert.equal(shortcuts.launcherShortcutPlatform("Linux x86_64"), "unsupported");
  assert.deepEqual(shortcuts.launcherResultShortcut(0, "macos"), { label: "⌘1", ariaKeyShortcuts: "Meta+1" });
  assert.deepEqual(shortcuts.launcherResultShortcut(8, "windows"), { label: "Ctrl+9", ariaKeyShortcuts: "Control+9" });
  for (const position of [-1, 9, 24]) assert.equal(shortcuts.launcherResultShortcut(position, "macos"), null);
  assert.equal(shortcuts.launcherResultShortcut(0, "unsupported"), null);
});

test("only platform digit chords trigger, without repeats or IME composition", () => {
  assert.equal(shortcuts.launcherShortcutIndex(key("1", { metaKey: true }), "macos"), 0);
  assert.equal(shortcuts.launcherShortcutIndex(key("9", { ctrlKey: true }), "windows"), 8);
  for (const value of ["0", "a", "Enter"]) {
    assert.equal(shortcuts.launcherShortcutIndex(key(value, { metaKey: true }), "macos"), null);
  }
  for (const overrides of [
    {}, { ctrlKey: true }, { metaKey: true, ctrlKey: true },
    { metaKey: true, altKey: true }, { metaKey: true, shiftKey: true },
    { metaKey: true, repeat: true }, { metaKey: true, isComposing: true },
  ]) assert.equal(shortcuts.launcherShortcutIndex(key("2", overrides), "macos"), null);
  assert.equal(shortcuts.launcherShortcutIndex(key("2", { metaKey: true }), "windows"), null);
  assert.equal(shortcuts.launcherShortcutIndex(key("2", { ctrlKey: true }), "unsupported"), null);
});

test("shortcut activation preserves displayed identity even when results reorder", () => {
  const displayed = { itemId: "settings", revision: 7, query: "ch" };
  const result = { revision: 7, query: "ch", items: [{ id: "app" }, { id: "settings" }] };
  assert.deepEqual(shortcuts.resolveShortcutActivation(displayed, result, "ch", false), displayed);
  assert.deepEqual(shortcuts.resolveShortcutActivation(displayed, { ...result, items: [...result.items].reverse() }, "ch", false), displayed);
  assert.equal(shortcuts.resolveShortcutActivation(displayed, result, "ch", true), null);
  assert.equal(shortcuts.resolveShortcutActivation(displayed, result, "chrome", false), null);
  assert.equal(shortcuts.resolveShortcutActivation(displayed, { ...result, revision: 8 }, "ch", false), null);
  assert.equal(shortcuts.resolveShortcutActivation(displayed, { ...result, query: "old" }, "ch", false), null);
  assert.equal(shortcuts.resolveShortcutActivation(displayed, { ...result, items: [{ id: "app" }] }, "ch", false), null);
  assert.equal(shortcuts.resolveShortcutActivation(displayed, null, "ch", false), null);
});
