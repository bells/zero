import type {
  AnnotationObject,
  ArrowAnnotation,
  DrawingAnnotation,
  Point,
  TextAnnotation,
} from "./captureTypes";
import {
  PROPERTY_RANGES,
  normalizeAnnotation,
} from "./captureAnnotationProperties.js";
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
export interface AnnotationHitContext {
  image: Size;
  viewport: Size;
  toleranceCssPx?: number;
}

function segmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}

function roundedRectDistance(point: Point, bounds: Bounds, radius = 0): number {
  const r = Math.max(0, Math.min(radius, bounds.width / 2, bounds.height / 2));
  const x =
    Math.abs(point.x - bounds.x - bounds.width / 2) - bounds.width / 2 + r;
  const y =
    Math.abs(point.y - bounds.y - bounds.height / 2) - bounds.height / 2 + r;
  return (
    Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - r
  );
}

function ellipseDistance(point: Point, bounds: Bounds): number {
  let a = Math.max(0.5, bounds.width / 2),
    b = Math.max(0.5, bounds.height / 2);
  let x = Math.abs(point.x - bounds.x - bounds.width / 2);
  let y = Math.abs(point.y - bounds.y - bounds.height / 2);
  if (a < b) {
    [a, b] = [b, a];
    [x, y] = [y, x];
  }
  const inside = (x / a) ** 2 + (y / b) ** 2 <= 1;
  let distance: number;
  if (a === b) distance = Math.abs(Math.hypot(x, y) - a);
  else if (y === 0) {
    const nearestX = Math.min(a, (a * a * x) / (a * a - b * b));
    const nearestY = b * Math.sqrt(Math.max(0, 1 - (nearestX / a) ** 2));
    distance = Math.hypot(nearestX - x, nearestY);
  } else {
    // Solve the closest-point multiplier, including interior points of thin ellipses.
    let low = -b * b,
      high = Math.hypot(a * x, b * y);
    for (let i = 0; i < 56; i++) {
      const t = (low + high) / 2;
      if (((a * x) / (t + a * a)) ** 2 + ((b * y) / (t + b * b)) ** 2 > 1)
        low = t;
      else high = t;
    }
    const t = (low + high) / 2;
    distance = Math.hypot(
      (a * a * x) / (t + a * a) - x,
      (b * b * y) / (t + b * b) - y,
    );
  }
  return inside ? -distance : distance;
}

function hitsArrowHead(
  point: Point,
  points: Point[],
  tolerance: number,
): boolean {
  const [a, b, c] = points;
  const cross = (p: Point, q: Point) =>
    (q.x - p.x) * (point.y - p.y) - (q.y - p.y) * (point.x - p.x);
  const signs = [cross(a, b), cross(b, c), cross(c, a)];
  return (
    signs.every((s) => s >= 0) ||
    signs.every((s) => s <= 0) ||
    Math.min(
      segmentDistance(point, a, b),
      segmentDistance(point, b, c),
      segmentDistance(point, c, a),
    ) <= tolerance
  );
}

export function hitTestAnnotation(
  annotations: readonly AnnotationObject[],
  point: Point,
  context: AnnotationHitContext,
): DrawingAnnotation | null {
  const scale = Math.min(
    context.viewport.width / context.image.width,
    context.viewport.height / context.image.height,
  );
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const tolerance = Math.max(0, context.toleranceCssPx ?? 6) / scale;
  for (let i = annotations.length - 1; i >= 0; i--) {
    const annotation = annotations[i];
    if (annotation.type === "pin") continue;
    const bounds = selectableBounds(annotation);
    if (
      !bounds ||
      point.x < bounds.x - tolerance ||
      point.x > bounds.x + bounds.width + tolerance ||
      point.y < bounds.y - tolerance ||
      point.y > bounds.y + bounds.height + tolerance
    )
      continue;
    const strokeTolerance =
      tolerance +
      ("strokeWidth" in annotation ? annotation.strokeWidth / 2 : 0);
    let hit = false;
    switch (annotation.type) {
      case "rectangle": {
        const d = roundedRectDistance(
          point,
          annotation,
          annotation.cornerRadius,
        );
        hit =
          annotation.fillMode === "solid"
            ? d <= tolerance
            : Math.abs(d) <= strokeTolerance;
        break;
      }
      case "ellipse": {
        const d = ellipseDistance(point, annotation);
        hit =
          annotation.fillMode === "solid"
            ? d <= tolerance
            : Math.abs(d) <= strokeTolerance;
        break;
      }
      case "arrow":
        hit =
          segmentDistance(point, annotation.from, annotation.to) <=
            strokeTolerance ||
          hitsArrowHead(
            point,
            arrowHeadPoints(
              annotation.from,
              annotation.to,
              annotation.strokeWidth,
            ),
            tolerance,
          ) ||
          (annotation.heads === "double" &&
            hitsArrowHead(
              point,
              arrowHeadPoints(
                annotation.to,
                annotation.from,
                annotation.strokeWidth,
              ),
              tolerance,
            ));
        break;
      case "pen":
        hit = annotation.points.some(
          (p, index) =>
            segmentDistance(
              point,
              p,
              annotation.points[Math.max(0, index - 1)],
            ) <= strokeTolerance,
        );
        break;
      case "text":
      case "mosaic":
        hit = roundedRectDistance(point, bounds) <= tolerance;
        break;
    }
    if (hit) return annotation;
  }
  return null;
}
export function annotationHandles(
  annotation: DrawingAnnotation,
): { handle: ObjectHandle; point: Point }[] {
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
  ]
    .filter(
      ([handle]) => annotation.type !== "text" || String(handle).includes("-"),
    )
    .map(([handle, x, y]) => ({
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
export interface AnnotationResizeOptions {
  preserveAspectRatio: boolean;
}

function resizeAnchor(
  bounds: Bounds,
  handle: ObjectHandle,
): { anchor: Point; vector: Point } {
  const horizontal = handle.includes("left")
    ? -1
    : handle.includes("right")
      ? 1
      : 0;
  const vertical = handle.includes("top")
    ? -1
    : handle.includes("bottom")
      ? 1
      : 0;
  return {
    anchor: {
      x: bounds.x + (bounds.width * (1 - horizontal)) / 2,
      y: bounds.y + (bounds.height * (1 - vertical)) / 2,
    },
    vector: { x: horizontal * bounds.width, y: vertical * bounds.height },
  };
}

function resizeFactor(vector: Point, delta: Point): number {
  const lengthSquared = vector.x ** 2 + vector.y ** 2;
  return lengthSquared === 0
    ? 1
    : 1 + (vector.x * delta.x + vector.y * delta.y) / lengthSquared;
}

function proportionalBounds(
  bounds: Bounds,
  handle: ObjectHandle,
  delta: Point,
  image: Size,
): Bounds {
  const { anchor, vector } = resizeAnchor(bounds, handle);
  let maximum = Infinity;
  for (const [offset, space] of [
    [bounds.x - anchor.x, anchor.x],
    [anchor.x - bounds.x - bounds.width, image.width - anchor.x],
    [bounds.y - anchor.y, anchor.y],
    [anchor.y - bounds.y - bounds.height, image.height - anchor.y],
  ])
    if (offset < 0) maximum = Math.min(maximum, space / -offset);
  const minimum = Math.min(
    1,
    Math.max(
      bounds.width > 0 ? 4 / bounds.width : 0,
      bounds.height > 0 ? 4 / bounds.height : 0,
    ),
  );
  const factor = clamp(resizeFactor(vector, delta), minimum, maximum);
  return {
    x: anchor.x + (bounds.x - anchor.x) * factor,
    y: anchor.y + (bounds.y - anchor.y) * factor,
    width: bounds.width * factor,
    height: bounds.height * factor,
  };
}

function resizeText(
  annotation: TextAnnotation,
  handle: ObjectHandle,
  delta: Point,
  image: Size,
): TextAnnotation {
  if (!handle.includes("-")) return annotation;
  const before = textLayout(annotation).bounds;
  const { anchor, vector } = resizeAnchor(before, handle);
  const [minimum, maximum] = PROPERTY_RANGES.fontSize;
  const requested = Math.round(
    clamp(annotation.fontSize * resizeFactor(vector, delta), minimum, maximum),
  );
  const direction = Math.sign(requested - annotation.fontSize);
  if (!direction) return annotation;
  let result = annotation;
  // Integer font sizes have measured, non-linear widths. Bound the search to the existing 12–96 range.
  for (
    let size = annotation.fontSize + direction;
    direction > 0 ? size <= requested : size >= requested;
    size += direction
  ) {
    const layout = textLayout({ ...annotation, fontSize: size }).bounds;
    const x = anchor.x - (handle.includes("left") ? layout.width : 0);
    const top = anchor.y - (handle.includes("top") ? layout.height : 0);
    const y = top + size;
    if (x < 0 || x > image.width || y < 0 || y > image.height) break;
    result = { ...annotation, x, y, fontSize: size };
  }
  return result;
}

export function resizeAnnotation<T extends DrawingAnnotation>(
  annotation: T,
  handle: ObjectHandle,
  delta: Point,
  image: Size,
  options?: AnnotationResizeOptions,
): T {
  if (annotation.type === "arrow") return annotation;
  if (annotation.type === "text")
    return resizeText(annotation, handle, delta, image) as T;
  const b = annotationBounds(annotation);
  if (!b) return annotation;
  if (annotation.type === "pen" || options?.preserveAspectRatio) {
    const next = proportionalBounds(b, handle, delta, image);
    if (annotation.type === "pen")
      return {
        ...annotation,
        points: annotation.points.map((p) => ({
          x:
            b.width === 0 ? p.x : next.x + ((p.x - b.x) * next.width) / b.width,
          y:
            b.height === 0
              ? p.y
              : next.y + ((p.y - b.y) * next.height) / b.height,
        })),
      };
    return normalizeAnnotation({ ...annotation, ...next });
  }
  let l = b.x,
    t = b.y,
    r = b.x + b.width,
    bottom = b.y + b.height;
  if (handle.includes("left")) l = clamp(l + delta.x, 0, r - 4);
  if (handle.includes("right")) r = clamp(r + delta.x, l + 4, image.width);
  if (handle.includes("top")) t = clamp(t + delta.y, 0, bottom - 4);
  if (handle.includes("bottom"))
    bottom = clamp(bottom + delta.y, t + 4, image.height);
  return normalizeAnnotation({
    ...annotation,
    x: l,
    y: t,
    width: r - l,
    height: bottom - t,
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
