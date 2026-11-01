import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { acceptPaperRuntime } from "./bingWallpaperModel";
import { errorMessage } from "./bingWallpaperController";
import { bingWallpaperService } from "./bingWallpaperService";
import type { BingWallpaperService } from "./bingWallpaperServiceCore";
import type { PaperRuntimeSnapshot, PaperSettings } from "./contracts";

export function usePaperRuntime(active: boolean, service: BingWallpaperService = bingWallpaperService) {
  const [runtime, setRuntime] = useState<PaperRuntimeSnapshot | null>(null);
  const [settings, setSettings] = useState<PaperSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    let stop: UnlistenFn | undefined;
    let request = 0;
    const read = async () => {
      const revision = ++request;
      try {
        const next = await service.paperRuntime();
        if (live) setRuntime(current => acceptPaperRuntime(current, next));
        const prefs = await service.paperSettings();
        if (live && revision === request) { setSettings(prefs); setError(null); }
      } catch (reason) {
        if (live && revision === request) setError(errorMessage(reason));
      }
    };
    // Subscribe before reading; an event racing the read triggers another authoritative read.
    void listen<{ revision: number }>("zero://paper-state-changed", () => { void read(); })
      .then(unlisten => {
        if (!live) { unlisten(); return; }
        stop = unlisten;
        void read();
      }).catch(reason => {
        if (live) { setError(errorMessage(reason)); void read(); }
      });
    return () => { live = false; stop?.(); };
  }, [active, service]);
  return { runtime, settings, error, setSettings };
}
