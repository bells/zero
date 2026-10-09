import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";
import { caffeineMessages, createCaffeineTranslator } from "./i18n";

export const caffeinePlugin: BundledPluginModule = {
  kind: "caffeine",
  navigationIcon: "caffeine-empty",
  accentClass: "accent-caffeine",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: {
    "zh-CN": {
      title: caffeineMessages["zh-CN"]["plugin.title"],
      subtitle: caffeineMessages["zh-CN"]["plugin.subtitle"],
    },
    "en-US": {
      title: caffeineMessages["en-US"]["plugin.title"],
      subtitle: caffeineMessages["en-US"]["plugin.subtitle"],
    },
  },
  loadPanel: () => import("./CaffeinePanel").then(({ CaffeinePanel }) => ({
    default: ({ language }) => (
      <CaffeinePanel t={createCaffeineTranslator(language)} />
    ),
  })),
};
