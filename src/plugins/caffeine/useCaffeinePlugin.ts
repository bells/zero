import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CaffeineSnapshot {
  enabled: boolean;
  started_at_ms: number | null;
  message: string;
}

export function useCaffeinePlugin() {
  const [snapshot, setSnapshot] = useState<CaffeineSnapshot>({
    enabled: false,
    started_at_ms: null,
    message: "正在读取状态",
  });
  const [isBusy, setIsBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await invoke<CaffeineSnapshot>("get_caffeine_state");
    setSnapshot(next);
    setError(null);
  }, []);

  const toggle = useCallback(async () => {
    if (isBusy) return;

    setIsBusy(true);
    try {
      const next = await invoke<CaffeineSnapshot>("toggle_keep_awake", {
        enabled: !snapshot.enabled,
      });
      setSnapshot(next);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, snapshot.enabled]);

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
  }, [refresh]);

  useEffect(() => {
    if (!snapshot.enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot.enabled]);

  const elapsed = useMemo(() => {
    if (!snapshot.enabled || !snapshot.started_at_ms) return "00:00";

    const totalSeconds = Math.max(0, Math.floor((now - snapshot.started_at_ms) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
    }

    return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }, [now, snapshot.enabled, snapshot.started_at_ms]);

  return {
    enabled: snapshot.enabled,
    message: error ? `设置失败: ${error}` : snapshot.message,
    elapsed,
    isBusy,
    toggle,
    refresh,
  };
}
