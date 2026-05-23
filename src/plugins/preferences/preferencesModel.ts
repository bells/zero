import type { PluginId } from "../types";

export interface AppPreferences {
  launchAtLogin: boolean;
  visibleTools: Record<PluginId, boolean>;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  launchAtLogin: false,
  visibleTools: {
    screenshot: true,
    caffeine: true,
  },
};

export function normalizePreferences(
  value: unknown,
  pluginIds: PluginId[],
): AppPreferences {
  const input = isPreferenceShape(value) ?? {};
  const visibleTools = pluginIds.reduce(
    (result, pluginId) => ({
      ...result,
      [pluginId]: input.visibleTools?.[pluginId] ?? true,
    }),
    {} as Record<PluginId, boolean>,
  );

  return {
    launchAtLogin: input.launchAtLogin ?? false,
    visibleTools: ensureAtLeastOneVisible(visibleTools, pluginIds),
  };
}

export function getVisiblePluginIds(
  pluginIds: PluginId[],
  preferences: AppPreferences,
): PluginId[] {
  return pluginIds.filter((pluginId) => preferences.visibleTools[pluginId]);
}

export function setToolVisibility(
  preferences: AppPreferences,
  pluginId: PluginId,
  visible: boolean,
  pluginIds: PluginId[],
): AppPreferences {
  const visibleTools = ensureAtLeastOneVisible(
    {
      ...preferences.visibleTools,
      [pluginId]: visible,
    },
    pluginIds,
  );

  return {
    ...preferences,
    visibleTools,
  };
}

function ensureAtLeastOneVisible(
  visibleTools: Record<PluginId, boolean>,
  pluginIds: PluginId[],
) {
  if (pluginIds.some((pluginId) => visibleTools[pluginId])) {
    return visibleTools;
  }

  const firstPluginId = pluginIds[0];
  if (!firstPluginId) {
    return visibleTools;
  }

  return {
    ...visibleTools,
    [firstPluginId]: true,
  };
}

function isPreferenceShape(value: unknown): Partial<AppPreferences> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Partial<AppPreferences>;
}
