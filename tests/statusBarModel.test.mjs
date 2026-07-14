import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STATUS_BAR_SETTINGS,
  createStatusBarPreview,
  getStatusBarFallbackItems,
  normalizeStatusBarSettings,
  resolveStatusBarPreferenceItems,
  resolveStatusBarItems,
} from "/private/tmp/ztool-status-bar-test/services/statusBarModel.js";

function pluginRecord(name, enabled = true, contributes = undefined, health = undefined) {
  return {
    name,
    version: "0.1.0",
    author: "watson",
    source: name.startsWith("ztool.") ? "bundled" : "market",
    enabled,
    health: health ?? (enabled ? "ready" : "disabled"),
    manifest: {
      name,
      version: "0.1.0",
      author: "watson",
      main: `plugins/${name}`,
      permissions: ["ui.message"],
      displayName: name === "ztool.screenshot"
        ? "Screenshot"
        : name === "ztool.caffeine"
          ? "Caffeine"
          : "Market Tool",
      description: "Plugin description",
      contributes,
    },
    approvedPermissions: ["ui.message"],
  };
}

const screenshotStatusItem = {
  id: "ztool.screenshot.status",
  title: "Screenshot",
  icon: "screenshot",
  action: { type: "start-screenshot" },
  order: 20,
  visibleByDefault: true,
};

const caffeineStatusItem = {
  id: "ztool.caffeine.status",
  title: "Caffeine",
  icon: "caffeine-empty",
  activeIcon: "caffeine-full",
  action: { type: "toggle-caffeine" },
  order: 10,
  visibleByDefault: true,
};

const marketStatusItem = {
  id: "market-tool.status",
  title: "Market Tool",
  icon: "extension",
  action: { type: "open-plugin" },
  order: 100,
  visibleByDefault: true,
};

test("normalizes missing status bar settings to native startup defaults", () => {
  assert.deepEqual(
    normalizeStatusBarSettings(undefined, [
      pluginRecord("ztool.screenshot"),
      pluginRecord("ztool.caffeine"),
    ]),
    {
      enabled: true,
      showPluginItemsOnLaunch: true,
      visiblePluginItems: {
        "ztool.screenshot": true,
        "ztool.caffeine": true,
      },
    },
  );

  assert.equal(DEFAULT_STATUS_BAR_SETTINGS.enabled, true);
});

test("resolves primary item plus enabled visible plugin items in deterministic order", () => {
  const records = [
    pluginRecord("ztool.screenshot", true, { statusBarItems: [screenshotStatusItem] }),
    pluginRecord("ztool.caffeine", true, { statusBarItems: [caffeineStatusItem] }),
    pluginRecord("market-tool", true, { statusBarItems: [marketStatusItem] }),
  ];
  const settings = normalizeStatusBarSettings(
    {
      visiblePluginItems: {
        "market-tool": false,
      },
    },
    records,
  );

  assert.deepEqual(
    resolveStatusBarItems({
      records,
      settings,
      caffeineEnabled: true,
      platformSupportsNativeMultiItem: true,
    }).map((item) => ({
      id: item.id,
      pluginName: item.pluginName,
      icon: item.icon,
      actionType: item.action.type,
      nativeVisible: item.nativeVisible,
    })),
    [
      {
        id: "ztool.primary",
        pluginName: null,
        icon: "ztool",
        actionType: "toggle-tray",
        nativeVisible: true,
      },
      {
        id: "ztool.caffeine.status",
        pluginName: "ztool.caffeine",
        icon: "caffeine-full",
        actionType: "toggle-caffeine",
        nativeVisible: true,
      },
      {
        id: "ztool.screenshot.status",
        pluginName: "ztool.screenshot",
        icon: "screenshot",
        actionType: "start-screenshot",
        nativeVisible: true,
      },
    ],
  );
});

test("omits disabled plugins and keeps primary item recoverable", () => {
  const records = [
    pluginRecord("ztool.screenshot", false, { statusBarItems: [screenshotStatusItem] }),
    pluginRecord("ztool.caffeine", true, { statusBarItems: [caffeineStatusItem] }),
  ];
  const settings = normalizeStatusBarSettings(
    {
      enabled: false,
      visiblePluginItems: {
        "ztool.caffeine": false,
      },
    },
    records,
  );

  assert.deepEqual(
    resolveStatusBarItems({
      records,
      settings,
      caffeineEnabled: false,
      platformSupportsNativeMultiItem: true,
    }).map((item) => item.id),
    ["ztool.primary"],
  );
});

test("preview and fallback action row share the same filtered plugin items", () => {
  const records = [
    pluginRecord("ztool.screenshot", true, { statusBarItems: [screenshotStatusItem] }),
    pluginRecord("ztool.caffeine", true, { statusBarItems: [caffeineStatusItem] }),
  ];
  const settings = normalizeStatusBarSettings(
    {
      visiblePluginItems: {
        "ztool.screenshot": false,
      },
    },
    records,
  );
  const items = resolveStatusBarItems({
    records,
    settings,
    caffeineEnabled: false,
    platformSupportsNativeMultiItem: false,
  });

  assert.deepEqual(createStatusBarPreview(items).map((item) => item.id), [
    "ztool.primary",
    "ztool.caffeine.status",
  ]);
  assert.deepEqual(getStatusBarFallbackItems(items).map((item) => item.id), [
    "ztool.caffeine.status",
  ]);
  assert.equal(items.find((item) => item.id === "ztool.caffeine.status").nativeVisible, false);
});

test("preference rows include hidden enabled plugin items so users can restore them", () => {
  const records = [
    pluginRecord("ztool.screenshot", true, { statusBarItems: [screenshotStatusItem] }),
    pluginRecord("ztool.caffeine", true, { statusBarItems: [caffeineStatusItem] }),
  ];
  const settings = normalizeStatusBarSettings(
    {
      visiblePluginItems: {
        "ztool.caffeine": false,
      },
    },
    records,
  );

  assert.deepEqual(
    resolveStatusBarPreferenceItems({ records, settings }).map((item) => ({
      id: item.id,
      pluginName: item.pluginName,
      icon: item.icon,
      visible: item.visible,
      disabled: item.disabled,
    })),
    [
      {
        id: "ztool.caffeine.status",
        pluginName: "ztool.caffeine",
        icon: "caffeine-empty",
        visible: false,
        disabled: false,
      },
      {
        id: "ztool.screenshot.status",
        pluginName: "ztool.screenshot",
        icon: "screenshot",
        visible: true,
        disabled: false,
      },
    ],
  );
});

test("fallback action row omits plugin items already visible as native status items", () => {
  const nativeItems = [
    {
      id: "ztool.primary",
      pluginName: null,
      title: "ZTool",
      icon: "ztool",
      baseIcon: "ztool",
      action: { type: "toggle-tray" },
      order: 0,
      nativeVisible: true,
    },
    {
      id: "ztool.screenshot.status",
      pluginName: "ztool.screenshot",
      title: "Screenshot",
      icon: "screenshot",
      baseIcon: "screenshot",
      action: { type: "start-screenshot" },
      order: 20,
      nativeVisible: true,
    },
  ];

  assert.deepEqual(getStatusBarFallbackItems(nativeItems), []);
});
