import type {
  AnnotationObject,
  ArrowAnnotation,
  DrawingAnnotation,
  Point,
  TextAnnotation,
} from "./captureTypes";
import { normalizeAnnotation } from "./captureAnnotationProperties.js";
import type { SelectionResizeHandle, Size } from "./captureSelectionModel";
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type ObjectHandle = SelectionResizeHandle | "from" | "to";
export const TEXT_FONT_FAMILY = '"Avenir Next", "PingFang SC", sans-serif';
export const TEXT_LINE_HEIGHT = 1.35;
export function textFont(
  text: Pick<TextAnnotation, "fontSize" | "bold">,
): string {
  return `${text.bold ? "700" : "400"} ${text.fontSize}px ${TEXT_FONT_FAMILY}`;
}
let measurementCanvas: HTMLCanvasElement | null = null;
export function releaseTextMeasurement(): void {
  if (measurementCanvas) {
    measurementCanvas.width = 1;
    measurementCanvas.height = 1;
  }
  measurementCanvas = null;
}
export function textLayout(
  text: TextAnnotation,
  measurement?: Pick<CanvasRenderingContext2D, "measureText">,
) {
  let measure = measurement;
  if (!measure && typeof document !== "undefined") {
    if (!measurementCanvas) {
      measurementCanvas = document.createElement("canvas");
      measurementCanvas.width = 1;
      measurementCanvas.height = 1;
    }
    const ctx = measurementCanvas.getContext("2d");
    if (ctx && typeof ctx.measureText === "function") {
      ctx.font = textFont(text);
      measure = ctx;
    }
  }
  const lines = text.text.split(/\r?\n/);
  const lineHeight = text.fontSize * TEXT_LINE_HEIGHT;
  const widths = lines.map((line) =>
    measure
      ? measure.measureText(line).width
      : Math.round(
          [...line].reduce(
            (sum, char) => sum + (/[^\u0000-\u00ff]/.test(char) ? 1 : 0.56),
            0,
          ) *
            text.fontSize *
            (text.bold ? 1.08 : 1),
        ),
  );
  return {
    lines,
    lineHeight,
    bounds: {
      x: text.x,
      y: text.y - text.fontSize,
      width: Math.max(24, ...widths),
      height: lines.length * lineHeight,
    },
  };
}
function pointsBounds(points: Point[]): Bounds | null {
  if (points.length === 0) return null;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function arrowHeadPoints(
  from: Point,
  to: Point,
  strokeWidth: number,
): Point[] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x),
    length = Math.max(10, strokeWidth * 3.6);
  return [
    to,
    {
      x: to.x - length * Math.cos(angle - Math.PI / 7),
      y: to.y - length * Math.sin(angle - Math.PI / 7),
    },
    {
      x: to.x - length * Math.cos(angle + Math.PI / 7),
      y: to.y - length * Math.sin(angle + Math.PI / 7),
    },
  ];
}
export function annotationBounds(annotation: AnnotationObject): Bounds | null {
  switch (annotation.type) {
    case "arrow":
      return pointsBounds([annotation.from, annotation.to]);
    case "pen":
      return pointsBounds(annotation.points);
    case "text":
      return textLayout(annotation).bounds;
    default:
      return {
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
      };
  }
}
export function selectableBounds(annotation: AnnotationObject): Bounds | null {
  let bounds = annotationBounds(annotation);
  if (!bounds) return null;
  if (annotation.type === "arrow")
    bounds = pointsBounds([
      annotation.from,
      ...arrowHeadPoints(
        annotation.from,
        annotation.to,
        annotation.strokeWidth,
      ),
      ...(annotation.heads === "double"
        ? arrowHeadPoints(
            annotation.to,
            annotation.from,
            annotation.strokeWidth,
          )
        : []),
    ])!;
  const pad = "strokeWidth" in annotation ? annotation.strokeWidth / 2 : 0;
  return {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  };
}
export function hitTestAnnotation(
  annotations: AnnotationObject[],
  point: Point,
): AnnotationObject | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const bounds = selectableBounds(annotations[i]);
    if (
      bounds &&
      point.x >= bounds.x - 6 &&
      point.x <= bounds.x + bounds.width + 6 &&
      point.y >= bounds.y - 6 &&
      point.y <= bounds.y + bounds.height + 6
    )
      return annotations[i];
  }
  return null;
}
export function annotationHandles(
  annotation: DrawingAnnotation,
): { handle: ObjectHandle; point: Point }[] {
  if (annotation.type === "text") return [];
  if (annotation.type === "arrow")
    return [
      { handle: "from", point: annotation.from },
      { handle: "to", point: annotation.to },
    ];
  const b = annotationBounds(annotation);
  if (!b) return [];
  return [
    ["top-left", 0, 0],
    ["top", 0.5, 0],
    ["top-right", 1, 0],
    ["right", 1, 0.5],
    ["bottom-right", 1, 1],
    ["bottom", 0.5, 1],
    ["bottom-left", 0, 1],
    ["left", 0, 0.5],
  ].map(([handle, x, y]) => ({
    handle: handle as ObjectHandle,
    point: { x: b.x + Number(x) * b.width, y: b.y + Number(y) * b.height },
  }));
}
export function hitAnnotationHandle(
  annotation: DrawingAnnotation,
  point: Point,
  image: Size,
  viewport: Size,
): ObjectHandle | null {
  const scale = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  return (
    annotationHandles(annotation).find(
      (entry) =>
        Math.hypot(
          (entry.point.x - point.x) * scale,
          (entry.point.y - point.y) * scale,
        ) <= 8,
    )?.handle ?? null
  );
}
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));
export function moveAnnotation<T extends DrawingAnnotation>(
  annotation: T,
  delta: Point,
  image: Size,
): T {
  const b =
    annotation.type === "text"
      ? { x: annotation.x, y: annotation.y, width: 0, height: 0 }
      : annotationBounds(annotation);
  if (!b) return annotation;
  const dx = clamp(b.x + delta.x, 0, image.width - b.width) - b.x,
    dy = clamp(b.y + delta.y, 0, image.height - b.height) - b.y;
  if (annotation.type === "arrow")
    return {
      ...annotation,
      from: { x: annotation.from.x + dx, y: annotation.from.y + dy },
      to: { x: annotation.to.x + dx, y: annotation.to.y + dy },
    };
  if (annotation.type === "pen")
    return {
      ...annotation,
      points: annotation.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
}
export function moveArrowEndpoint(
  arrow: ArrowAnnotation,
  handle: "from" | "to",
  point: Point,
  image: Size,
): ArrowAnnotation {
  const next = {
    x: clamp(point.x, 0, image.width),
    y: clamp(point.y, 0, image.height),
  };
  const opposite = arrow[handle === "from" ? "to" : "from"];
  return Math.hypot(next.x - opposite.x, next.y - opposite.y) < 4
    ? arrow
    : { ...arrow, [handle]: next };
}
export function resizeAnnotation<T extends DrawingAnnotation>(
  annotation: T,
  handle: ObjectHandle,
  delta: Point,
  image: Size,
): T {
  if (annotation.type === "text" || annotation.type === "arrow")
    return annotation;
  const b = annotationBounds(annotation);
  if (!b) return annotation;
  let l = b.x,
    t = b.y,
    r = b.x + b.width,
    bt = b.y + b.height;
  if (handle.includes("left") || handle === "left")
    l = clamp(l + delta.x, 0, r - 4);
  if (handle.includes("right") || handle === "right")
    r = clamp(r + delta.x, l + 4, image.width);
  if (handle.includes("top") || handle === "top")
    t = clamp(t + delta.y, 0, bt - 4);
  if (handle.includes("bottom") || handle === "bottom")
    bt = clamp(bt + delta.y, t + 4, image.height);
  if (annotation.type === "pen") {
    const horizontal = handle.includes("left") || handle.includes("right");
    const vertical = handle.includes("top") || handle.includes("bottom");
    const axisX = horizontal ? clamp(b.x + delta.x, 0, image.width) - b.x : 0;
    const axisY = vertical ? clamp(b.y + delta.y, 0, image.height) - b.y : 0;
    return {
      ...annotation,
      points: annotation.points.map((p) => ({
        x: b.width === 0 ? p.x + axisX : l + ((p.x - b.x) * (r - l)) / b.width,
        y:
          b.height === 0
            ? p.y + axisY
            : t + ((p.y - b.y) * (bt - t)) / b.height,
      })),
    };
  }
  return normalizeAnnotation({
    ...annotation,
    x: l,
    y: t,
    width: r - l,
    height: bt - t,
  });
}

export function annotationBoundsToViewport(
  bounds: Bounds,
  image: Size,
  viewport: Size,
): Bounds {
  const scale = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  return {
    x: (viewport.width - image.width * scale) / 2 + bounds.x * scale,
    y: (viewport.height - image.height * scale) / 2 + bounds.y * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}
