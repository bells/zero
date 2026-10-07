import { listen } from "@tauri-apps/api/event";
import { createRegistryRefresh } from "./registryRefresh";
import type { PluginRegistrySnapshot, PluginRegistryChanged } from "./protocol/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PluginIdentityInput,
  PluginLifecycleResult,
  PluginRecord,
  SetPluginEnabledInput,
} from "./contracts";
import {
  createPluginHostState,
  pluginHostActionFailed,
  type PluginHostState,
} from "./pluginHostModel";
import { pluginHostService } from "./pluginHostService";

export interface PluginHostLifecycleService {
  listPlugins(): Promise<PluginRecord[]>;
  registrySnapshot(): Promise<PluginRegistrySnapshot>;
  uninstallPlugin(input: PluginIdentityInput): Promise<PluginLifecycleResult>;
  setPluginEnabled(input: SetPluginEnabledInput): Promise<PluginRecord>;
  restoreBundledPlugins(): Promise<PluginRecord[]>;
}

export function usePluginHost(
  service: PluginHostLifecycleService = pluginHostService,
) {
  const [records, setRecords] = useState<PluginRecord[]>([]);
  const [selectedPluginName, setSelectedPluginName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivedState = useMemo(
    () => createPluginHostState(records, selectedPluginName),
    [records, selectedPluginName],
  );

  const hostState: PluginHostState = {
    ...derivedState,
    isLoading,
    isBusy,
    error,
  };

  const refresh = useMemo(() => createRegistryRefresh(
    () => service.registrySnapshot(),
    snapshot => setRecords(snapshot.records),
  ), [service]);
  const loadPlugins = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try { await refresh.refresh(); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)); throw loadError; }
    finally { setIsLoading(false); }
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const onError = (cause: unknown) => { if (!disposed) setError(String(cause)); };
    void listen<PluginRegistryChanged>("plugin-registry-changed", event => {
      void refresh.refresh(event.payload.revision).catch(onError);
    }).then(cleanup => {
      if (disposed) cleanup(); else { unlisten = cleanup; void loadPlugins().catch(onError); }
    }).catch(onError);
    void loadPlugins().catch(onError);
    const onFocus = () => { void refresh.refresh().catch(onError); };
    window.addEventListener("focus", onFocus);
    return () => { disposed = true; unlisten?.(); window.removeEventListener("focus", onFocus); };
  }, [loadPlugins, refresh]);

  useEffect(() => {
    if (derivedState.activePlugin?.name && derivedState.activePlugin.name !== selectedPluginName) {
      setSelectedPluginName(derivedState.activePlugin.name);
    }

    if (!derivedState.activePlugin && selectedPluginName) {
      setSelectedPluginName(null);
    }
  }, [derivedState.activePlugin, selectedPluginName]);

  const runLifecycleAction = useCallback(
    async <T,>(action: () => Promise<T>) => {
      setIsBusy(true);
      setError(null);
      try {
        const result = await action();
        await loadPlugins();
        return result;
      } catch (actionError) {
        const failed = pluginHostActionFailed(hostState, actionError);
        setError(failed.error);
        throw actionError;
      } finally {
        setIsBusy(false);
      }
    },
    [hostState, loadPlugins],
  );

  const setPluginEnabled = useCallback(
    (input: SetPluginEnabledInput) =>
      runLifecycleAction(() => service.setPluginEnabled(input)),
    [runLifecycleAction, service],
  );

  const uninstallPlugin = useCallback(
    (input: PluginIdentityInput) =>
      runLifecycleAction(() => service.uninstallPlugin(input)),
    [runLifecycleAction, service],
  );

  const restoreBundledPlugins = useCallback(
    () => runLifecycleAction(() => service.restoreBundledPlugins()),
    [runLifecycleAction, service],
  );

  return {
    ...hostState,
    reload: loadPlugins,
    setSelectedPluginName,
    setPluginEnabled,
    uninstallPlugin,
    restoreBundledPlugins,
  };
}

export type PluginHostController = ReturnType<typeof usePluginHost>;
