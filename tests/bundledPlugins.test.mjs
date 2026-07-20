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
      {
        name: "ztool.bing-wallpaper",
        main: "plugins/bingWallpaper",
        runtime: "webview",
      },
      {
        name: "ztool.quick-launcher",
        main: "plugins/quickLauncher",
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
  const bing = BUNDLED_PLUGIN_MANIFESTS[2];
  const launcher = BUNDLED_PLUGIN_MANIFESTS[3];

  assert.deepEqual(screenshot.platforms, ["macos", "windows", "linux"]);
  assert.deepEqual(caffeine.permissions, ["ui.message"]);
  assert.deepEqual(bing.permissions, ["network", "storage.plugin", "system.wallpaper"]);
  assert.equal(bing.id, "bing-wallpaper");
  assert.equal(bing.author, "bells");
  assert.equal(launcher.id, "quick-launcher");
  assert.equal(launcher.author, "bells");
  assert.deepEqual(launcher.platforms, ["macos", "windows"]);
  assert.deepEqual(launcher.permissions, [
    "system.apps.read",
    "system.apps.execute",
    "system.window.focus",
    "system.settings.open",
  ]);
  assert.equal(screenshot.contributes.views[0].id, "ztool.screenshot.main");
  assert.equal(caffeine.contributes.commands[0].id, "ztool.caffeine.toggle");
  assert.equal(bing.contributes.commands[1].id, "ztool.bing-wallpaper.apply");
});

test("bundled manifests declare host-mediated status bar items", () => {
  const screenshot = BUNDLED_PLUGIN_MANIFESTS[0];
  const caffeine = BUNDLED_PLUGIN_MANIFESTS[1];

  assert.deepEqual(screenshot.contributes.statusBarItems, [
    {
      id: "ztool.screenshot.status",
      title: "Screenshot",
      icon: "screenshot",
      action: {
        type: "start-screenshot",
        commandId: "ztool.screenshot.capture",
      },
      order: 20,
      visibleByDefault: true,
    },
  ]);
  assert.deepEqual(caffeine.contributes.statusBarItems, [
    {
      id: "ztool.caffeine.status",
      title: "Caffeine",
      icon: "caffeine-empty",
      activeIcon: "caffeine-full",
      action: {
        type: "toggle-caffeine",
        commandId: "ztool.caffeine.toggle",
      },
      order: 10,
      visibleByDefault: true,
    },
  ]);
});

test("resolves bundled plugin kind and accent class from registry names", () => {
  assert.equal(bundledPluginKind("ztool.screenshot"), "screenshot");
  assert.equal(bundledPluginKind("ztool.caffeine"), "caffeine");
  assert.equal(bundledPluginKind("ztool.bing-wallpaper"), "bing-wallpaper");
  assert.equal(bundledPluginKind("bing-wallpaper"), "bing-wallpaper");
  assert.equal(bundledPluginKind("ztool.quick-launcher"), "quick-launcher");
  assert.equal(bundledPluginKind("quick-launcher"), "quick-launcher");
  assert.equal(bundledPluginKind("market-tool"), null);
  assert.equal(pluginAccentClass("ztool.screenshot"), "accent-screenshot");
  assert.equal(pluginAccentClass("ztool.bing-wallpaper"), "accent-bing-wallpaper");
  assert.equal(pluginAccentClass("ztool.quick-launcher"), "accent-quick-launcher");
  assert.equal(pluginAccentClass("market-tool"), "accent-extension");
});
