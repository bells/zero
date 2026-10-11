export const MAIN_NAVIGATION_EVENT = "zero://main-navigation";
export type MainWindowDestination = "tools" | "preferences";

export interface MainWindowNavigationRequest {
  destination: MainWindowDestination;
  revision: number;
  pluginId?: string;
}

export function acceptMainNavigation(
  current: MainWindowNavigationRequest,
  incoming: MainWindowNavigationRequest,
): MainWindowNavigationRequest {
  return Number.isSafeInteger(incoming.revision) && incoming.revision > current.revision
    && (incoming.pluginId === undefined || (typeof incoming.pluginId === "string" && incoming.pluginId.length > 0 && incoming.pluginId.length <= 128))
    && (incoming.destination === "tools" || incoming.destination === "preferences")
    ? incoming : current;
}
