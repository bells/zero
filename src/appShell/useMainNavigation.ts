import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { acceptMainNavigation, MAIN_NAVIGATION_EVENT, type MainWindowDestination, type MainWindowNavigationRequest } from "./mainNavigation";

export function useMainNavigation() {
  const [destination, setDestination] = useState<MainWindowDestination>("tools");
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const latest = useRef<MainWindowNavigationRequest>({ destination: "tools", revision: -1 });
  const localRevision = useRef(0);

  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    const localAtStart = localRevision.current;
    const accept = (incoming: MainWindowNavigationRequest) => {
      if (!live) return;
      const next = acceptMainNavigation(latest.current, incoming);
      if (next === latest.current) return;
      latest.current = next;
      setDestination(next.destination);
      setError(null);
    };
    // Listen before reading: the retained snapshot also covers first-window creation.
    void listen<MainWindowNavigationRequest>(MAIN_NAVIGATION_EVENT, ({ payload }) => accept(payload))
      .then(async (unlisten) => {
        if (!live) { unlisten(); return; }
        stop = unlisten;
        const snapshot = await invoke<MainWindowNavigationRequest>("get_main_window_navigation");
        if (localRevision.current === localAtStart) accept(snapshot);
        if (live) setIsReady(true);
      }).catch((reason: unknown) => {
        if (live) { setError(String(reason)); setIsReady(true); }
      });
    return () => { live = false; stop?.(); };
  }, []);

  const navigate = useCallback((next: MainWindowDestination) => {
    localRevision.current += 1;
    setDestination(next);
  }, []);
  return { destination, navigate, error, isReady };
}
