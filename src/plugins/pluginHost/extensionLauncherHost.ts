import type { QuickLauncherActivateInput, QuickLauncherSearchInput } from "../quickLauncher/contracts";
import { quickLauncherService } from "../quickLauncher/quickLauncherService";
import type { ExtensionHostApis } from "./extensionBridge";

export interface ExtensionLauncherClient {
  getSnapshot(): Promise<unknown>;
  search(query: string, limit?: number): Promise<unknown>;
  activate(itemId: string, revision: number): Promise<unknown>;
}

export function createExtensionLauncherHostApis(
  client: ExtensionLauncherClient = quickLauncherService,
): Pick<
  ExtensionHostApis,
  | "launcherScanApps"
  | "launcherSearch"
  | "launcherLaunchOrFocus"
  | "launcherOpenSystemSetting"
> {
  const activate = (_pluginName: string, input: QuickLauncherActivateInput) =>
    client.activate(input.itemId, input.revision);
  return {
    launcherScanApps: () => client.getSnapshot(),
    launcherSearch: (_pluginName: string, input: QuickLauncherSearchInput) =>
      client.search(input.query, input.limit),
    launcherLaunchOrFocus: activate,
    launcherOpenSystemSetting: activate,
  };
}
