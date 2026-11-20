import { outputRegion, paint, pickAnnotation, regionBetween, shift, type Annotation, type Point, type Scene, type Tool } from "./scene.js";

const MAX_HISTORY = 64;
const MAX_ANNOTATIONS = 100;
const MAX_PEN_POINTS = 900;

interface Drag {
  pointerId: number;
  from: Point;
  to: Point;
  tool: Tool;
  points: Point[];
  selected: number;
}

export class CaptureEditor {
  private image: HTMLImageElement | null = null;
  private snapshots: Scene[] = [{ crop: null, annotations: [] }];
  private cursor = 0;
  private dragging: Drag | null = null;
  private pinned = false;
  private frame = 0;
  private scratch = document.createElement("canvas");
  private scene: Scene = { crop: null, annotations: [] };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly controls: () => { tool: Tool; color: string; width: number; text: string },
    private readonly changed: () => void,
    signal: AbortSignal,
  ) {
    canvas.addEventListener("pointerdown", this.startDrag, { signal });
    canvas.addEventListener("pointermove", this.moveDrag, { signal });
    canvas.addEventListener("pointerup", event => this.finishDrag(event, true), { signal });
    for (const event of ["pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(event, event => this.finishDrag(event as PointerEvent, false), { signal });
    }
    signal.addEventListener("abort", () => this.clear(), { once: true });
  }

  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.cursor < this.snapshots.length - 1; }
  get crop() { return this.scene.crop; }

  load(image: HTMLImageElement) {
    this.clear();
    this.image = image;
    this.render();
  }

  clear() {
    if (this.image) this.image.removeAttribute("src");
    this.image = null;
    this.dragging = null;
    this.pinned = false;
    this.scene = { crop: null, annotations: [] };
    this.snapshots = [this.scene];
    this.cursor = 0;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas.width = this.canvas.height = 1;
    this.scratch.width = this.scratch.height = 1;
  }

  undo() { if (this.canUndo) this.navigate(this.cursor - 1); }
  redo() { if (this.canRedo) this.navigate(this.cursor + 1); }
  resetCrop() { if (this.scene.crop) this.commit({ ...this.scene, crop: null }); }

  setPinned(pinned: boolean) {
    this.pinned = pinned;
    this.render();
  }

  private navigate(cursor: number) {
    const scene = this.snapshots[cursor];
    if (!scene) return;
    this.cursor = cursor;
    this.scene = scene;
    this.dragging = null;
    this.render();
  }

  private commit(scene: Scene) {
    this.scene = scene;
    this.snapshots = [...this.snapshots.slice(0, this.cursor + 1), scene].slice(-MAX_HISTORY);
    this.cursor = this.snapshots.length - 1;
    this.render();
  }

  private pointer(event: PointerEvent, image: HTMLImageElement): Point {
    const rect = this.canvas.getBoundingClientRect();
    const width = image.naturalWidth, height = image.naturalHeight;
    return {
      x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / Math.max(1, rect.height))),
    };
  }

  private startDrag = (event: PointerEvent) => {
    const image = this.image;
    if (!image || event.button !== 0 || this.dragging || this.pinned) return;
    const { tool, color, width, text } = this.controls();
    const at = this.pointer(event, image);
    if (tool === "text") {
      if (text.trim()) this.append({ kind: "text", at, text: text.trim(), ink: { color, width } });
      return;
    }
    const selected = tool === "move"
      ? pickAnnotation(this.scene.annotations, at, 10 * image.naturalWidth / Math.max(1, this.canvas.clientWidth))
      : -1;
    this.dragging = { pointerId: event.pointerId, from: at, to: at, points: [at], tool, selected };
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private moveDrag = (event: PointerEvent) => {
    const { dragging, image } = this;
    if (!dragging || !image || event.pointerId !== dragging.pointerId) return;
    dragging.to = this.pointer(event, image);
    if (dragging.tool === "pen") {
      if (dragging.points.length === MAX_PEN_POINTS) dragging.points[MAX_PEN_POINTS - 1] = dragging.to;
      else dragging.points.push(dragging.to);
    }
    this.scheduleRender();
  };

  private finishDrag(event: PointerEvent, keep: boolean) {
    const drag = this.dragging;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (keep) this.moveDrag(event);
    this.dragging = null;
    const scene = keep && this.image ? this.previewScene(drag, true) : this.scene;
    if (scene !== this.scene) this.commit(scene);
    else this.render();
  }

  private append(annotation: Annotation) {
    if (this.scene.annotations.length >= MAX_ANNOTATIONS) return;
    this.commit({ ...this.scene, annotations: [...this.scene.annotations, annotation] });
  }

  private previewScene(drag: Drag, final: boolean): Scene {
    const region = regionBetween(drag.from, drag.to);
    const minimum = final ? 4 : 0.1;
    if (drag.tool === "crop") {
      if (region.width < minimum || region.height < minimum) return this.scene;
      return { ...this.scene, crop: region };
    }
    if (drag.tool === "move") {
      const shape = this.scene.annotations[drag.selected];
      if (!shape || Math.hypot(region.width, region.height) < minimum) return this.scene;
      const annotations = [...this.scene.annotations];
      annotations[drag.selected] = shift(shape, drag.to.x - drag.from.x, drag.to.y - drag.from.y);
      return { ...this.scene, annotations };
    }
    if (this.scene.annotations.length >= MAX_ANNOTATIONS) return this.scene;
    const { color, width } = this.controls();
    const ink = { color, width };
    let annotation: Annotation | null = null;
    switch (drag.tool) {
      case "arrow":
        if (Math.hypot(region.width, region.height) >= minimum) annotation = { kind: "arrow", from: drag.from, to: drag.to, ink };
        break;
      case "pen":
        if (drag.points.length > 1) annotation = { kind: "pen", points: drag.points, ink };
        break;
      case "rectangle":
      case "ellipse":
        if (region.width >= minimum && region.height >= minimum) annotation = { kind: drag.tool, region, ink };
        break;
      case "mosaic":
        if (region.width >= minimum && region.height >= minimum) annotation = { kind: "mosaic", region };
        break;
    }
    return annotation ? { ...this.scene, annotations: [...this.scene.annotations, annotation] } : this.scene;
  }

  private scheduleRender() {
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render() {
    const image = this.image;
    if (!image) return;
    const scene = this.dragging ? this.previewScene(this.dragging, false) : this.scene;
    const view = outputRegion(image, this.pinned ? scene.crop : null);
    paint(this.canvas, image, scene, view, Math.min(1, 1600 / view.width, 1200 / view.height), !this.pinned, this.scratch);
    this.changed();
  }

  async pngBytes() {
    const image = this.image;
    if (!image) throw new Error("Capture is no longer open");
    const output = document.createElement("canvas");
    try {
      paint(output, image, this.scene, outputRegion(image, this.scene.crop), 1, false, this.scratch);
      return await new Promise<Uint8Array>((resolve, reject) => {
        output.toBlob(blob => {
          if (blob) void blob.arrayBuffer().then(bytes => resolve(new Uint8Array(bytes)), reject);
          else reject(new Error("Capture PNG encoding failed"));
        }, "image/png");
      });
    } finally {
      output.width = output.height = 1;
    }
  }
}
