# ZTool Screenshot Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the macOS screenshot editor MVP with rectangle, arrow, pen, text, mosaic, pin, copy, save, cancel, undo, redo, and delete, while keeping Windows on the system screenshot launcher path.

**Architecture:** Continue from the existing Rust session skeleton and frontend capture helper files. Route Tauri windows by label so the main shell, capture editor, and pin windows render separate React views. Keep drawing and export logic in focused capture helper modules, with React components owning only UI state and pointer interactions.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript, Vite, HTML Canvas, Node test runner.

---

## File Structure

- Modify: `src/main.tsx` to render the root app with window-label-based view selection.
- Modify: `src/App.tsx` to export the main tray shell as `MainApp`.
- Create: `src/plugins/screenshot/capture/CaptureApp.tsx` for the full-screen capture editor.
- Create: `src/plugins/screenshot/capture/PinApp.tsx` for pinned image windows.
- Create: `src/plugins/screenshot/capture/captureExport.ts` for offscreen rendering, PNG export, and crop export.
- Modify: `src/plugins/screenshot/capture/captureCanvas.ts` to expose hit testing and drawing options.
- Modify: `src/plugins/screenshot/capture/captureSerialize.ts` to emit snake_case command input fields.
- Modify: `src/plugins/screenshot/capture/captureTypes.ts` to add editor state types and defaults as needed.
- Modify: `src/App.css` to add capture editor and pin window styles.
- Modify: `src-tauri/src/services/screenshot.rs` to restore the main window on capture failures, support unique pin labels, and add session-store unit coverage.
- Test: `tests/captureReducer.test.mjs`.
- Test: `tests/captureHotkeys.test.mjs`.
- Test: `tests/captureSerialize.test.mjs`.
- Test: `tests/captureCanvas.test.mjs`.

## Task 1: Frontend Capture Helper Tests

**Files:**
- Create: `tests/captureReducer.test.mjs`
- Create: `tests/captureHotkeys.test.mjs`
- Create: `tests/captureSerialize.test.mjs`
- Create: `tests/captureCanvas.test.mjs`

- [ ] **Step 1: Add failing reducer tests**

Create `tests/captureReducer.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  captureReducer,
  initialHistoryState,
} from "/private/tmp/ztool-capture-test/captureReducer.js";

const rect = {
  id: "rect-1",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 120,
  height: 80,
  color: "#55f280",
  strokeWidth: 4,
};

test("adds, selects, deletes, undoes, and redoes annotations", () => {
  const added = captureReducer(initialHistoryState, { type: "add", annotation: rect });
  assert.equal(added.annotations.length, 1);
  assert.equal(added.selectedId, "rect-1");

  const removed = captureReducer(added, { type: "removeSelected" });
  assert.deepEqual(removed.annotations, []);
  assert.equal(removed.selectedId, null);

  const undone = captureReducer(removed, { type: "undo" });
  assert.deepEqual(undone.annotations, [rect]);

  const redone = captureReducer(undone, { type: "redo" });
  assert.deepEqual(redone.annotations, []);
});

test("clear records undo history only when annotations exist", () => {
  const emptyCleared = captureReducer(initialHistoryState, { type: "clear" });
  assert.equal(emptyCleared.undoStack.length, 0);

  const added = captureReducer(initialHistoryState, { type: "add", annotation: rect });
  const cleared = captureReducer(added, { type: "clear" });
  assert.deepEqual(cleared.annotations, []);
  assert.equal(cleared.undoStack.length, 2);
});
```

- [ ] **Step 2: Add failing hotkey tests**

Create `tests/captureHotkeys.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { resolveCaptureHotkey } from "/private/tmp/ztool-capture-test/captureHotkeys.js";

test("maps capture editor keyboard shortcuts", () => {
  assert.equal(resolveCaptureHotkey({ key: "Escape" }), "cancel");
  assert.equal(resolveCaptureHotkey({ key: "Delete" }), "removeSelected");
  assert.equal(resolveCaptureHotkey({ key: "Backspace" }), "removeSelected");
  assert.equal(resolveCaptureHotkey({ key: "z", metaKey: true }), "undo");
  assert.equal(resolveCaptureHotkey({ key: "z", ctrlKey: true }), "undo");
  assert.equal(resolveCaptureHotkey({ key: "z", metaKey: true, shiftKey: true }), "redo");
  assert.equal(resolveCaptureHotkey({ key: "y", ctrlKey: true }), "redo");
  assert.equal(resolveCaptureHotkey({ key: "a" }), null);
});
```

- [ ] **Step 3: Add failing serialization tests for snake_case command payloads**

Create `tests/captureSerialize.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommitScreenshotPayload,
  buildPinScreenshotPayload,
} from "/private/tmp/ztool-capture-test/captureSerialize.js";

test("builds commit payload using Rust command field names", () => {
  assert.deepEqual(
    buildCommitScreenshotPayload({
      sessionId: "session-1",
      action: "save",
      pngBase64: "data:image/png;base64,abc",
      savePath: "/tmp/capture.png",
    }),
    {
      input: {
        session_id: "session-1",
        action: "save",
        png_base64: "data:image/png;base64,abc",
        save_path: "/tmp/capture.png",
      },
    },
  );
});

test("builds pin payload using Rust command field names", () => {
  assert.deepEqual(buildPinScreenshotPayload("session-1", "png-data"), {
    input: {
      session_id: "session-1",
      png_base64: "png-data",
    },
  });
});
```

- [ ] **Step 4: Add failing geometry tests**

Create `tests/captureCanvas.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  annotationBounds,
  clampBounds,
  hitTestAnnotation,
  normalizeRect,
} from "/private/tmp/ztool-capture-test/captureCanvas.js";

test("normalizes and clamps rectangles", () => {
  assert.deepEqual(normalizeRect({ x: 80, y: 70 }, { x: 10, y: 15 }), {
    x: 10,
    y: 15,
    width: 70,
    height: 55,
  });
  assert.deepEqual(clampBounds({ x: -5, y: 10, width: 30, height: 20 }, 100, 100), {
    x: 0,
    y: 10,
    width: 25,
    height: 20,
  });
  assert.equal(clampBounds({ x: 110, y: 10, width: 20, height: 20 }, 100, 100), null);
});

test("computes text bounds and hit tests annotations from topmost to bottom", () => {
  const annotations = [
    {
      id: "rect-1",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      color: "#55f280",
      strokeWidth: 4,
    },
    {
      id: "text-1",
      type: "text",
      x: 20,
      y: 35,
      text: "Hello",
      fontSize: 20,
      color: "#55f280",
      strokeWidth: 2,
    },
  ];

  assert.deepEqual(annotationBounds(annotations[1]), {
    x: 20,
    y: 15,
    width: 56,
    height: 27,
  });
  assert.equal(hitTestAnnotation(annotations, { x: 22, y: 20 })?.id, "text-1");
  assert.equal(hitTestAnnotation(annotations, { x: 90, y: 90 })?.id, "rect-1");
  assert.equal(hitTestAnnotation(annotations, { x: 200, y: 200 }), null);
});
```

- [ ] **Step 5: Run tests to verify RED**

Run:

```bash
pnpm exec tsc src/plugins/screenshot/capture/captureReducer.ts src/plugins/screenshot/capture/captureHotkeys.ts src/plugins/screenshot/capture/captureSerialize.ts src/plugins/screenshot/capture/captureCanvas.ts --module ES2020 --moduleResolution bundler --target ES2022 --outDir /private/tmp/ztool-capture-test --noEmit false --skipLibCheck
node --test tests/captureReducer.test.mjs tests/captureHotkeys.test.mjs tests/captureSerialize.test.mjs tests/captureCanvas.test.mjs
```

Expected: at least serialization tests fail because the current helper emits `sessionId`, `pngBase64`, and `savePath`; geometry tests fail until `hitTestAnnotation` exists.

## Task 2: Make Capture Helpers Pass

**Files:**
- Modify: `src/plugins/screenshot/capture/captureCanvas.ts`
- Modify: `src/plugins/screenshot/capture/captureSerialize.ts`

- [ ] **Step 1: Add hit testing to canvas helpers**

Add this export to `src/plugins/screenshot/capture/captureCanvas.ts` after `clampBounds`:

```ts
export function hitTestAnnotation(
  annotations: AnnotationObject[],
  point: Point,
): AnnotationObject | null {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const bounds = annotationBounds(annotations[index]);
    if (!bounds) {
      continue;
    }

    const padding = Math.max(6, annotations[index].strokeWidth);
    const insideX = point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding;
    const insideY = point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;
    if (insideX && insideY) {
      return annotations[index];
    }
  }

  return null;
}
```

- [ ] **Step 2: Emit snake_case command payloads**

Replace `buildCommitScreenshotPayload` and `buildPinScreenshotPayload` return types and bodies in `src/plugins/screenshot/capture/captureSerialize.ts` with:

```ts
export function buildCommitScreenshotPayload(input: CommitScreenshotPayload): {
  input: {
    session_id: string;
    action: "copy" | "save";
    png_base64: string;
    save_path?: string;
  };
} {
  return {
    input: {
      session_id: input.sessionId,
      action: input.action,
      png_base64: input.pngBase64,
      ...(input.savePath ? { save_path: input.savePath } : {}),
    },
  };
}

export function buildPinScreenshotPayload(sessionId: string, pngBase64: string): {
  input: {
    session_id: string;
    png_base64: string;
  };
} {
  return {
    input: {
      session_id: sessionId,
      png_base64: pngBase64,
    },
  };
}
```

- [ ] **Step 3: Run tests to verify GREEN**

Run:

```bash
pnpm exec tsc src/plugins/screenshot/capture/captureReducer.ts src/plugins/screenshot/capture/captureHotkeys.ts src/plugins/screenshot/capture/captureSerialize.ts src/plugins/screenshot/capture/captureCanvas.ts --module ES2020 --moduleResolution bundler --target ES2022 --outDir /private/tmp/ztool-capture-test --noEmit false --skipLibCheck
node --test tests/captureReducer.test.mjs tests/captureHotkeys.test.mjs tests/captureSerialize.test.mjs tests/captureCanvas.test.mjs
```

Expected: all four Node tests pass.

## Task 3: Add Export Rendering Helper

**Files:**
- Create: `src/plugins/screenshot/capture/captureExport.ts`
- Test: add cases to `tests/captureCanvas.test.mjs` only if pure geometry helpers are extracted during implementation.

- [ ] **Step 1: Create export helper**

Create `src/plugins/screenshot/capture/captureExport.ts`:

```ts
import type { AnnotationObject } from "./captureTypes";
import type { Bounds } from "./captureCanvas";
import { clampBounds, drawAnnotations } from "./captureCanvas";

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
```

- [ ] **Step 2: Run TypeScript build for the new helper**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: TypeScript reports no errors.

## Task 4: Route Main, Capture, and Pin Windows

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Create: `src/plugins/screenshot/capture/CaptureApp.tsx`
- Create: `src/plugins/screenshot/capture/PinApp.tsx`

- [ ] **Step 1: Export the current app shell as `MainApp`**

In `src/App.tsx`, rename the component declaration and export:

```tsx
export function MainApp() {
  // keep the existing component body unchanged
}

export default MainApp;
```

- [ ] **Step 2: Add temporary capture and pin components**

Create `src/plugins/screenshot/capture/CaptureApp.tsx`:

```tsx
export function CaptureApp() {
  return <main className="capture-shell">Loading capture...</main>;
}
```

Create `src/plugins/screenshot/capture/PinApp.tsx`:

```tsx
export function PinApp() {
  return <main className="pin-shell">Loading pinned image...</main>;
}
```

- [ ] **Step 3: Route by Tauri window label**

Replace `src/main.tsx` with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import { MainApp } from "./App";
import { CaptureApp } from "./plugins/screenshot/capture/CaptureApp";
import { PinApp } from "./plugins/screenshot/capture/PinApp";

function RootApp() {
  const label = getCurrentWindow().label;

  if (label === "capture") {
    return <CaptureApp />;
  }

  if (label.startsWith("pin")) {
    return <PinApp />;
  }

  return <MainApp />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: frontend build succeeds.

## Task 5: Implement Pin Window View

**Files:**
- Modify: `src/plugins/screenshot/capture/PinApp.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Implement pin payload loading and close**

Replace `src/plugins/screenshot/capture/PinApp.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface PinPayload {
  image_base64: string;
}

function toImageSrc(imageBase64: string): string {
  return imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;
}

export function PinApp() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<PinPayload>("init_pin_window")
      .then((payload) => setImageSrc(toImageSrc(payload.image_base64)))
      .catch((err) => setError(String(err)));
  }, []);

  const close = () => {
    getCurrentWindow().close().catch(() => undefined);
  };

  return (
    <main className="pin-shell">
      <header className="pin-titlebar" data-tauri-drag-region>
        <span data-tauri-drag-region>Pin</span>
        <button type="button" className="pin-close" onClick={close} aria-label="Close pinned image">
          x
        </button>
      </header>
      {error ? <p className="pin-error">{error}</p> : null}
      {imageSrc ? <img className="pin-image" src={imageSrc} alt="Pinned screenshot" draggable={false} /> : null}
    </main>
  );
}
```

- [ ] **Step 2: Add pin styles**

Append to `src/App.css`:

```css
.pin-shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #111418;
  color: #f5f7f0;
}

.pin-titlebar {
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: rgba(17, 20, 24, 0.92);
  user-select: none;
}

.pin-titlebar span {
  font-size: 11px;
  font-weight: 800;
}

.pin-close {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  color: #f5f7f0;
  font-size: 12px;
  line-height: 1;
}

.pin-image {
  max-width: none;
  max-height: none;
  image-rendering: auto;
  user-select: none;
}

.pin-error {
  margin: 12px;
  color: #ffb3b3;
  font-size: 12px;
}
```

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: frontend build succeeds.

## Task 6: Implement Capture Editor MVP

**Files:**
- Modify: `src/plugins/screenshot/capture/CaptureApp.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Define the capture editor component shape**

Replace the temporary `CaptureApp` with a real component organized into these local helper functions inside `src/plugins/screenshot/capture/CaptureApp.tsx`:

```tsx
type DraftAnnotation = AnnotationObject | null;

interface TextDraft {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  value: string;
}

const tools: Array<{ tool: CaptureTool; label: string }> = [
  { tool: "select", label: "Select" },
  { tool: "rectangle", label: "Rect" },
  { tool: "arrow", label: "Arrow" },
  { tool: "pen", label: "Pen" },
  { tool: "text", label: "Text" },
  { tool: "mosaic", label: "Mosaic" },
  { tool: "pin", label: "Pin" },
];

function toImageSrc(imageBase64: string): string {
  return imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;
}
```

- [ ] **Step 2: Implement session loading and canvas sizing**

Inside `CaptureApp`, add these states and effects:

```tsx
const [session, setSession] = useState<CaptureSession | null>(null);
const [imageSrc, setImageSrc] = useState<string | null>(null);
const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
const [tool, setTool] = useState<CaptureTool>("rectangle");
const [history, dispatch] = useReducer(captureReducer, initialHistoryState);
const [draft, setDraft] = useState<DraftAnnotation>(null);
const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
const [error, setError] = useState<string | null>(null);
const [isCommitting, setIsCommitting] = useState(false);
const dragStartRef = useRef<Point | null>(null);
const imageRef = useRef<HTMLImageElement | null>(null);
const overlayRef = useRef<HTMLCanvasElement | null>(null);
```

Load the session with:

```tsx
useEffect(() => {
  invoke<CaptureSession>("init_screenshot_session", {})
    .then(async (payload) => {
      const src = toImageSrc(payload.image_base64);
      setSession(payload);
      setImageSrc(src);
      setBaseImage(await loadImageFromBase64(src));
    })
    .catch((err) => setError(String(err)));
}, []);
```

Add `syncOverlaySize` that sets `overlay.width = session.width` and `overlay.height = session.height`, then draws `history.annotations` plus `draft` with `drawAnnotations`.

- [ ] **Step 3: Implement pointer-to-image coordinate conversion**

Add:

```tsx
const pointerToImagePoint = useCallback((event: React.PointerEvent): Point | null => {
  if (!session || !imageRef.current) {
    return null;
  }

  const rect = imageRef.current.getBoundingClientRect();
  const scale = Math.min(rect.width / session.width, rect.height / session.height);
  const renderedWidth = session.width * scale;
  const renderedHeight = session.height * scale;
  const offsetX = rect.left + (rect.width - renderedWidth) / 2;
  const offsetY = rect.top + (rect.height - renderedHeight) / 2;
  const x = (event.clientX - offsetX) / scale;
  const y = (event.clientY - offsetY) / scale;

  if (x < 0 || y < 0 || x > session.width || y > session.height) {
    return null;
  }

  return { x, y };
}, [session]);
```

- [ ] **Step 4: Implement drawing actions**

Add pointer handlers with these rules:

- `select`: `hitTestAnnotation(history.annotations, point)` and dispatch `select`.
- `text`: set `textDraft` using image coordinates and `event.clientX/event.clientY`.
- `rectangle`: draft `{ id: createId("rect"), type: "rectangle", ...normalizeRect(start, point), color: "#55f280", strokeWidth: 4 }`.
- `mosaic`: draft `{ id: createId("mosaic"), type: "mosaic", ...normalizeRect(start, point), color: "#55f280", strokeWidth: 2, pixelSize: 14 }`.
- `pin`: draft `{ id: createId("pin"), type: "pin", ...normalizeRect(start, point), color: "#55f280", strokeWidth: 2 }`.
- `arrow`: draft `{ id: createId("arrow"), type: "arrow", from: start, to: point, color: "#55f280", strokeWidth: 5 }`.
- `pen`: append `point` to a `{ id: createId("pen"), type: "pen", points, color: "#55f280", strokeWidth: 5 }` draft.

On pointer up, commit a non-pin draft with `dispatch({ type: "add", annotation: draft })` when bounds are at least 4px by 4px or pen has at least 2 points. For a pin draft, call the pin export path in Step 6.

- [ ] **Step 5: Implement text commit and keyboard shortcuts**

Text commit:

```tsx
function commitTextDraft() {
  if (!textDraft || textDraft.value.trim().length === 0) {
    setTextDraft(null);
    return;
  }

  dispatch({
    type: "add",
    annotation: {
      id: createId("text"),
      type: "text",
      x: textDraft.x,
      y: textDraft.y,
      text: textDraft.value.trim(),
      fontSize: 24,
      color: "#55f280",
      strokeWidth: 2,
    },
  });
  setTextDraft(null);
}
```

Keyboard handling:

- `undo`: dispatch `undo`.
- `redo`: dispatch `redo`.
- `removeSelected`: dispatch `removeSelected`.
- `cancel`: clear draft/text first; if idle, invoke `cancel_screenshot_session` with `{ sessionId: session.session_id }`.

- [ ] **Step 6: Implement copy, save, and pin export**

Add:

```tsx
function renderCurrentFinalCanvas(): HTMLCanvasElement {
  if (!session || !baseImage) {
    throw new Error("Capture session is not ready");
  }

  return renderFinalCanvas(baseImage, session.width, session.height, history.annotations);
}
```

For copy/save:

```tsx
async function commit(action: "copy" | "save") {
  if (!session) {
    return;
  }

  setIsCommitting(true);
  setError(null);
  try {
    const pngBase64 = canvasToPngDataUrl(renderCurrentFinalCanvas());
    await invoke("commit_screenshot", buildCommitScreenshotPayload({
      sessionId: session.session_id,
      action,
      pngBase64,
    }));
  } catch (err) {
    setError(String(err));
  } finally {
    setIsCommitting(false);
  }
}
```

For pin:

```tsx
async function commitPin(bounds: Bounds) {
  if (!session) {
    return;
  }

  const pngBase64 = cropCanvasToPngDataUrl(renderCurrentFinalCanvas(), bounds);
  if (!pngBase64) {
    return;
  }

  await invoke("pin_screenshot", buildPinScreenshotPayload(session.session_id, pngBase64));
}
```

- [ ] **Step 7: Render the capture editor UI**

Return this structure:

```tsx
return (
  <main className="capture-shell">
    {imageSrc ? (
      <img ref={imageRef} className="capture-image" src={imageSrc} alt="" draggable={false} />
    ) : null}
    <canvas
      ref={overlayRef}
      className="capture-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
    {textDraft ? (
      <input
        className="capture-text-input"
        style={{ left: textDraft.screenX, top: textDraft.screenY }}
        value={textDraft.value}
        autoFocus
        onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
        onBlur={commitTextDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitTextDraft();
          }
        }}
      />
    ) : null}
    {error ? <p className="capture-error">{error}</p> : null}
    <nav className="capture-toolbar-live" aria-label="Capture tools">
      {tools.map((entry) => (
        <button
          type="button"
          className={entry.tool === tool ? "capture-tool-live selected" : "capture-tool-live"}
          key={entry.tool}
          onClick={() => setTool(entry.tool)}
        >
          {entry.label}
        </button>
      ))}
      <span className="capture-divider-live" />
      <button type="button" className="capture-tool-live" onClick={() => dispatch({ type: "undo" })}>Undo</button>
      <button type="button" className="capture-tool-live" onClick={() => dispatch({ type: "redo" })}>Redo</button>
      <button type="button" className="capture-tool-live danger" onClick={() => dispatch({ type: "removeSelected" })}>Del</button>
      <span className="capture-divider-live" />
      <button type="button" className="capture-tool-live danger" onClick={cancel}>Esc</button>
      <button type="button" className="capture-tool-live" disabled={isCommitting} onClick={() => commit("save")}>Save</button>
      <button type="button" className="capture-tool-live confirm" disabled={isCommitting} onClick={() => commit("copy")}>Copy</button>
    </nav>
  </main>
);
```

- [ ] **Step 8: Add capture styles**

Append to `src/App.css`:

```css
.capture-shell {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #080b0f;
  color: #f8fbf5;
  user-select: none;
}

.capture-image,
.capture-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.capture-overlay {
  cursor: crosshair;
}

.capture-toolbar-live {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(18, 21, 25, 0.84);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(18px);
}

.capture-tool-live {
  min-width: 36px;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #f8fbf5;
  font-size: 12px;
  font-weight: 800;
}

.capture-tool-live.selected {
  background: #55f280;
  color: #102019;
}

.capture-tool-live.danger {
  color: #ff8585;
}

.capture-tool-live.confirm {
  color: #75ff9e;
}

.capture-divider-live {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
}

.capture-text-input {
  position: absolute;
  z-index: 4;
  min-width: 160px;
  height: 34px;
  padding: 0 8px;
  border: 2px solid #55f280;
  border-radius: 6px;
  background: rgba(8, 11, 15, 0.9);
  color: #f8fbf5;
  font: 20px Avenir Next, sans-serif;
  outline: none;
}

.capture-error {
  position: absolute;
  left: 18px;
  top: 18px;
  max-width: 520px;
  margin: 0;
  padding: 9px 11px;
  border-radius: 7px;
  background: rgba(120, 22, 22, 0.86);
  color: #fff1f1;
  font-size: 12px;
  line-height: 1.4;
}
```

- [ ] **Step 9: Run build**

Run:

```bash
pnpm build
```

Expected: frontend build succeeds.

## Task 7: Tighten Rust Session And Pin Behavior

**Files:**
- Modify: `src-tauri/src/services/screenshot.rs`

- [ ] **Step 1: Add failing Rust tests for store and pin labels**

Add tests inside the existing `#[cfg(test)] mod tests`:

```rust
#[test]
fn store_tracks_and_clears_active_session() {
    let store = ScreenshotSessionStore::default();
    store.set_active(ScreenshotSession {
        id: "session-1".into(),
        initial_action: "copy".into(),
        image_base64: "abc".into(),
        width: 100,
        height: 80,
    });

    let active = store.active().expect("session should exist");
    assert_eq!(active.id, "session-1");
    assert_eq!(active.width, 100);

    store.clear_active();
    assert!(store.active().is_none());
}

#[test]
fn create_pin_label_is_unique_and_prefixed() {
    let first = create_pin_label();
    let second = create_pin_label();
    assert!(first.starts_with("pin-"));
    assert!(second.starts_with("pin-"));
    assert_ne!(first, second);
}
```

- [ ] **Step 2: Run Rust tests to verify RED**

Run:

```bash
cargo test
```

from `src-tauri`.

Expected: the pin label test fails because `create_pin_label` does not exist.

- [ ] **Step 3: Implement unique pin labels and main-window restore on capture open failure**

Add:

```rust
fn restore_main_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

fn create_pin_label() -> String {
    format!("{PIN_WINDOW_LABEL}-{}", create_session_id())
}
```

In `start_screenshot_session`, if macOS capture or `open_capture_window` fails after hiding the main window, call `restore_main_window(&app)` before returning the error.

In `pin_screenshot`, remove the single-window close block and use:

```rust
let label = create_pin_label();
```

Update `cancel_screenshot_session` and `commit_screenshot` to call `restore_main_window(&app)` instead of duplicating show/focus code.

- [ ] **Step 4: Run Rust tests to verify GREEN**

Run:

```bash
cargo test
cargo check
```

from `src-tauri`.

Expected: both commands finish with exit code 0.

## Task 8: Full Verification And Manual Smoke

**Files:**
- No planned source changes unless verification exposes defects.

- [ ] **Step 1: Run all frontend unit checks**

Run:

```bash
pnpm exec tsc src/plugins/screenshot/capture/captureReducer.ts src/plugins/screenshot/capture/captureHotkeys.ts src/plugins/screenshot/capture/captureSerialize.ts src/plugins/screenshot/capture/captureCanvas.ts --module ES2020 --moduleResolution bundler --target ES2022 --outDir /private/tmp/ztool-capture-test --noEmit false --skipLibCheck
node --test tests/captureReducer.test.mjs tests/captureHotkeys.test.mjs tests/captureSerialize.test.mjs tests/captureCanvas.test.mjs
```

Expected: all Node tests pass.

- [ ] **Step 2: Run full frontend build**

Run:

```bash
pnpm build
```

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 3: Run Rust verification**

Run from `src-tauri`:

```bash
cargo test
cargo check
```

Expected: tests and check complete with exit code 0.

- [ ] **Step 4: Start the app for manual macOS verification**

Run:

```bash
pnpm tauri dev
```

Expected: the tray app starts. Use the screenshot panel and global shortcut to open capture, test rectangle, arrow, pen, text, mosaic, pin, copy, save, cancel, undo, redo, and delete. Confirm Windows behavior is unchanged by reviewing the `#[cfg(target_os = "windows")]` fallback branch remains `explorer.exe ms-screenclip:` then `SnippingTool.exe`.

- [ ] **Step 5: Commit implementation**

After all verification steps above pass:

```bash
git add src src-tauri tests docs/superpowers/plans/2026-05-24-ztool-screenshot-phase2.md
git commit -m "feat: add macos screenshot editor"
```
