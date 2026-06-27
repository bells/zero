import assert from "node:assert/strict";
import test from "node:test";
import {
  BUNDLED_PLUGIN_MANIFESTS,
  bundledPluginKind,
  pluginAccentClass,
} from "/private/tmp/ztool-bundled-plugins-test/bundledPlugins.js";

test("defines stable bundled plugin manifests with safe main paths", () => {
  assert.deepEqual(
    BUNDLED_PLUGIN_MANIFESTS.map((manifest) => ({
      name: manifest.name,
      main: manifest.main,
      runtime: manifest.runtime,
    })),
    [
      {
        name: "ztool.screenshot",
        main: "plugins/screenshot",
        runtime: "webview",
      },
      {
        name: "ztool.caffeine",
        main: "plugins/caffeine",
        runtime: "webview",
      },
    ],
  );
  assert.equal(
    BUNDLED_PLUGIN_MANIFESTS.every((manifest) => !manifest.main.includes("..")),
    true,
  );
});

test("bundled manifests declare views commands permissions and platforms", () => {
  const screenshot = BUNDLED_PLUGIN_MANIFESTS[0];
  const caffeine = BUNDLED_PLUGIN_MANIFESTS[1];

  assert.deepEqual(screenshot.platforms, ["macos", "windows", "linux"]);
  assert.deepEqual(caffeine.permissions, ["ui.message"]);
  assert.equal(screenshot.contributes.views[0].id, "ztool.screenshot.main");
  assert.equal(caffeine.contributes.commands[0].id, "ztool.caffeine.toggle");
});

test("resolves bundled plugin kind and accent class from registry names", () => {
  assert.equal(bundledPluginKind("ztool.screenshot"), "screenshot");
  assert.equal(bundledPluginKind("ztool.caffeine"), "caffeine");
  assert.equal(bundledPluginKind("market-tool"), null);
  assert.equal(pluginAccentClass("ztool.screenshot"), "accent-screenshot");
  assert.equal(pluginAccentClass("market-tool"), "accent-extension");
});
