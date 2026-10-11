import type { BundledPluginModule } from "../core/pluginHost/pluginModule";
import type { ExtensionLauncherClient } from "../core/pluginHost/extensionLauncherHost";

export const BUNDLED_PLUGIN_MODULES: readonly BundledPluginModule[] = [];
const unavailable = async (): Promise<never> => {
  throw new Error("Zero Launch is not included in this build");
};
export const quickLauncherService: ExtensionLauncherClient = {
  getSnapshot: unavailable,
  search: unavailable,
  activate: unavailable,
};
