import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// This hook is outside the shared pure-domain fixture list. Compile it in an
// independent directory so this test never replaces another suite's fixtures.
const output = fs.mkdtempSync(path.join(os.tmpdir(), "zero-shortcut-recovery-"));
try {
  execFileSync(process.execPath, [
    "node_modules/typescript/bin/tsc", "src/services/useGlobalShortcuts.ts",
    "--module", "ES2020", "--moduleResolution", "bundler", "--target", "ES2022",
    "--outDir", output, "--skipLibCheck",
  ], { cwd: process.cwd(), stdio: "pipe" });
  for (const name of fs.readdirSync(output).filter(name => name.endsWith(".js"))) {
    const file = path.join(output, name);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/from "(\.\/.+?)(?<!\.js)"/g, 'from "$1.js"'));
  }
  fs.writeFileSync(path.join(output, "package.json"), '{"type":"module"}');
  fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(output, "node_modules"), process.platform === "win32" ? "junction" : "dir");
} catch (error) {
  fs.rmSync(output, { recursive: true, force: true });
  throw error;
}
after(() => fs.rmSync(output, { recursive: true, force: true }));
const { reconcileShortcutFailure } = await import(pathToFileURL(path.join(output, "useGlobalShortcuts.js")).href);

test("failed replacement refreshes changed native registration while preserving the original error", async () => {
  const snapshots = [{ id: "snapCapture", accelerator: "Alt+A", registered: false, registrationState: "conflict" }];
  const result = await reconcileShortcutFailure({ getSnapshots: async () => snapshots }, { code: "rollback" });
  assert.deepEqual(result, { snapshots, error: "prefs.shortcuts.error.rollback" });
});

test("snapshot refresh failure does not replace the shortcut mutation error", async () => {
  const result = await reconcileShortcutFailure({ getSnapshots: async () => { throw new Error("state unavailable"); } }, { code: "persistence" });
  assert.deepEqual(result, { snapshots: null, error: "prefs.shortcuts.error.persistence" });
});
