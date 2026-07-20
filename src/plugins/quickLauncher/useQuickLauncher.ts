import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  QuickLauncherActivationResult,
  QuickLauncherError,
  QuickLauncherIndexSnapshot,
  QuickLauncherResultItem,
} from "./contracts";
import {
  canActivateLauncherItem,
  moveLauncherSelection,
  reconcileLauncherSelection,
} from "./quickLauncherModel";
import {
  normalizeQuickLauncherError,
  quickLauncherService,
} from "./quickLauncherService";

export interface QuickLauncherClient {
  getSnapshot(): Promise<QuickLauncherIndexSnapshot>;
  refresh(): Promise<QuickLauncherIndexSnapshot>;
  search(query: string, limit?: number): Promise<{
    revision: number;
    query: string;
    elapsedMicros: number;
    items: QuickLauncherResultItem[];
  }>;
  getIcon(itemId: string, iconKey?: string): Promise<{ itemId: string; dataUrl?: string }>;
  activate(itemId: string, revision: number): Promise<QuickLauncherActivationResult>;
}

export function useQuickLauncher(client: QuickLauncherClient = quickLauncherService) {
  const [snapshot, setSnapshot] = useState<QuickLauncherIndexSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<QuickLauncherResultItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<QuickLauncherError | null>(null);
  const [lastAction, setLastAction] = useState<QuickLauncherActivationResult | null>(null);
  const mountedRef = useRef(false);
  const queryGenerationRef = useRef(0);
  const activationRef = useRef(false);

  const runSearch = useCallback(async (nextQuery: string) => {
    const generation = ++queryGenerationRef.current;
    try {
      const result = await client.search(nextQuery, 24);
      if (!mountedRef.current || generation !== queryGenerationRef.current) {
        return;
      }
      setRevision(result.revision);
      setItems(result.items);
      setSelectedId((current) => reconcileLauncherSelection(current, result.items));
      setError(null);
    } catch (searchError) {
      if (mountedRef.current && generation === queryGenerationRef.current) {
        setItems([]);
        setSelectedId(null);
        setError(normalizeQuickLauncherError(searchError));
      }
    } finally {
      if (mountedRef.current && generation === queryGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [client]);

  useEffect(() => {
    mountedRef.current = true;
    setIsLoading(true);
    client.getSnapshot()
      .then((nextSnapshot) => {
        if (!mountedRef.current) {
          return;
        }
        setSnapshot(nextSnapshot);
        return runSearch("").then(() => nextSnapshot);
      })
      .then((initialSnapshot) => {
        if (!initialSnapshot || !mountedRef.current || initialSnapshot.platformSupport === "unsupported") {
          return;
        }
        setIsRefreshing(true);
        return client.refresh()
          .then((nextSnapshot) => {
            if (mountedRef.current) {
              setSnapshot(nextSnapshot);
              return runSearch(query);
            }
          })
          .finally(() => {
            if (mountedRef.current) {
              setIsRefreshing(false);
            }
          });
      })
      .catch((loadError) => {
        if (mountedRef.current) {
          setError(normalizeQuickLauncherError(loadError));
          setIsLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      mountedRef.current = false;
      queryGenerationRef.current += 1;
    };
  }, [client, runSearch]);

  useEffect(() => {
    if (snapshot === null) {
      return;
    }
    setIsLoading(true);
    void runSearch(query);
  }, [query, runSearch, snapshot]);

  useEffect(() => {
    const iconItems = items.slice(0, 16).filter((item) =>
      item.kind === "application" && icons[item.id] === undefined);
    for (const item of iconItems) {
      setIcons((current) => ({ ...current, [item.id]: null }));
      client.getIcon(item.id, item.iconKey)
        .then((result) => {
          if (mountedRef.current) {
            setIcons((current) => ({
              ...current,
              [result.itemId]: result.dataUrl ?? null,
            }));
          }
        })
        .catch(() => {
          // Icon extraction is intentionally non-fatal; the row keeps its fallback glyph.
        });
    }
  }, [client, icons, items]);

  const refresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    setError(null);
    try {
      const nextSnapshot = await client.refresh();
      if (mountedRef.current) {
        setSnapshot(nextSnapshot);
        await runSearch(query);
      }
    } catch (refreshError) {
      if (mountedRef.current) {
        setError(normalizeQuickLauncherError(refreshError));
      }
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [client, isRefreshing, query, runSearch]);

  const activate = useCallback(async (itemId = selectedId) => {
    if (!itemId || activationRef.current ||
      !canActivateLauncherItem(itemId, items, activatingId)) {
      return null;
    }
    activationRef.current = true;
    setActivatingId(itemId);
    setError(null);
    try {
      const result = await client.activate(itemId, revision);
      if (mountedRef.current) {
        setLastAction(result);
        await runSearch(query);
      }
      return result;
    } catch (activationError) {
      if (mountedRef.current) {
        setError(normalizeQuickLauncherError(activationError));
      }
      return null;
    } finally {
      activationRef.current = false;
      if (mountedRef.current) {
        setActivatingId(null);
      }
    }
  }, [activatingId, client, items, query, revision, runSearch, selectedId]);

  const moveSelection = useCallback((direction: -1 | 1) => {
    setSelectedId((current) => moveLauncherSelection(current, items, direction));
  }, [items]);

  const resetTransient = useCallback(() => {
    queryGenerationRef.current += 1;
    setQuery("");
    setSelectedId(null);
    setError(null);
    setLastAction(null);
  }, []);

  return useMemo(() => ({
    snapshot,
    query,
    setQuery,
    revision,
    items,
    selectedId,
    setSelectedId,
    icons,
    isLoading,
    isRefreshing,
    activatingId,
    error,
    lastAction,
    refresh,
    activate,
    moveSelection,
    resetTransient,
  }), [
    snapshot, query, revision, items, selectedId, icons, isLoading, isRefreshing,
    activatingId, error, lastAction, refresh, activate, moveSelection, resetTransient,
  ]);
}

export type QuickLauncherController = ReturnType<typeof useQuickLauncher>;
