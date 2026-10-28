import type { PluginNavigationIcon } from "./pluginTypes";
import type { ComponentType } from "react";
import type { ResolvedLanguage } from "../preferences/i18n";
import type { PreferencesSettingDescriptor } from "../preferences/preferencesNavigation";
import type { PluginManifest } from "./contracts";

export type BundledPluginSurface = "capture" | "pin" | "launcher" | "paper";

export type PluginTranslator = (key: string) => string;

export interface PluginPresentation {
  title: string;
  subtitle: string;
}

export interface BundledPluginPanelProps {
  language: ResolvedLanguage;
  surface: "tray" | "main";
  editorRevision?: number;
  onEditorIntentConsumed?: () => void;
}

export type BundledPluginLoader<Props = Record<string, never>> = () => Promise<{
  default: ComponentType<Props>;
}>;

export interface BundledPluginSettingsProps {language:ResolvedLanguage;enabled:boolean}

export interface BundledPluginModule {
  kind: string;
  navigationIcon?: PluginNavigationIcon;
  accentClass: string;
  manifest: PluginManifest;
  presentation: Readonly<Record<ResolvedLanguage, PluginPresentation>>;
  loadPanel: BundledPluginLoader<BundledPluginPanelProps>;
  loadSettings?: BundledPluginLoader<BundledPluginSettingsProps>;
  settingsSearch?: Readonly<Record<ResolvedLanguage,readonly PreferencesSettingDescriptor[]>>;
  surfaces?: Partial<Record<BundledPluginSurface, BundledPluginLoader>>;
}

export interface RuntimeExtensionModule {
  trust: "sandboxed-runtime";
  manifest: PluginManifest;
}

export type RegisteredPluginModule =
  | ({ trust: "trusted-bundled" } & BundledPluginModule)
  | RuntimeExtensionModule;
