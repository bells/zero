import type { Bounds } from "./captureCanvas.js";
import type { Size } from "./captureSelectionModel.js";

export const CAPTURE_TOOLBAR_SAFE_MARGIN = 8;
export const CAPTURE_TOOLBAR_GAP = 8;
export const CAPTURE_TOOLBAR_INSET = 8;
export type CaptureToolbarPlacement =
  "outside-bottom" | "outside-top" | "inside-bottom" | "viewport-clamped";
export type CapturePropertySide = "above" | "below";
export interface CaptureToolbarPosition {
  left: number;
  top: number;
  placement: CaptureToolbarPlacement;
}
export function clampPanelCoordinate(
  value: number,
  extent: number,
  viewportExtent: number,
): number {
  return Math.max(8, Math.min(value, viewportExtent - extent - 8));
}
export function resolveCaptureToolbarPosition(
  selection: Bounds,
  toolbar: Size,
  viewport: Size,
  reserved: Size = { width: 0, height: 0 },
  geometry: Bounds | null = null,
): CaptureToolbarPosition {
  const left = clampPanelCoordinate(
    selection.x + (selection.width - toolbar.width) / 2,
    toolbar.width,
    viewport.width,
  );
  const extra = reserved.height > 0 ? reserved.height + CAPTURE_TOOLBAR_GAP : 0;
  const preferredBelow = selection.y + selection.height + CAPTURE_TOOLBAR_GAP;
  const belowIntersectsStrip =
    geometry &&
    left < geometry.x + geometry.width &&
    left + toolbar.width > geometry.x &&
    preferredBelow < geometry.y + geometry.height &&
    preferredBelow + toolbar.height > geometry.y;
  const below = belowIntersectsStrip
    ? geometry.y + geometry.height + CAPTURE_TOOLBAR_GAP
    : preferredBelow;
  if (below + toolbar.height + extra <= viewport.height - 8) {
    return { left, top: below, placement: "outside-bottom" };
  }
  const preferredAbove = selection.y - toolbar.height - CAPTURE_TOOLBAR_GAP;
  const overlapsFixedStrip =
    geometry &&
    left < geometry.x + geometry.width &&
    left + toolbar.width > geometry.x &&
    preferredAbove < geometry.y + geometry.height &&
    preferredAbove + toolbar.height > geometry.y;
  const above = overlapsFixedStrip
    ? Math.min(
        preferredAbove,
        geometry.y - toolbar.height - CAPTURE_TOOLBAR_GAP,
      )
    : preferredAbove;
  if (above - extra >= 8) return { left, top: above, placement: "outside-top" };
  const inside =
    selection.y + selection.height - toolbar.height - CAPTURE_TOOLBAR_INSET;
  if (inside - extra >= Math.max(8, selection.y + CAPTURE_TOOLBAR_INSET)) {
    return { left, top: inside, placement: "inside-bottom" };
  }
  return {
    left,
    top: clampPanelCoordinate(inside, toolbar.height, viewport.height),
    placement: "viewport-clamped",
  };
}
export function capturePropertySide(
  position: CaptureToolbarPosition,
): CapturePropertySide {
  return position.placement === "outside-bottom" ? "below" : "above";
}
export function resolveCapturePropertyPosition(
  toolbar: Bounds,
  panel: Size,
  viewport: Size,
  side: CapturePropertySide,
  buttonCenter: number,
) {
  const left = clampPanelCoordinate(
    buttonCenter - 32,
    panel.width,
    viewport.width,
  );
  const available =
    side === "below"
      ? viewport.height - 8 - (toolbar.y + toolbar.height + 8)
      : toolbar.y - 16;
  // When even the toolbar and header cannot fit together, overlap is deterministic.
  const maxHeight = Math.min(viewport.height - 16, Math.max(40, available));
  const height = Math.min(panel.height, maxHeight);
  const top = clampPanelCoordinate(
    side === "below" ? toolbar.y + toolbar.height + 8 : toolbar.y - height - 8,
    height,
    viewport.height,
  );
  return {
    left,
    top,
    maxHeight,
    caretLeft: Math.max(10, Math.min(buttonCenter - left, panel.width - 10)),
  };
}
export function resolveAnnotationPanelAnchor(
  button: Bounds,
  panelWidth: number,
  stackWidth: number,
) {
  const center = button.x + button.width / 2;
  const left = Math.max(0, Math.min(button.x - 12, stackWidth - panelWidth));
  return {
    left,
    caretLeft: Math.max(10, Math.min(center - left, panelWidth - 10)),
    visible: center >= 0 && center <= stackWidth,
  };
}

export interface CaptureFloatingCoordinates {
  left: number;
  top: number;
}
export type CaptureToolbarDragState =
  | { mode: "automatic" }
  | ({
      mode: "manual";
      side: CapturePropertySide;
    } & CaptureFloatingCoordinates);

export function resolveCaptureToolbarDragBounds(
  toolbar: Size,
  reserved: Size,
  viewport: Size,
  side: CapturePropertySide,
): Bounds {
  const panelHeight = Math.min(
    reserved.height,
    Math.max(0, viewport.height - 16 - toolbar.height - 8),
  );
  const extra = panelHeight > 0 ? panelHeight + 8 : 0;
  return {
    x: 0,
    y: side === "above" ? -extra : 0,
    width: toolbar.width,
    height: toolbar.height + extra,
  };
}
export function clampCaptureToolbarDragPosition(
  position: CaptureFloatingCoordinates,
  group: Bounds,
  viewport: Size,
): CaptureFloatingCoordinates {
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(value, maximum));
  return {
    left: clamp(
      position.left,
      8 - group.x,
      viewport.width - 8 - group.x - group.width,
    ),
    top: clamp(
      position.top,
      8 - group.y,
      viewport.height - 8 - group.y - group.height,
    ),
  };
}
export function moveCaptureToolbarGroup(
  origin: CaptureFloatingCoordinates,
  start: { x: number; y: number },
  pointer: { x: number; y: number },
  group: Bounds,
  viewport: Size,
): CaptureFloatingCoordinates {
  return clampCaptureToolbarDragPosition(
    {
      left: origin.left + pointer.x - start.x,
      top: origin.top + pointer.y - start.y,
    },
    group,
    viewport,
  );
}
