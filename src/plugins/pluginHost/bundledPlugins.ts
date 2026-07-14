import type { PluginManifest } from "./contracts";

export type BuiltinPluginKind = "screenshot" | "caffeine";

export const BUNDLED_PLUGIN_MANIFESTS: PluginManifest[] = [
  {
    name: "ztool.screenshot",
    version: "0.1.0",
    author: "watson",
    main: "plugins/screenshot",
    permissions: ["ui.message"],
    id: "ztool.screenshot",
    displayName: "Screenshot",
    description: "Shortcut, copy, save",
    platforms: ["macos", "windows", "linux"],
    runtime: "webview",
    contributes: {
      views: [
        {
          id: "ztool.screenshot.main",
          title: "Screenshot",
          surface: "main",
        },
      ],
      commands: [
        {
          id: "ztool.screenshot.capture",
          title: "Capture Screenshot",
        },
        {
          id: "ztool.screenshot.copy",
          title: "Capture and Copy",
        },
        {
          id: "ztool.screenshot.save",
          title: "Capture and Save",
        },
      ],
      statusBarItems: [
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
      ],
    },
  },
  {
    name: "ztool.caffeine",
    version: "0.1.0",
    author: "watson",
    main: "plugins/caffeine",
    permissions: ["ui.message"],
    id: "ztool.caffeine",
    displayName: "Caffeine",
    description: "Keep display and system awake",
    platforms: ["macos", "windows", "linux"],
    runtime: "webview",
    contributes: {
      views: [
        {
          id: "ztool.caffeine.main",
          title: "Caffeine",
          surface: "main",
        },
      ],
      commands: [
        {
          id: "ztool.caffeine.toggle",
          title: "Toggle Caffeine",
        },
      ],
      settings: [
        {
          key: "durationMinutes",
          type: "number",
          default: 0,
          label: "Duration minutes",
        },
      ],
      statusBarItems: [
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
      ],
    },
  },
];

export function bundledPluginKind(pluginId: string): BuiltinPluginKind | null {
  if (pluginId === "ztool.screenshot" || pluginId === "screenshot") {
    return "screenshot";
  }

  if (pluginId === "ztool.caffeine" || pluginId === "caffeine") {
    return "caffeine";
  }

  return null;
}

export function pluginAccentClass(pluginId: string) {
  const builtin = bundledPluginKind(pluginId);
  return builtin ? `accent-${builtin}` : "accent-extension";
}
