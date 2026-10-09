import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";
import {
  createQuickLauncherTranslator,
  quickLauncherMessages,
} from "./i18n";

export const quickLauncherPlugin: BundledPluginModule = {
  kind: "quick-launcher",
  navigationIcon: "launch",
  accentClass: "accent-quick-launcher",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: {
    "zh-CN": {
      title: quickLauncherMessages["zh-CN"]["plugin.title"],
      subtitle: quickLauncherMessages["zh-CN"]["plugin.subtitle"],
    },
    "en-US": {
      title: quickLauncherMessages["en-US"]["plugin.title"],
      subtitle: quickLauncherMessages["en-US"]["plugin.subtitle"],
    },
  },
  loadPanel: () => import("./QuickLauncherPanel").then(({ QuickLauncherPanel }) => ({
    default: ({ language }) => (
      <QuickLauncherPanel t={createQuickLauncherTranslator(language)} />
    ),
  })),
  surfaces: { launcher: () => import("./QuickLauncherApp") },
};
