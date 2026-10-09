import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";
import {
  bingWallpaperMessages,
  createBingWallpaperTranslator,
} from "./i18n";

export const bingWallpaperPlugin: BundledPluginModule = {
  kind: "bing-wallpaper",
  navigationIcon: "paper",
  accentClass: "accent-bing-wallpaper",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: {
    "zh-CN": {
      title: bingWallpaperMessages["zh-CN"]["plugin.title"],
      subtitle: bingWallpaperMessages["zh-CN"]["plugin.subtitle"],
    },
    "en-US": {
      title: bingWallpaperMessages["en-US"]["plugin.title"],
      subtitle: bingWallpaperMessages["en-US"]["plugin.subtitle"],
    },
  },
  loadPanel: () => import("./BingWallpaperPanel").then(({ BingWallpaperPanel }) => ({
    default: ({ language }) => (
      <BingWallpaperPanel t={createBingWallpaperTranslator(language)} />
    ),
  })),
  surfaces: { paper: () => import("./PaperApp") },
};
