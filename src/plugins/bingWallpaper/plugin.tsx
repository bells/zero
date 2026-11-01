import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";

export const bingWallpaperPlugin: BundledPluginModule = {
  kind: "bing-wallpaper",
  navigationIcon: "paper",
  accentClass: "accent-bing-wallpaper",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: {
    "zh-CN": {
      title: metadata.displayName,
      subtitle: "浏览、下载并应用每日壁纸",
    },
    "en-US": {
      title: metadata.displayName,
      subtitle: "Browse, download, and apply daily wallpapers",
    },
  },
  loadPanel: () => import("./BingWallpaperPanel").then(({ BingWallpaperPluginPanel }) => ({
    default: BingWallpaperPluginPanel,
  })),
  loadSettings: () => import("./PaperSettings").then(({ PaperSettings }) => ({ default: PaperSettings })),
  settingsSearch: {
    "zh-CN": [{ id: "tool.zero.paper.daily", destinationId: "tool:zero.paper", title: "每日自动更换壁纸", description: "Zero 运行期间更新每日壁纸", path: "Zero Paper", keywords: ["壁纸", "每日", "自动", "daily", "wallpaper"], focusTargetId: "preference-setting-tool-zero-paper-daily" }],
    "en-US": [{ id: "tool.zero.paper.daily", destinationId: "tool:zero.paper", title: "Daily automatic wallpaper change", description: "Daily wallpaper while Zero runs", path: "Zero Paper", keywords: ["wallpaper", "daily", "automatic", "壁纸"], focusTargetId: "preference-setting-tool-zero-paper-daily" }],
  },
  surfaces: { paper: () => import("./PaperApp") },
};
