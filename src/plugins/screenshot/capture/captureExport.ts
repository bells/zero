import type { Bounds } from "./captureCanvas";
import { clampBounds, drawAnnotations } from "./captureCanvas";
import type { AnnotationObject } from "./captureTypes";

export async function loadImageFromBase64(imageBase64: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  await image.decode();
  return image;
}

export function createSizedCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
}

export function renderFinalCanvas(
  baseImage: CanvasImageSource,
  width: number,
  height: number,
  annotations: AnnotationObject[],
): HTMLCanvasElement {
  const canvas = createSizedCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is unavailable");
  }

  ctx.drawImage(baseImage, 0, 0, width, height);
  drawAnnotations(ctx, annotations.filter((annotation) => annotation.type !== "pin"));
  return canvas;
}

export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function cropCanvasToPngDataUrl(source: HTMLCanvasElement, bounds: Bounds): string | null {
  const safeBounds = clampBounds(bounds, source.width, source.height);
  if (!safeBounds) {
    return null;
  }

  const target = createSizedCanvas(safeBounds.width, safeBounds.height);
  const ctx = target.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is unavailable");
  }

  ctx.drawImage(
    source,
    safeBounds.x,
    safeBounds.y,
    safeBounds.width,
    safeBounds.height,
    0,
    0,
    safeBounds.width,
    safeBounds.height,
  );
  return canvasToPngDataUrl(target);
}
