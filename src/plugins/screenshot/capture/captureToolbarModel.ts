import type { Bounds } from "./captureCanvas.js";
import type { Size } from "./captureSelectionModel.js";

export const CAPTURE_TOOLBAR_SAFE_MARGIN = 8;
export const CAPTURE_TOOLBAR_GAP = 8;
export const CAPTURE_TOOLBAR_INSET = 8;

export type CaptureToolbarPlacement =
  | "outside-bottom"
  | "inside-bottom"
  | "outside-top"
  | "viewport-clamped";

export interface CaptureToolbarPosition {
  left: number;
  top: number;
  placement: CaptureToolbarPlacement;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) {
    return minimum;
  }
  return Math.max(minimum, Math.min(value, maximum));
}

function preferredToolbarPosition(
  selection: Bounds,
  toolbar: Size,
  viewport: Size,
): CaptureToolbarPosition {
  const maximumLeft =
    viewport.width - toolbar.width - CAPTURE_TOOLBAR_SAFE_MARGIN;
  const preferredLeft = selection.x + selection.width - toolbar.width;
  const left = clamp(preferredLeft, CAPTURE_TOOLBAR_SAFE_MARGIN, maximumLeft);

  const outsideBottomTop = selection.y + selection.height + CAPTURE_TOOLBAR_GAP;
  if (
    outsideBottomTop + toolbar.height <=
    viewport.height - CAPTURE_TOOLBAR_SAFE_MARGIN
  ) {
    return { left, top: outsideBottomTop, placement: "outside-bottom" };
  }

  const insideBottomTop =
    selection.y + selection.height - toolbar.height - CAPTURE_TOOLBAR_INSET;
  if (selection.height >= toolbar.height + CAPTURE_TOOLBAR_INSET * 2) {
    return { left, top: insideBottomTop, placement: "inside-bottom" };
  }

  const outsideTop = selection.y - toolbar.height - CAPTURE_TOOLBAR_GAP;
  if (outsideTop >= CAPTURE_TOOLBAR_SAFE_MARGIN) {
    return { left, top: outsideTop, placement: "outside-top" };
  }

  const maximumTop =
    viewport.height - toolbar.height - CAPTURE_TOOLBAR_SAFE_MARGIN;
  return {
    left,
    top: clamp(insideBottomTop, CAPTURE_TOOLBAR_SAFE_MARGIN, maximumTop),
    placement: "viewport-clamped",
  };
}

export function resolveCaptureToolbarPosition(
  selection: Bounds,
  toolbar: Size,
  viewport: Size,
  avoid: Bounds | null = null,
): CaptureToolbarPosition {
  const preferred = preferredToolbarPosition(selection, toolbar, viewport);
  if (!avoid) return preferred;
  const overlap = (left: number, top: number) =>
    Math.max(
      0,
      Math.min(left + toolbar.width, avoid.x + avoid.width) -
        Math.max(left, avoid.x),
    ) *
    Math.max(
      0,
      Math.min(top + toolbar.height, avoid.y + avoid.height) -
        Math.max(top, avoid.y),
    );
  if (overlap(preferred.left, preferred.top) === 0) return preferred;
  const margin = CAPTURE_TOOLBAR_SAFE_MARGIN,
    gap = CAPTURE_TOOLBAR_GAP;
  const candidates = [
    { left: preferred.left, top: avoid.y + avoid.height + gap },
    { left: preferred.left, top: avoid.y - toolbar.height - gap },
    { left: avoid.x + avoid.width + gap, top: preferred.top },
    { left: avoid.x - toolbar.width - gap, top: preferred.top },
  ];
  let best = preferred;
  for (const next of candidates) {
    const candidate = {
      left: clamp(next.left, margin, viewport.width - toolbar.width - margin),
      top: clamp(next.top, margin, viewport.height - toolbar.height - margin),
      placement: "viewport-clamped" as const,
    };
    if (overlap(candidate.left, candidate.top) < overlap(best.left, best.top))
      best = candidate;
  }
  return best;
}
