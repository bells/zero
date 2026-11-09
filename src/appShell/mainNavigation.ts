export const MAIN_NAVIGATION_EVENT = "zero://main-navigation";
export type MainWindowDestination = "tools" | "preferences";

export function isToolVisibleInNavigation(
  pluginId: string,
  visiblePluginIds: readonly string[],
  requestedPluginId?: string,
): boolean {
  return visiblePluginIds.includes(pluginId) || pluginId === requestedPluginId;
}

export interface MainWindowNavigationRequest {
  destination: MainWindowDestination;
  revision: number;
  pluginId?: string;
  intent?: "editCustom";
}

export function acceptMainNavigation(
  current: MainWindowNavigationRequest,
  incoming: MainWindowNavigationRequest,
): MainWindowNavigationRequest {
  return (incoming.intent === undefined || incoming.intent === "editCustom") && Number.isSafeInteger(incoming.revision) && incoming.revision > current.revision
    && (incoming.pluginId === undefined || (typeof incoming.pluginId === "string" && incoming.pluginId.length > 0 && incoming.pluginId.length <= 128))
    && (incoming.destination === "tools" || incoming.destination === "preferences")
    ? incoming : current;
}
