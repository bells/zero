import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";
import { createScreenshotTranslator, screenshotMessages } from "./i18n";

export const screenshotPlugin: BundledPluginModule = {
  kind: "screenshot",
  navigationIcon: "screenshot",
  accentClass: "accent-screenshot",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: {
    "zh-CN": {
      title: screenshotMessages["zh-CN"]["plugin.title"],
      subtitle: screenshotMessages["zh-CN"]["plugin.subtitle"],
    },
    "en-US": {
      title: screenshotMessages["en-US"]["plugin.title"],
      subtitle: screenshotMessages["en-US"]["plugin.subtitle"],
    },
  },
  loadPanel: () => import("./ScreenshotPanel").then(({ ScreenshotPanel }) => ({
    default: ({ language }) => (
      <ScreenshotPanel t={createScreenshotTranslator(language)} />
    ),
  })),
  surfaces: {
    capture: () => import("./capture/CaptureApp"),
    pin: () => import("./capture/PinApp"),
    "snap-menu": () => import("./SnapMenuApp"),
  },
};
