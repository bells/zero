import { useLayoutEffect, useState, type RefObject } from "react";
import { resolveAnnotationPanelAnchor } from "./captureToolbarModel";
import type { DrawingTool } from "./captureTypes";

export function useCapturePropertyAnchor(
  stackRef: RefObject<HTMLDivElement | null>,
  tool: DrawingTool | undefined,
) {
  const [anchor, setAnchor] = useState({ left: 0, caretLeft: 24, visible: false });
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const toolbar = stack?.querySelector<HTMLElement>(".capture-toolbar-live");
    const panel = stack?.querySelector<HTMLElement>(".capture-property-shell");
    const button = toolbar?.querySelector<HTMLElement>(
      `[data-capture-tool="${tool}"]`,
    );
    if (!stack || !toolbar || !panel || !button) return;
    const update = () => {
      const stackRect = stack.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const next = resolveAnnotationPanelAnchor(
        {
          x: buttonRect.x - stackRect.x,
          y: 0,
          width: buttonRect.width,
          height: buttonRect.height,
        },
        panel.getBoundingClientRect().width,
        stackRect.width,
      );
      const center = buttonRect.x + buttonRect.width / 2;
      next.visible =
        next.visible && center >= toolbarRect.left && center <= toolbarRect.right;
      setAnchor((current) =>
        current.left === next.left &&
        current.caretLeft === next.caretLeft &&
        current.visible === next.visible
          ? current
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(stack);
    observer.observe(toolbar);
    observer.observe(panel);
    toolbar.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      toolbar.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [stackRef, tool]);
  return anchor;
}
