import { useLayoutEffect, useState, type RefObject } from "react";
import type { Size } from "./captureSelectionModel";
import type { DrawingTool } from "./captureTypes";
export function useCapturePropertyAnchor(
  toolbarRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  tool: DrawingTool | undefined,
  viewport: Size,
  contentKey: string,
) {
  const [anchor, setAnchor] = useState({
    buttonOffset: 0,
    visible: false,
    size: { width: 0, height: 0 },
    ready: false,
  });
  useLayoutEffect(() => {
    const stack = toolbarRef.current;
    const toolbar = stack?.querySelector<HTMLElement>(".capture-toolbar-live");
    const shell = panelRef.current;
    const scroll = shell?.querySelector<HTMLElement>(
      ".capture-property-content",
    );
    const panel = shell?.querySelector<HTMLElement>(
      ".capture-annotation-properties",
    );
    const button = toolbar?.querySelector<HTMLElement>(
      `[data-capture-tool="${tool}"]`,
    );
    if (!stack || !toolbar || !shell || !scroll || !panel || !button) return;
    const update = () => {
      if (!panel.isConnected) return;
      const bar = stack.getBoundingClientRect(),
        actions = toolbar.getBoundingClientRect(),
        content = panel.getBoundingClientRect(),
        target = button.getBoundingClientRect();
      const center = target.x + target.width / 2;
      const next = {
        buttonOffset: center - bar.x,
        visible: center >= actions.left && center <= actions.right,
        size: {
          width: shell.getBoundingClientRect().width,
          height: content.height + scroll.offsetHeight - scroll.clientHeight,
        },
        ready: true,
      };
      setAnchor((current) =>
        current.buttonOffset === next.buttonOffset &&
        current.visible === next.visible &&
        current.size.width === next.size.width &&
        current.size.height === next.size.height &&
        current.ready === next.ready
          ? current
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(stack);
    observer.observe(toolbar);
    observer.observe(panel);
    observer.observe(shell);
    observer.observe(scroll);
    toolbar.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      toolbar.removeEventListener("scroll", update);
    };
  }, [toolbarRef, panelRef, tool, viewport, contentKey]);
  return anchor;
}
