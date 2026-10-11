import type { BundledPluginModule } from "../core/pluginHost/pluginModule";
import { bingWallpaperPlugin } from "../plugins/bingWallpaper/plugin";
import { caffeinePlugin } from "../plugins/caffeine/plugin";
import { filePlugin } from "../plugins/file/plugin";
import { quickLauncherPlugin } from "../plugins/quickLauncher/plugin";
import { quickLauncherService } from "../plugins/quickLauncher/quickLauncherService";
import { screenshotPlugin } from "../plugins/screenshot/plugin";

export const BUNDLED_PLUGIN_MODULES = [
  screenshotPlugin,
  caffeinePlugin,
  bingWallpaperPlugin,
  quickLauncherPlugin,
  filePlugin,
] as const satisfies readonly BundledPluginModule[];


export { quickLauncherService };
