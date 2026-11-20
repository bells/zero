import { useCallback, useEffect, useState } from "react";
import type { PluginMarketEntry, PluginMarketSnapshot } from "./contracts";
import {
  INITIAL_PLUGIN_MARKET_STATE,
  marketRefreshFailed,
  marketRefreshStarted,
  marketRefreshSucceeded,
  type PluginMarketState,
} from "./pluginMarketModel";
import { pluginHostService } from "./pluginHostService";

export interface PluginMarketService {
  refreshMarket(): Promise<PluginMarketSnapshot>;
  listMarketPlugins(): Promise<PluginMarketEntry[]>;
}

export function usePluginMarket(
  service: PluginMarketService = pluginHostService,
) {
  const [state, setState] = useState<PluginMarketState>(
    INITIAL_PLUGIN_MARKET_STATE,
  );

  const refresh = useCallback(async () => {
    setState((current) => marketRefreshStarted(current));
    try {
      const snapshot = await service.refreshMarket();
      setState(marketRefreshSucceeded(snapshot));
      return snapshot;
    } catch (error) {
      setState((current) => marketRefreshFailed(current, error));
      throw error;
    }
  }, [service]);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  const loadCached = useCallback(async () => {
    setState((current) => marketRefreshStarted(current));
    try {
      const entries = await service.listMarketPlugins();
      const snapshot: PluginMarketSnapshot = {
        sourceUrl: "",
        schemaVersion: 1,
        entries,
        stale: true,
      };
      setState((current) => ({
        ...marketRefreshSucceeded({...snapshot, catalog: current.catalog}),
        sourceUrl: current.sourceUrl,
        updatedAt: current.updatedAt,
      }));
      return entries;
    } catch (error) {
      setState((current) => marketRefreshFailed(current, error));
      throw error;
    }
  }, [service]);

  return {
    ...state,
    refresh,
    loadCached,
  };
}
