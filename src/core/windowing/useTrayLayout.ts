import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSurfaceActivity } from "./useSurfaceActivity";
import { createTrayLayoutQueue, type TrayLayoutSession, type TrayLayoutRequest, type TrayLayoutSnapshot } from "./trayLayout";

export function useTrayLayout(pluginId: string | undefined) {
  const shellRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activity = useSurfaceActivity();

  useEffect(() => {
    const shell = shellRef.current;
    const content = contentRef.current;
    if (activity !== "active" || !shell || !content) return;
    let live = true;
    let frame = 0;
    let queue: ReturnType<typeof createTrayLayoutQueue> | undefined;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!live || !queue) return;
        const style = getComputedStyle(shell);
        const siblings = [...shell.children].filter((child) => !child.contains(content));
        const chrome = siblings.reduce((height, child) => height + child.getBoundingClientRect().height, 0)
          + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
          + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
          + parseFloat(style.rowGap) * siblings.length;
        const caret = shell.parentElement?.dataset.anchored === "true" ? 8 : 0;
        queue.measure(content.getBoundingClientRect().height + chrome + caret);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    const chromeChanges = new MutationObserver(() => {
      for (const child of shell.children) if (!child.contains(content)) observer.observe(child);
      measure();
    });
    chromeChanges.observe(shell, { childList: true });
    chromeChanges.observe(shell.parentElement!, { attributes: true, attributeFilter: ["data-anchored"] });
    for (const child of shell.children) if (!child.contains(content)) observer.observe(child);
    void invoke<TrayLayoutSession>("begin_tray_layout").then((session) => {
      if (!live) return;
      shell.style.setProperty("--tray-max-height", `${session.maxHeight}px`);
      queue = createTrayLayoutQueue(async (desiredHeight, generation) => {
        const input: TrayLayoutRequest = { session: session.session, generation, desiredHeight };
        const snapshot = await invoke<TrayLayoutSnapshot>("update_tray_layout", { input });
        if (live) shell.style.setProperty("--tray-max-height", `${snapshot.maxHeight}px`);
      });
      measure();
    }).catch(() => undefined);
    return () => {
      live = false;
      observer.disconnect();
      chromeChanges.disconnect();
      cancelAnimationFrame(frame);
      queue?.dispose();
    };
  }, [activity, pluginId]);
  return { shellRef, contentRef };
}
