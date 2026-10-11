import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Snap has native screenshot and capability-gated OCR actions, with registered accelerator", () => {
  const source = fs.readFileSync("src-tauri/src/services/status_bar.rs", "utf8");
  assert.match(source, /ScreenshotOcr/);
  assert.match(source, /global_shortcut_snapshots/);
  assert.match(source, /shortcut\.registered/);
  assert.match(source, /super::ocr::capability\(\)\.available/);
  assert.match(source, /popUpMenuPositioningItem_atLocation_inView/);
  assert.match(source, /capture_menu_display/);
  assert.match(source, /start_menu_screenshot/);
  assert.doesNotMatch(source, /toggle_snap_menu_window|Some\("snap-menu"\)/);
});

test("retired Snap card route and capability cannot create a stale WebView", () => {
  assert.equal(fs.existsSync("src/plugins/screenshot/SnapMenuApp.tsx"),false);
  for (const path of ["src/appShell/appSurface.ts","src/core/pluginHost/pluginModule.ts","src-tauri/capabilities/default.json"])
    assert.doesNotMatch(fs.readFileSync(path,"utf8"), /snap-menu/);
  const command=fs.readFileSync("src-tauri/src/commands/screenshot.rs","utf8");
  assert.match(command,/screenshot.snap_menu_retired/);
});
