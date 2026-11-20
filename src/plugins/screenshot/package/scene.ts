export interface Point { x: number; y: number }
export interface Region extends Point { width: number; height: number }
export type Tool = "crop" | "move" | "rectangle" | "ellipse" | "arrow" | "pen" | "text" | "mosaic";
interface Ink { color: string; width: number }
export type Annotation =
  | { kind: "rectangle" | "ellipse"; region: Region; ink: Ink }
  | { kind: "arrow"; from: Point; to: Point; ink: Ink }
  | { kind: "pen"; points: Point[]; ink: Ink }
  | { kind: "text"; at: Point; text: string; ink: Ink }
  | { kind: "mosaic"; region: Region };
export interface Scene { crop: Region | null; annotations: Annotation[] }

export function regionBetween(a: Point, b: Point): Region {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function intersection(a: Region, b: Region): Region | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

export function outputRegion(image: HTMLImageElement, crop: Region | null): Region {
  const all = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  if (!crop) return all;
  const x = Math.floor(crop.x), y = Math.floor(crop.y);
  return intersection(all, {
    x, y, width: Math.ceil(crop.x + crop.width) - x, height: Math.ceil(crop.y + crop.height) - y,
  }) ?? all;
}

function inkPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

function mosaic(ctx: CanvasRenderingContext2D, rect: Region, view: Region, scale: number, scratch: HTMLCanvasElement) {
  const visible = intersection(rect, view);
  if (!visible) return;
  const { x, y, width, height } = visible;
  scratch.width = Math.max(1, Math.floor(width / 12));
  scratch.height = Math.max(1, Math.floor(height / 12));
  const sample = scratch.getContext("2d");
  if (!sample) return;
  sample.drawImage(ctx.canvas, (x - view.x) * scale, (y - view.y) * scale, width * scale, height * scale,
    0, 0, scratch.width, scratch.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, x, y, width, height);
  ctx.imageSmoothingEnabled = true;
}

function annotations(
  ctx: CanvasRenderingContext2D,
  shapes: Annotation[],
  view: Region,
  scale: number,
  scratch: HTMLCanvasElement,
) {
  for (const shape of shapes) {
    if (shape.kind === "mosaic") {
      mosaic(ctx, shape.region, view, scale, scratch);
      continue;
    }
    ctx.lineWidth = shape.ink.width;
    ctx.strokeStyle = ctx.fillStyle = shape.ink.color;
    ctx.lineCap = ctx.lineJoin = "round";
    switch (shape.kind) {
      case "rectangle":
        ctx.strokeRect(shape.region.x, shape.region.y, shape.region.width, shape.region.height);
        break;
      case "ellipse": {
        const { x, y, width, height } = shape.region;
        ctx.beginPath();
        ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      }
      case "arrow": {
        const { from, to } = shape;
        inkPath(ctx, [from, to]);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const size = Math.max(13, shape.ink.width * 3);
        const left = { x: to.x - size * Math.cos(angle - Math.PI / 6), y: to.y - size * Math.sin(angle - Math.PI / 6) };
        const right = { x: to.x - size * Math.cos(angle + Math.PI / 6), y: to.y - size * Math.sin(angle + Math.PI / 6) };
        inkPath(ctx, [left, to, right]);
        break;
      }
      case "pen":
        inkPath(ctx, shape.points);
        break;
      case "text":
        ctx.font = `600 ${Math.max(16, 5 * shape.ink.width)}px system-ui`;
        ctx.textBaseline = "top";
        ctx.fillText(shape.text, shape.at.x, shape.at.y);
        break;
    }
  }
}

export function paint(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  scene: Scene,
  view: Region,
  scale: number,
  showSelection: boolean,
  scratch: HTMLCanvasElement,
) {
  const width = Math.max(1, Math.round(view.width * scale)), height = Math.max(1, Math.round(view.height * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.resetTransform();
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
  ctx.drawImage(image, 0, 0);
  annotations(ctx, scene.annotations, view, scale, scratch);
  const crop = scene.crop;
  if (showSelection && crop) {
    const { x, y, width, height } = crop;
    ctx.fillStyle = "rgba(0, 0, 0, 0.44)";
    ctx.beginPath();
    ctx.rect(0, 0, image.naturalWidth, image.naturalHeight);
    ctx.rect(x, y, width, height);
    ctx.fill("evenodd");
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(x, y, width, height);
  }
  ctx.resetTransform();
}

function bounds(shape: Annotation): Region {
  if (shape.kind === "text") return {
    ...shape.at, width: Math.max(16, 5 * shape.ink.width) * shape.text.length,
    height: Math.max(16, 5 * shape.ink.width) * 1.4,
  };
  if (shape.kind === "arrow") return regionBetween(shape.from, shape.to);
  if (shape.kind === "pen") {
    const xs = shape.points.map(point => point.x), ys = shape.points.map(point => point.y);
    return regionBetween({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) });
  }
  return shape.region;
}

export function pickAnnotation(shapes: Annotation[], at: Point, pad: number): number {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (!shape) continue;
    const rect = bounds(shape);
    if (at.x >= rect.x - pad && at.x <= rect.x + rect.width + pad &&
        at.y >= rect.y - pad && at.y <= rect.y + rect.height + pad) return i;
  }
  return -1;
}

export function shift(shape: Annotation, dx: number, dy: number): Annotation {
  const offset = <T extends Point>(point: T): T => ({ ...point, x: point.x + dx, y: point.y + dy });
  switch (shape.kind) {
    case "text": return { ...shape, at: offset(shape.at) };
    case "arrow": return { ...shape, from: offset(shape.from), to: offset(shape.to) };
    case "pen": return { ...shape, points: shape.points.map(offset) };
    default: return { ...shape, region: offset(shape.region) };
  }
}
