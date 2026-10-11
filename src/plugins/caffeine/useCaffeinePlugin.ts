import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSurfaceActivity } from "../../core/windowing/useSurfaceActivity";
import {
  type CaffeineDurationMinutes,
  formatDurationClock,
  getRemainingMs,
} from "./caffeineDuration";
import { createCaffeineRefresh, type CaffeineSnapshot } from "./caffeineState";
import { shouldRefreshExpiredCaffeine, startCaffeinePresentationClock } from "./caffeinePresentation";

export function useCaffeinePlugin() {
  const surfaceActivity = useSurfaceActivity();
  const [snapshot, setSnapshot] = useState<CaffeineSnapshot>({
    enabled: false, started_at_ms: null, duration_minutes: null,
    expires_at_ms: null, message: "", action_error: null,
  });
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<CaffeineDurationMinutes>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busy = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [authoritativeSnapshotReady, setAuthoritativeSnapshotReady] = useState(false);
  const active = useRef(false);
  const reader = useMemo(() => createCaffeineRefresh(
    () => invoke<CaffeineSnapshot>("get_caffeine_state"),
    (next) => {
      setSnapshot(next);
      if (next.enabled) setSelectedDurationMinutes(next.duration_minutes);
      setNow(Date.now());
      setError(null);
      setAuthoritativeSnapshotReady(true);
    },
  ), []);
  const refresh = useCallback(async () => {
    try { await reader.refresh(); }
    catch (err: unknown) { if (active.current) setError(String(err)); }
  }, [reader]);

  const setKeepAwake = useCallback(async (enabled: boolean, durationMinutes: CaffeineDurationMinutes) => {
    if (busy.current) return;
    busy.current = true;
    setIsBusy(true);
    reader.invalidate();
    let failure: string | null = null;
    try {
      await invoke<CaffeineSnapshot>("toggle_keep_awake", { enabled, durationMinutes });
    } catch (err: unknown) { failure = String(err); }
    finally {
      // The response may already be superseded by a native-menu action.
      if (active.current) {
        await refresh();
        if (failure) setError(failure);
      }
      busy.current = false;
      setIsBusy(false);
    }
  }, [reader, refresh]);

  const enable = useCallback(() => { void setKeepAwake(true, selectedDurationMinutes); }, [selectedDurationMinutes, setKeepAwake]);
  const disable = useCallback(() => { void setKeepAwake(false, null); }, [setKeepAwake]);
  const selectDuration = useCallback((duration: CaffeineDurationMinutes) => {
    if (busy.current || !authoritativeSnapshotReady) return;
    if (snapshot.enabled) void setKeepAwake(true, duration);
    else setSelectedDurationMinutes(duration);
  }, [authoritativeSnapshotReady, setKeepAwake, snapshot.enabled]);

  useEffect(() => {
    active.current = surfaceActivity === "active";
    reader.invalidate();
    setAuthoritativeSnapshotReady(false);
    if (!active.current) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    // Subscribe before reading so a transition during the first read is not lost.
    void listen("caffeine-state-changed", () => { if (!disposed) void refresh(); })
      .then((stop) => {
        if (disposed) { stop(); return; }
        unlisten = stop;
        void refresh();
      })
      .catch((err: unknown) => { if (!disposed) { setError(String(err)); void refresh(); } });
    return () => {
      disposed = true;
      active.current = false;
      reader.invalidate();
      unlisten?.();
    };
  }, [reader, refresh, surfaceActivity]);

  const presentationGate = { enabled: snapshot.enabled, surfaceActivity, authoritativeSnapshotReady };
  useEffect(() => startCaffeinePresentationClock(presentationGate, {
    now: Date.now,
    setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
    clearInterval: (timer) => window.clearInterval(timer as number),
  }, setNow), [authoritativeSnapshotReady, snapshot.enabled, surfaceActivity]);
  const remainingMs = getRemainingMs(snapshot.expires_at_ms, now);
  useEffect(() => {
    if (shouldRefreshExpiredCaffeine(presentationGate, snapshot.expires_at_ms, remainingMs)) void refresh();
  }, [authoritativeSnapshotReady, refresh, remainingMs, snapshot.enabled, snapshot.expires_at_ms, surfaceActivity]);

  return {
    enabled: snapshot.enabled,
    durationMinutes: snapshot.duration_minutes,
    error,
    actionError: snapshot.action_error,
    elapsed: snapshot.enabled && snapshot.started_at_ms !== null
      ? formatDurationClock(now - snapshot.started_at_ms) : "00:00",
    remaining: remainingMs === null ? null : formatDurationClock(remainingMs),
    selectedDurationMinutes,
    isBusy: isBusy || !authoritativeSnapshotReady,
    isLoading: !authoritativeSnapshotReady,
    enable, disable, selectDuration, refresh,
  };
}
