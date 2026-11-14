import type { HostCapability } from "./protocol/contracts";

export interface PluginHostCapabilities {
  hostVersion: string;
  apiVersion: string;
  runtimeEnabled: boolean;
  capabilities: HostCapability[];
}
