import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const native = fs.readFileSync("src-tauri/src/services/app_menu/native.rs", "utf8");
const host = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
const editing = fs.readFileSync("src-tauri/src/services/app_menu/editing.rs", "utf8");

test("macOS menus register native Window and Help identities", () => {
  assert.match(native, /Submenu::with_id_and_items\(\s*app,\s*WINDOW_SUBMENU_ID/);
  assert.match(native, /Submenu::with_id_and_items\(\s*app,\s*HELP_SUBMENU_ID/);
  assert.match(host, /#\[cfg\(target_os = "macos"\)\]\s*\{\s*app.set_activation_policy[^}]+app_menu::initialize/s);
});

test("native dialog editing retains the macOS responder chain", () => {
  assert.match(native, /super::editing::attach\(app\)/);
  assert.match(native, /sendAction_to_from/);
  assert.match(native, /sel!\(undo:\)/);
  assert.match(native, /sel!\(redo:\)/);
  assert.match(editing, /method\(worksWhenModal\)/);
  assert.match(editing, /setRepresentedObject\(Some\(&owner\)\)/);
});
