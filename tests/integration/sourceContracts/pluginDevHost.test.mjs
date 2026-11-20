import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfigFromFile } from "vite";
import { pluginDevSettings, preparePluginDevAssets } from "../../../scripts/dev-plugins.mjs";

const root = process.cwd();

test("standalone plugin dev pairs the Core shell with native providers and isolated data", () => {
  const overlay = path.join(root, "build", "plugin-dev", "overlay");
  const settings = pluginDevSettings(root, overlay);
  assert.equal(settings.env.ZERO_BUILD_PROFILE, "core");
  assert.equal(settings.env.ZERO_PLUGIN_WEB_DEV, "1");
  assert.equal(settings.env.ZERO_FILE_ENGINE_DEV_ASSETS, "1");
  assert.equal(settings.env.ZERO_DEV_HOME, path.join(root, "build", "plugin-dev", "home"));
  assert.equal(settings.env.ZERO_PLUGIN_DEV_PUBLIC_DIR, overlay);
  assert.equal(settings.env.ZERO_DEV_PLUGIN_MARKET, "0");
  assert.equal(pluginDevSettings(root, overlay, true).env.ZERO_DEV_PLUGIN_MARKET, "1");
  assert.equal(settings.config.identifier, "com.watson.zero.plugins-dev");
  assert.equal(settings.config.build.devUrl, "http://localhost:1422");
  assert.match(settings.config.build.beforeDevCommand, /--host localhost --port 1422/);
  assert.deepEqual(settings.cargoArgs, ["--features", "screen-capture,file-engine", "--", "--no-default-features", "--locked"]);
});

test("the isolated File overlay has a local entrypoint and assets that only Core dev serves", async () => {
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), "zero-plugin-dev-assets-"));
  const previous = Object.fromEntries(Object.keys(pluginDevSettings(root, overlay).env)
    .map((key) => [key, process.env[key]]));
  try {
    await preparePluginDevAssets(root, overlay);
    const engine = path.join(overlay, "dev-file-engine");
    const html = fs.readFileSync(path.join(engine, "index.html"), "utf8");
    assert.match(html, /src="\.\/assets\/[^"]+\.mjs"/);
    assert.ok(fs.statSync(path.join(engine, "file-engine", "pdf.worker.min.mjs")).isFile());
    assert.ok(fs.statSync(path.join(engine, "file-engine", "manifest.json")).isFile());
    assert.deepEqual(fs.readdirSync(overlay), ["dev-file-engine"]);

    Object.assign(process.env, pluginDevSettings(root, overlay).env);
    const config = path.join(root, "vite.config.ts");
    assert.equal((await loadConfigFromFile({ command: "serve", mode: "development" }, config)).config.publicDir, overlay);
    assert.equal((await loadConfigFromFile({ command: "build", mode: "production" }, config)).config.publicDir, false);
    process.env.ZERO_BUILD_PROFILE = "full";
    assert.equal((await loadConfigFromFile({ command: "serve", mode: "development" }, config)).config.publicDir, "public");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(overlay, { recursive: true, force: true });
  }
});
