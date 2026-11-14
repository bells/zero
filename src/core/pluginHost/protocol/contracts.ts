/** Host consumers retain their existing import path for SDK-owned public contracts. */
export type * from "../../../sdk/contracts";

/** Host-only registry state is not exposed through the plugin bridge. */
export interface PluginRegistrySnapshot { revision: number; records: import("../contracts").PluginRecord[] }
