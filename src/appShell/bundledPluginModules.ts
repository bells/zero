import { createExtensionLauncherHostApis } from "../core/pluginHost/extensionLauncherHost";
import type {
  BundledPluginSurface,
} from "../core/pluginHost/pluginModule";
import { createBundledPluginRegistry } from "../core/pluginHost/pluginModuleRegistry";
import type { ResolvedLanguage } from "../core/preferences/i18n";
import { BUNDLED_PLUGIN_MODULES, quickLauncherService } from "./bundledPluginCatalog.full";

export { BUNDLED_PLUGIN_MODULES };

export const bundledPluginRegistry = createBundledPluginRegistry(
  BUNDLED_PLUGIN_MODULES,
);

export const BUNDLED_PLUGIN_MANIFESTS = bundledPluginRegistry.manifests;

export const launcherExtensionHostApis = createExtensionLauncherHostApis(
  quickLauncherService,
);

export function bundledPluginModule(pluginId: string) {
  return bundledPluginRegistry.find(pluginId);
}

export function bundledPluginKind(pluginId: string) {
  return bundledPluginModule(pluginId)?.kind ?? null;
}

export function pluginAccentClass(pluginId: string) {
  return bundledPluginModule(pluginId)?.accentClass ?? "accent-extension";
}

export function bundledPluginPresentation(
  pluginId: string,
  language: ResolvedLanguage,
) {
  return bundledPluginModule(pluginId)?.presentation[language];
}

export function bundledPluginPanelLoader(pluginId: string) {
  return bundledPluginModule(pluginId)?.loadPanel;
}

export function bundledPluginSurfaceLoader(
  surface: BundledPluginSurface,
) {
  return BUNDLED_PLUGIN_MODULES.find((module) => module.surfaces?.[surface])
    ?.surfaces?.[surface];
}
