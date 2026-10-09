import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";
import { createFileTranslator, fileMessages } from "./i18n";

export const filePlugin: BundledPluginModule = {
  kind: "file",
  navigationIcon: "file",
  accentClass: "accent-file",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: {
    "zh-CN": {
      title: fileMessages["zh-CN"]["plugin.title"],
      subtitle: fileMessages["zh-CN"]["plugin.subtitle"],
    },
    "en-US": {
      title: fileMessages["en-US"]["plugin.title"],
      subtitle: fileMessages["en-US"]["plugin.subtitle"],
    },
  },
  loadPanel: () => import("./FilePanel").then(({ FilePanel }) => ({
    default: ({ language }) => <FilePanel t={createFileTranslator(language)} />,
  })),
};
