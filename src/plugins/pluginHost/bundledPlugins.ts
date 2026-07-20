import type { PluginManifest } from "./contracts";

export type BuiltinPluginKind = "screenshot" | "caffeine" | "bing-wallpaper" | "quick-launcher";

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
  {
    name: "ztool.bing-wallpaper",
    version: "1.0.0",
    author: "bells",
    main: "plugins/bingWallpaper",
    permissions: ["network", "storage.plugin", "system.wallpaper"],
    id: "bing-wallpaper",
    displayName: "Bing Wallpaper",
    description: "Browse, download, and apply Bing daily wallpapers",
    platforms: ["macos", "windows", "linux"],
    runtime: "webview",
    contributes: {
      views: [
        {
          id: "ztool.bing-wallpaper.main",
          title: "Bing Wallpaper",
          surface: "main",
        },
      ],
      commands: [
        {
          id: "ztool.bing-wallpaper.refresh",
          title: "Refresh Bing wallpapers",
        },
        {
          id: "ztool.bing-wallpaper.apply",
          title: "Apply Bing wallpaper",
        },
        {
          id: "ztool.bing-wallpaper.download",
          title: "Download Bing wallpaper",
        },
      ],
    },
  },
  {
    name: "ztool.quick-launcher",
    version: "1.0.0",
    author: "bells",
    main: "plugins/quickLauncher",
    permissions: [
      "system.apps.read",
      "system.apps.execute",
      "system.window.focus",
      "system.settings.open",
    ],
    id: "quick-launcher",
    displayName: "Quick Launcher",
    description: "Search, launch, and switch local apps and system settings",
    platforms: ["macos", "windows"],
    runtime: "webview",
    contributes: {
      views: [
        {
          id: "ztool.quick-launcher.main",
          title: "Quick Launcher",
          surface: "main",
        },
      ],
      commands: [
        {
          id: "ztool.quick-launcher.show",
          title: "Show Quick Launcher",
        },
        {
          id: "ztool.quick-launcher.refresh",
          title: "Refresh application index",
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

  if (pluginId === "ztool.bing-wallpaper" || pluginId === "bing-wallpaper") {
    return "bing-wallpaper";
  }

  if (pluginId === "ztool.quick-launcher" || pluginId === "quick-launcher") {
    return "quick-launcher";
  }

  return null;
}

export function pluginAccentClass(pluginId: string) {
  const builtin = bundledPluginKind(pluginId);
  return builtin ? `accent-${builtin}` : "accent-extension";
}
