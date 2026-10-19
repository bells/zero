import type {
  AnnotationObject,
  DrawingAnnotation,
  Point,
} from "./captureTypes";
import { normalizeAnnotation } from "./captureAnnotationProperties.js";
import {
  annotationBounds,
  selectableBounds,
  arrowHeadPoints,
  textFont,
  textLayout,
} from "./captureAnnotationGeometry.js";
export {
  annotationBounds,
  hitTestAnnotation,
} from "./captureAnnotationGeometry.js";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function distance(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalizeRect(from: Point, to: Point): Bounds {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  return { x, y, width, height };
}

export function isAnnotationLargeEnough(
  annotation: AnnotationObject,
  minimumSize = 4,
): boolean {
  if (annotation.type === "arrow") {
    return distance(annotation.from, annotation.to) >= minimumSize;
  }

  if (annotation.type === "pen") {
    return annotation.points.length >= 2;
  }

  if (annotation.type === "text") {
    return annotation.text.trim().length > 0;
  }

  const bounds = annotationBounds(annotation);
  if (!bounds) {
    return false;
  }

  return bounds.width >= minimumSize && bounds.height >= minimumSize;
}

export function clampBounds(
  bounds: Bounds,
  maxWidth: number,
  maxHeight: number,
): Bounds | null {
  const x = Math.max(0, Math.min(bounds.x, maxWidth));
  const y = Math.max(0, Math.min(bounds.y, maxHeight));
  const right = Math.max(0, Math.min(bounds.x + bounds.width, maxWidth));
  const bottom = Math.max(0, Math.min(bounds.y + bounds.height, maxHeight));
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

// One local backing store per render owner; export owners dispose it in finally.
export class AnnotationRenderResources {
  private canvas: HTMLCanvasElement | null = null;
  acquire(
    width: number,
    height: number,
  ): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
    this.canvas ??= document.createElement("canvas");
    const w = Math.max(1, Math.ceil(width)),
      h = Math.max(1, Math.ceil(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("annotation-render-failed");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    return { canvas: this.canvas, context };
  }
  release(): void {
    if (this.canvas) {
      this.canvas.width = 1;
      this.canvas.height = 1;
    }
    this.canvas = null;
  }
}

function drawOpaque(
  ctx: CanvasRenderingContext2D,
  annotation: DrawingAnnotation,
): void {
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (annotation.type === "mosaic") return;
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = annotation.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    switch (annotation.type) {
      case "rectangle":
        ctx.beginPath();
        ctx.roundRect(
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
          annotation.cornerRadius,
        );
        if (annotation.fillMode === "solid") ctx.fill();
        else ctx.stroke();
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(
          annotation.x + annotation.width / 2,
          annotation.y + annotation.height / 2,
          Math.max(0.5, annotation.width / 2),
          Math.max(0.5, annotation.height / 2),
          0,
          0,
          Math.PI * 2,
        );
        if (annotation.fillMode === "solid") ctx.fill();
        else ctx.stroke();
        break;
      case "arrow": {
        if (
          Math.hypot(
            annotation.to.x - annotation.from.x,
            annotation.to.y - annotation.from.y,
          ) < 2
        )
          break;
        ctx.beginPath();
        ctx.moveTo(annotation.from.x, annotation.from.y);
        ctx.lineTo(annotation.to.x, annotation.to.y);
        ctx.stroke();
        const heads = [
          arrowHeadPoints(
            annotation.from,
            annotation.to,
            annotation.strokeWidth,
          ),
        ];
        if (annotation.heads === "double")
          heads.push(
            arrowHeadPoints(
              annotation.to,
              annotation.from,
              annotation.strokeWidth,
            ),
          );
        for (const head of heads) {
          ctx.beginPath();
          ctx.moveTo(head[0].x, head[0].y);
          ctx.lineTo(head[1].x, head[1].y);
          ctx.lineTo(head[2].x, head[2].y);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case "pen":
        if (annotation.points.length === 0) break;
        ctx.beginPath();
        ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
        for (let i = 1; i < annotation.points.length; i++)
          ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
        ctx.stroke();
        break;
      case "text": {
        ctx.font = textFont(annotation);
        ctx.textBaseline = "alphabetic";
        const layout = textLayout(annotation, ctx);
        layout.lines.forEach((line, index) =>
          ctx.fillText(
            line,
            annotation.x,
            annotation.y + index * layout.lineHeight,
          ),
        );
        break;
      }
    }
  } finally {
    ctx.restore();
  }
}
function drawMosaic(
  ctx: CanvasRenderingContext2D,
  annotation: Extract<DrawingAnnotation, { type: "mosaic" }>,
  resources: AnnotationRenderResources,
): void {
  const bounds = clampBounds(
    {
      x: Math.floor(annotation.x),
      y: Math.floor(annotation.y),
      width:
        Math.ceil(annotation.x + annotation.width) - Math.floor(annotation.x),
      height:
        Math.ceil(annotation.y + annotation.height) - Math.floor(annotation.y),
    },
    ctx.canvas.width,
    ctx.canvas.height,
  );
  if (!bounds) return;
  const w = Math.max(1, Math.floor(bounds.width / annotation.pixelSize)),
    h = Math.max(1, Math.floor(bounds.height / annotation.pixelSize));
  const layer = resources.acquire(w, h);
  layer.context.imageSmoothingEnabled = false;
  layer.context.drawImage(
    ctx.canvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    w,
    h,
  );
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.clip();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(
      layer.canvas,
      0,
      0,
      w,
      h,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    );
  } finally {
    ctx.restore();
  }
}
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: AnnotationObject[],
  owner?: AnnotationRenderResources,
): void {
  const resources = owner ?? new AnnotationRenderResources();
  try {
    for (const raw of annotations) {
      if (raw.type === "pin") continue;
      const annotation = normalizeAnnotation(raw);
      if (annotation.type === "mosaic") {
        drawMosaic(ctx, annotation, resources);
        continue;
      }
      if (annotation.opacity === 1) {
        drawOpaque(ctx, annotation);
        continue;
      }
      const b = selectableBounds(annotation);
      if (!b) continue;
      // Pixel-aligned padding preserves antialiasing at thick strokes and glyph edges.
      const left = Math.floor(b.x) - 2,
        top = Math.floor(b.y) - 2;
      const bounds = clampBounds(
        {
          x: left,
          y: top,
          width: Math.ceil(b.x + b.width) + 2 - left,
          height: Math.ceil(b.y + b.height) + 2 - top,
        },
        ctx.canvas.width,
        ctx.canvas.height,
      );
      if (!bounds) continue;
      const layer = resources.acquire(bounds.width, bounds.height);
      layer.context.save();
      try {
        layer.context.translate(-bounds.x, -bounds.y);
        drawOpaque(layer.context, annotation);
      } finally {
        layer.context.restore();
      }
      ctx.save();
      try {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = annotation.opacity;
        ctx.drawImage(layer.canvas, bounds.x, bounds.y);
      } finally {
        ctx.restore();
      }
    }
  } finally {
    if (!owner) resources.release();
  }
}
