import assert from "node:assert/strict";
import test from "node:test";
import {
  GLOBAL_SHORTCUT_COMMANDS,
  createGlobalShortcutService,
  shortcutStatusMessageKey,
  recordShortcut,
  shortcutErrorMessageKey,
  displayShortcut,
} from "/private/tmp/zero-tests/services/globalShortcutServiceCore.js";

test("reads native shortcut snapshots", async () => {
  const calls = [];
  const snapshots = [
    {
      id: "snapCapture",
      pluginName: "zero.snap",
      accelerator: "Alt+A",
      enabled: true,
      registered: true,
      platformSupported: true,
      registrationState: "active",
    },
  ];
  const service = createGlobalShortcutService(async (command) => {
    calls.push(command);
    return snapshots;
  });

  assert.deepEqual(await service.getSnapshots(), snapshots);
  assert.deepEqual(calls, ["get_global_shortcut_snapshots"]);
  assert.deepEqual(GLOBAL_SHORTCUT_COMMANDS, {
    getSnapshots: "get_global_shortcut_snapshots",
    setSnapShortcut: "set_snap_shortcut",
  });
});

test("maps every native registration state to localized status copy", () => {
  assert.equal(shortcutStatusMessageKey("active"), "prefs.shortcuts.active");
  assert.equal(shortcutStatusMessageKey("inactive"), "prefs.shortcuts.inactive");
  assert.equal(shortcutStatusMessageKey("conflict"), "prefs.shortcuts.conflict");
  assert.equal(shortcutStatusMessageKey("unsupported"), "prefs.shortcuts.unsupported");
});

test("clearing OCR preserves null across the native mutation boundary", async () => {
  const snapshots = [{ id: "snapOcr", accelerator: null, registrationState: "unassigned" }];
  const service = createGlobalShortcutService(async (command, args) => {
    if (command === "set_snap_shortcut" && args.input.id === "snapOcr" && args.input.accelerator === null) return snapshots;
    throw new Error("unexpected mutation contract");
  });
  assert.deepEqual(await service.setSnapShortcut({ id: "snapOcr", accelerator: null }), snapshots);
});

test("recording requires a modifier, ignores modifier-only keys and cancels Escape", () => {
  const key = (code, modifiers = {}) => ({ code, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...modifiers });
  assert.deepEqual(recordShortcut(key("KeyA")), { kind: "pending" });
  assert.deepEqual(recordShortcut(key("AltLeft", { altKey: true })), { kind: "pending" });
  assert.deepEqual(recordShortcut(key("Escape")), { kind: "cancel" });
  assert.deepEqual(recordShortcut(key("KeyB", { altKey: true, shiftKey: true })), { kind: "shortcut", accelerator: "Alt+Shift+B" });
  assert.deepEqual(recordShortcut(key("Space", { ctrlKey: true, metaKey: true })), { kind: "shortcut", accelerator: "Control+Super+Space" });
  assert.equal(displayShortcut("Alt+A", true), "⌥ + A");
  assert.equal(displayShortcut("Control+Alt+B", false), "Ctrl + Alt + B");
});

test("disabled and unassigned states and typed failures have localized copy", () => {
  assert.equal(shortcutStatusMessageKey("disabled"), "prefs.shortcuts.disabled");
  assert.equal(shortcutStatusMessageKey("unassigned"), "prefs.shortcuts.unassigned");
  for (const code of ["invalid", "duplicate", "persistence", "rollback", "busy", "readOnly", "unsupported", "invalidConfiguration", "conflict"]) {
    assert.equal(shortcutErrorMessageKey({ code }), `prefs.shortcuts.error.${code}`);
  }
});
