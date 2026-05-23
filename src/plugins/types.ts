export type PluginId = "caffeine" | "screenshot";

export type PluginHealth = "ready" | "active" | "pending" | "error";

export interface PluginMeta {
  id: PluginId;
  title: string;
  subtitle: string;
  health: PluginHealth;
}
