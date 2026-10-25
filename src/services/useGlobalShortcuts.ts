import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  globalShortcutService,
  shortcutErrorMessageKey,
  type SetSnapShortcutInput,
  type GlobalShortcutSnapshot,
} from "./globalShortcuts";

export interface GlobalShortcutServiceApi {
  getSnapshots(): Promise<GlobalShortcutSnapshot[]>;
  setSnapShortcut(input: SetSnapShortcutInput): Promise<GlobalShortcutSnapshot[]>;
}

export async function reconcileShortcutFailure(
  service: Pick<GlobalShortcutServiceApi, "getSnapshots">,
  failure: unknown,
): Promise<{ snapshots: GlobalShortcutSnapshot[] | null; error: ReturnType<typeof shortcutErrorMessageKey> }> {
  const error = shortcutErrorMessageKey(failure);
  try {
    return { snapshots: await service.getSnapshots(), error };
  } catch {
    return { snapshots: null, error };
  }
}

export function useGlobalShortcuts(refreshKey = "", service: GlobalShortcutServiceApi = globalShortcutService) {
  const [snapshots, setSnapshots] = useState<GlobalShortcutSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ReturnType<typeof shortcutErrorMessageKey> | null>(null);
  const revision = useRef(0);

  const reload = useCallback(async () => {
    const current = ++revision.current;
    setIsLoading(true);
    try {
      const next = await service.getSnapshots();
      if (revision.current === current) setSnapshots(next);
      return next;
    } catch (loadError) {
      if (revision.current === current) setError(existing => existing ?? shortcutErrorMessageKey(loadError));
      throw loadError;
    } finally {
      if (revision.current === current) setIsLoading(false);
    }
  }, [service]);

  const setShortcut = useCallback(async (input: SetSnapShortcutInput) => {
    ++revision.current;
    setIsSaving(true);
    setError(null);
    try {
      const next = await service.setSnapShortcut(input);
      ++revision.current;
      setSnapshots(next);
      return true;
    } catch (saveError) {
      const current = ++revision.current;
      const recovery = await reconcileShortcutFailure(service, saveError);
      if (revision.current === current && recovery.snapshots) setSnapshots(recovery.snapshots);
      setError(recovery.error);
      return false;
    } finally {
      setIsSaving(false);
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void reload().catch(() => undefined);
    return () => { ++revision.current; };
  }, [refreshKey, reload]);
  useEffect(() => {
    const stop = listen("global-shortcuts-changed", () => { void reload().catch(() => undefined); });
    return () => { void stop.then(unlisten => unlisten()).catch(() => undefined); };
  }, [reload]);

  return { snapshots, isLoading, isSaving, error, reload, setShortcut };
}
