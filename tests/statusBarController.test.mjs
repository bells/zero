import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStatusBarSettingsUpdate,
  createStatusBarUiState,
  statusBarPluginVisibilityInput,
} from "/private/tmp/ztool-status-bar-controller-test/services/statusBarController.js";

function pluginRecord(name, enabled = true, contributes = undefined, health = undefined) {
  return {
    name,
    version: "0.1.0",
    author: "watson",
    source: "bundled",
    enabled,
    health: health ?? (enabled ? "ready" : "disabled"),
    manifest: {
      name,
      version: "0.1.0",
      author: "watson",
      main: `plugins/${name}`,
      permissions: ["ui.message"],
      displayName: name === "ztool.screenshot" ? "Screenshot" : "Caffeine",
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

test("applies status bar setting updates without dropping existing item visibility", () => {
  const settings = {
    enabled: true,
    showPluginItemsOnLaunch: true,
    visiblePluginItems: {
      "ztool.screenshot": true,
      "ztool.caffeine": true,
    },
  };

  assert.deepEqual(
    applyStatusBarSettingsUpdate(settings, {
      enabled: false,
      visiblePluginItems: {
        "ztool.caffeine": false,
      },
    }),
    {
      enabled: false,
      showPluginItemsOnLaunch: true,
      visiblePluginItems: {
        "ztool.screenshot": true,
        "ztool.caffeine": false,
      },
    },
  );
  assert.deepEqual(statusBarPluginVisibilityInput("ztool.screenshot", false), {
    visiblePluginItems: {
      "ztool.screenshot": false,
    },
  });
});

test("creates preference, preview, fallback, and error state for the status bar UI", () => {
  const records = [
    pluginRecord("ztool.screenshot", true, { statusBarItems: [screenshotStatusItem] }),
    pluginRecord("ztool.caffeine", true, { statusBarItems: [caffeineStatusItem] }),
  ];
  const settings = {
    enabled: true,
    showPluginItemsOnLaunch: true,
    visiblePluginItems: {
      "ztool.screenshot": false,
      "ztool.caffeine": true,
    },
  };
  const items = [
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
      id: "ztool.caffeine.status",
      pluginName: "ztool.caffeine",
      title: "Caffeine",
      icon: "caffeine-empty",
      baseIcon: "caffeine-empty",
      activeIcon: "caffeine-full",
      action: { type: "toggle-caffeine" },
      order: 10,
      nativeVisible: false,
    },
  ];

  const uiState = createStatusBarUiState({
    records,
    settings,
    items,
    isLoading: false,
    isBusy: false,
    error: "Cannot save status bar settings",
  });

  assert.deepEqual(uiState.previewItems.map((item) => item.id), [
    "ztool.primary",
    "ztool.caffeine.status",
  ]);
  assert.deepEqual(uiState.preferenceItems.map((item) => ({
    id: item.id,
    visible: item.visible,
  })), [
    {
      id: "ztool.caffeine.status",
      visible: true,
    },
    {
      id: "ztool.screenshot.status",
      visible: false,
    },
  ]);
  assert.deepEqual(uiState.fallbackItems.map((item) => item.id), [
    "ztool.caffeine.status",
  ]);
  assert.equal(uiState.messageKey, "statusBar.message.error");
  assert.equal(uiState.messageDetail, "Cannot save status bar settings");
});
