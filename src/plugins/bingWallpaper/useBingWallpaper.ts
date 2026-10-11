import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSurfaceActivity } from "../../core/windowing/useSurfaceActivity";

import {
  createActionGate,
  createRequestGate,
  errorMessage,
  loadBingWallpaperCacheFirst,
  nextBingWallpaperReloadVersion,
  shouldStartBingWallpaperPresentation,
} from "./bingWallpaperController";
import {
  createBingWallpaperNavigation,
  resolveBingWallpaperSelection,
  selectNewerBingWallpaper,
  selectOlderBingWallpaper,
  sortBingWallpapers,
} from "./bingWallpaperModel";
import { getBingWallpaperCache } from "./bingWallpaperCache";
import { bingWallpaperService } from "./bingWallpaperService";
import type { BingWallpaperService } from "./bingWallpaperServiceCore";
import type {
  BingWallpaperActionResult,
  BingWallpaperSnapshot,
} from "./contracts";

export type BingWallpaperActionStatus = "applied" | "saved" | null;

interface BingWallpaperPreviewView {
  wallpaperId: string;
  resourceUrl: string;
}

export function useBingWallpaper(
  service: BingWallpaperService = bingWallpaperService,
) {
  const activity = useSurfaceActivity();
  const cache = useMemo(() => getBingWallpaperCache(service), [service]);
  const forceRefreshRef = useRef(false);
  const [snapshot, setSnapshot] = useState<BingWallpaperSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<BingWallpaperPreviewView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<BingWallpaperActionStatus>(null);
  const [actionResult, setActionResult] = useState<BingWallpaperActionResult | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const mountedRef = useRef(true);
  const actionGateRef = useRef(createActionGate());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldStartBingWallpaperPresentation(activity)) {
      setIsRefreshing(false);
      return;
    }
    const gate = createRequestGate();
    let snapshotCount = 0;
    setIsLoading(true);
    setIsRefreshing(false);
    setError(null);

    const forceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    void loadBingWallpaperCacheFirst(
      { snapshot: service.snapshot, refresh: () => cache.refresh(forceRefresh) },
      gate,
      (nextSnapshot) => {
        snapshotCount += 1;
        const sortedItems = sortBingWallpapers(nextSnapshot.items);
        setSnapshot({ ...nextSnapshot, items: sortedItems });
        setSelectedId((current) =>
          resolveBingWallpaperSelection(sortedItems, current));
        setIsLoading(false);
        setIsRefreshing(snapshotCount === 1);
        if (snapshotCount > 1) {
          setIsRefreshing(false);
        }
      },
      (message) => {
        setError(message);
        setIsLoading(false);
        setIsRefreshing(false);
      },
    );

    return gate.dispose;
  }, [activity, cache, reloadVersion, service]);

  const navigation = useMemo(
    () => createBingWallpaperNavigation(snapshot?.items ?? [], selectedId),
    [selectedId, snapshot?.items],
  );

  useEffect(() => {
    const selected = navigation.selected;
    if (!shouldStartBingWallpaperPresentation(activity) || !selected) {
      setPreview(null);
      setIsPreviewLoading(false);
      return;
    }

    const gate = createRequestGate();
    let ownedResourceUrl: string | null = null;
    setPreviewError(null);
    const releaseOwnedPreview = () => {
      if (ownedResourceUrl) {
        URL.revokeObjectURL(ownedResourceUrl);
        ownedResourceUrl = null;
      }
    };
    const showPreview = (blob: Blob) => {
      if (!gate.isCurrent()) return;
      ownedResourceUrl = URL.createObjectURL(blob);
      setPreview({ wallpaperId: selected.id, resourceUrl: ownedResourceUrl });
      setIsPreviewLoading(false);
    };
    const cached = cache.peek(selected.id);
    if (cached) {
      showPreview(cached);
    } else {
      setPreview(null);
      setIsPreviewLoading(true);
      void cache.preview(selected.id)
        .then(showPreview)
        .catch((previewError: unknown) => {
          if (gate.isCurrent()) {
            setPreview(null);
            setPreviewError(errorMessage(previewError));
          }
        })
        .finally(() => {
          if (gate.isCurrent()) setIsPreviewLoading(false);
        });
    }

    return () => {
      gate.dispose();
      releaseOwnedPreview();
    };
  }, [activity, cache, navigation.selected?.id, reloadVersion]);

  const selectOlder = useCallback(() => {
    setSelectedId((current) =>
      selectOlderBingWallpaper(snapshot?.items ?? [], current));
    setActionStatus(null);
  }, [snapshot?.items]);

  const selectNewer = useCallback(() => {
    setSelectedId((current) =>
      selectNewerBingWallpaper(snapshot?.items ?? [], current));
    setActionStatus(null);
  }, [snapshot?.items]);

  const apply = useCallback(async () => {
    const selected = navigation.selected;
    if (!selected || !actionGateRef.current.tryStart("apply")) {
      return null;
    }
    setIsApplying(true);
    setError(null);
    setActionStatus(null);
    try {
      const result = await service.apply({ wallpaperId: selected.id });
      if (mountedRef.current) {
        setActionResult(result);
        setActionStatus("applied");
      }
      return result;
    } catch (applyError) {
      if (mountedRef.current) {
        setError(errorMessage(applyError));
      }
      return null;
    } finally {
      actionGateRef.current.finish("apply");
      if (mountedRef.current) {
        setIsApplying(false);
      }
    }
  }, [navigation.selected, service]);

  const save = useCallback(async () => {
    const selected = navigation.selected;
    if (!selected || !actionGateRef.current.tryStart("save")) {
      return null;
    }
    setIsSaving(true);
    setError(null);
    setActionStatus(null);
    try {
      const result = await service.save({ wallpaperId: selected.id });
      if (mountedRef.current) {
        setActionResult(result);
        setActionStatus("saved");
      }
      return result;
    } catch (saveError) {
      if (mountedRef.current) {
        setError(errorMessage(saveError));
      }
      return null;
    } finally {
      actionGateRef.current.finish("save");
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [navigation.selected, service]);

  const retry = useCallback(() => {
    forceRefreshRef.current = true;
    setReloadVersion(nextBingWallpaperReloadVersion);
  }, []);

  return {
    snapshot,
    navigation,
    preview,
    isLoading,
    isRefreshing,
    isPreviewLoading: isPreviewLoading || Boolean(
      navigation.selected && !previewError && preview?.wallpaperId !== navigation.selected.id,
    ),
    isSaving,
    isApplying,
    error: previewError ?? error,
    actionStatus,
    actionResult,
    selectOlder,
    selectNewer,
    apply,
    save,
    retry,
  };
}
