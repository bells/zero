import type { StatusBarIconId } from "./contracts";

export type PluginNavigationIcon = StatusBarIconId | "file";

export type PluginId = string;

export type PluginHealth =
  | "ready"
  | "active"
  | "disabled"
  | "incompatible"
  | "pending"
  | "error";

export interface PluginMeta {
  id: PluginId;
  navigationIcon?: PluginNavigationIcon;
  title: string;
  subtitle: string;
  health: PluginHealth;
  enabled?: boolean;
  viewId?: string;
}
