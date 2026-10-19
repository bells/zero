import assert from "node:assert/strict";
import test from "node:test";
import {
  captureReducer,
  initialHistoryState,
} from "/private/tmp/zero-tests/plugins/screenshot/capture/captureReducer.js";
import * as properties from "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationProperties.js";
import * as defaults from "/private/tmp/zero-tests/plugins/screenshot/capture/captureToolDefaults.js";

const rect = {
  id: "r",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 20,
  height: 10,
  color: "#55f280",
  strokeWidth: 4,
  opacity: 1,
  fillMode: "outline",
  cornerRadius: 0,
};

test("unchanged replacement and missing deletion preserve redo and state identity", () => {
  const added = captureReducer(initialHistoryState, {
    type: "add",
    annotation: rect,
  });
  const undone = captureReducer(added, { type: "undo" });
  const invalid = { ...undone, selectedId: "missing" };
  assert.equal(captureReducer(invalid, { type: "removeSelected" }), invalid);
  assert.equal(
    captureReducer(added, { type: "replace", annotation: { ...rect } }),
    added,
  );
});

test("continuous drawing can add without switching to selected-object context", () => {
  const added = captureReducer(initialHistoryState, {
    type: "add",
    annotation: rect,
    select: false,
  });
  assert.equal(added.selectedId, null);
  assert.equal(added.undoStack.length, 1);
});

test("legacy objects normalize and object radius does not rewrite requested defaults", () => {
  assert.equal(typeof properties.normalizeAnnotation, "function");
  const legacy = { ...rect };
  delete legacy.opacity;
  delete legacy.fillMode;
  delete legacy.cornerRadius;
  assert.deepEqual(properties.normalizeAnnotation(legacy), rect);
  const style = properties.normalizeToolStyle("rectangle", {
    cornerRadius: 40,
  });
  assert.equal(style.cornerRadius, 40);
  assert.equal(properties.patchAnnotationStyle(rect, style).cornerRadius, 5);
  assert.equal(style.cornerRadius, 40);
});

test("numeric requests reject fractions and nonfinite values and clamp valid integers", () => {
  assert.equal(typeof properties.parsePropertyNumber, "function");
  for (const input of ["", "hello", "NaN", "Infinity", "1.5"])
    assert.equal(
      properties.parsePropertyNumber("strokeWidth", input, 4).valid,
      false,
    );
  assert.deepEqual(properties.parsePropertyNumber("strokeWidth", "99", 4), {
    valid: true,
    value: 32,
  });
  assert.deepEqual(properties.parsePropertyNumber("opacity", "0", 100), {
    valid: true,
    value: 1,
  });
  assert.deepEqual(properties.parsePropertyNumber("fontSize", "1", 24), {
    valid: true,
    value: 12,
  });
  assert.deepEqual(properties.parsePropertyNumber("pixelSize", "80", 14), {
    valid: true,
    value: 64,
  });
});

test("patches are allowlisted per tool and colors cannot carry alpha", () => {
  assert.equal(typeof properties.normalizeToolStyle, "function");
  assert.deepEqual(
    properties.normalizeToolStyle("mosaic", {
      color: "#000000",
      opacity: 20,
      pixelSize: 30,
    }),
    { pixelSize: 30 },
  );
  assert.equal(
    properties.normalizeToolStyle("pen", { color: "#ABCDEF" }).color,
    "#abcdef",
  );
  assert.equal(
    properties.normalizeToolStyle("pen", { color: "#ffffff80" }).color,
    "#55f280",
  );
  assert.equal(
    "bold" in properties.normalizeToolStyle("arrow", { bold: true }),
    false,
  );
  assert.equal(
    properties.patchAnnotationStyle(rect, { opacity: 40 }).opacity,
    0.4,
  );
});

test("versioned defaults recover individual fields without crossing tools or overwriting unknown versions", () => {
  assert.equal(typeof defaults.readToolDefaults, "function");
  let writes = 0;
  const storage = {
    getItem: () =>
      JSON.stringify({
        version: 1,
        tools: {
          text: { fontSize: 13.5, color: "#112233" },
          rectangle: { strokeWidth: 99 },
        },
      }),
    setItem: () => writes++,
  };
  const loaded = defaults.readToolDefaults(storage);
  assert.equal(loaded.text.fontSize, 24);
  assert.equal(loaded.text.color, "#112233");
  assert.equal(loaded.rectangle.strokeWidth, 32);
  assert.equal(loaded.ellipse.strokeWidth, 4);
  assert.equal(writes, 0);
  storage.getItem = () => '{"version":99,"tools":{"text":{"fontSize":90}}}';
  assert.equal(defaults.readToolDefaults(storage).text.fontSize, 24);
  assert.equal(writes, 0);
  storage.getItem = () => "{broken";
  assert.equal(defaults.readToolDefaults(storage).text.fontSize, 24);
});

test("persisted defaults strip all scene and session content, save failures remain local", () => {
  assert.equal(typeof defaults.saveToolDefaults, "function");
  let record = "";
  const input = {
    ...defaults.readToolDefaults({ getItem: () => null }),
    session: "PRIVATE_TOKEN",
    text: "PRIVATE_TEXT",
    pixels: "PRIVATE_PIXELS",
  };
  input.text = {
    ...input.text,
    text: "SECRET_TEXT",
    x: 42,
    id: "PRIVATE_ID",
    ocr: "SECRET_OCR",
    path: "/private/file",
    history: [rect],
  };
  assert.equal(
    defaults.saveToolDefaults(
      {
        setItem: (key, value) => {
          assert.equal(key, "zero.snap.annotation-defaults.v1");
          record = value;
        },
      },
      input,
    ),
    true,
  );
  assert.deepEqual(Object.keys(JSON.parse(record)), ["version", "tools"]);
  assert.deepEqual(Object.keys(JSON.parse(record).tools.text).sort(), [
    "bold",
    "color",
    "fontSize",
    "opacity",
  ]);
  assert.doesNotMatch(record, /PRIVATE|SECRET|history|path|session|pixels/);
  assert.equal(
    defaults.saveToolDefaults(
      {
        setItem: () => {
          throw Error("full");
        },
      },
      input,
    ),
    false,
  );
});

test("transactions preview by ID, commit once, and reject late or stale targets", async () => {
  const { AnnotationEditController } = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationEditing.js"
  );
  assert.equal(typeof AnnotationEditController, "function");
  const editor = new AnnotationEditController();
  const token = editor.begin(rect, "move");
  for (let x = 11; x <= 30; x++) editor.preview(token, { ...rect, x });
  assert.equal(editor.scene([rect]).length, 1);
  assert.equal(editor.scene([rect])[0].x, 30);
  const action = editor.commit(token, [rect]);
  assert.equal(action.type, "replace");
  assert.equal(action.annotation.x, 30);
  assert.equal(editor.commit(token, [rect]), null);
  const cancelled = editor.begin(rect, "property");
  editor.preview(cancelled, { ...rect, opacity: 0.5 });
  editor.cancel();
  assert.deepEqual(editor.scene([rect]), [rect]);
  assert.equal(editor.commit(cancelled, [rect]), null);
  const stale = editor.begin(rect, "resize");
  editor.preview(stale, { ...rect, width: 40 });
  assert.equal(editor.commit(stale, [{ ...rect, x: 40 }]), null);
  const closed = editor.begin(rect, "move");
  editor.close();
  editor.preview(closed, { ...rect, x: 100 });
  assert.equal(editor.commit(closed, [rect]), null);
});

test("geometry preserves identity and styles while clamping moves, resizing and endpoints", async () => {
  const g = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js"
  );
  assert.equal(typeof g.moveAnnotation, "function");
  assert.deepEqual(
    g.moveAnnotation(rect, { x: 999, y: -999 }, { width: 100, height: 80 }),
    { ...rect, x: 80, y: 0 },
  );
  const rounded = { ...rect, cornerRadius: 5 };
  const small = g.resizeAnnotation(
    rounded,
    "bottom-right",
    { x: -99, y: -99 },
    { width: 100, height: 80 },
  );
  assert.equal(small.width, 4);
  assert.equal(small.height, 4);
  assert.equal(small.cornerRadius, 2);
  const pen = {
    id: "p",
    type: "pen",
    points: [
      { x: 20, y: 10 },
      { x: 20, y: 30 },
    ],
    color: "#55f280",
    strokeWidth: 5,
    opacity: 1,
  };
  const scaled = g.resizeAnnotation(
    pen,
    "bottom-right",
    { x: 40, y: 20 },
    { width: 100, height: 80 },
  );
  assert.deepEqual(scaled.points, [
    { x: 60, y: 10 },
    { x: 60, y: 50 },
  ]);
  assert.equal(scaled.strokeWidth, 5);
  const arrow = {
    id: "a",
    type: "arrow",
    from: { x: 10, y: 10 },
    to: { x: 30, y: 10 },
    color: "#55f280",
    strokeWidth: 5,
    opacity: 1,
    heads: "double",
  };
  const endpoint = g.moveArrowEndpoint(
    arrow,
    "to",
    { x: 99, y: 50 },
    { width: 80, height: 80 },
  );
  assert.deepEqual(endpoint.from, { x: 10, y: 10 });
  assert.deepEqual(endpoint.to, { x: 80, y: 50 });
  assert.equal(
    g.moveArrowEndpoint(
      arrow,
      "to",
      { x: 10, y: 10 },
      { width: 80, height: 80 },
    ).to.x,
    30,
  );
});

test("shared measured text layout and handles respect bold, multiline, arrow heads and viewport scale", async () => {
  const g = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js"
  );
  assert.equal(typeof g.annotationHandles, "function");
  const text = {
    id: "t",
    type: "text",
    x: 20,
    y: 30,
    text: "中A\nB",
    fontSize: 24,
    bold: true,
    color: "#55f280",
    opacity: 1,
    strokeWidth: 2,
  };
  const layout = g.textLayout(text, {
    measureText: (line) => ({ width: line === "中A" ? 43 : 18 }),
  });
  assert.equal(layout.bounds.width, 43);
  assert.equal(layout.lineHeight, 32.400000000000006);
  assert.equal(g.annotationHandles(text).length, 0);
  assert.equal(g.annotationHandles(rect).length, 8);
  assert.equal(
    g.hitAnnotationHandle(
      rect,
      { x: 8, y: 20 },
      { width: 100, height: 100 },
      { width: 50, height: 50 },
    ),
    "top-left",
  );
  const arrow = {
    id: "a",
    type: "arrow",
    from: { x: 10, y: 20 },
    to: { x: 70, y: 20 },
    strokeWidth: 5,
    color: "#55f280",
    opacity: 1,
    heads: "double",
  };
  assert.ok(g.selectableBounds(arrow).height > 10);
  assert.equal(g.annotationHandles(arrow).length, 2);
});

test("preview resources reuse one bounded canvas and release it; missing context fails explicitly", async () => {
  const { AnnotationRenderResources } = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureCanvas.js"
  );
  const previous = globalThis.document;
  let created = 0;
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => ({ clearRect() {} }),
  };
  globalThis.document = {
    createElement: () => {
      created++;
      return canvas;
    },
  };
  try {
    const resources = new AnnotationRenderResources();
    assert.equal(resources.acquire(20, 30).canvas, canvas);
    resources.acquire(20, 30);
    assert.equal(created, 1);
    assert.equal(canvas.width, 20);
    assert.equal(canvas.height, 30);
    resources.release();
    assert.equal(canvas.width, 1);
    assert.equal(canvas.height, 1);
    canvas.getContext = () => null;
    assert.throws(() => resources.acquire(10, 10), /annotation-render-failed/);
    resources.release();
  } finally {
    globalThis.document = previous;
  }
});

test("object viewport projection retains zero axes and contains image scaling", async () => {
  const geometry = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js"
  );
  assert.equal(typeof geometry.annotationBoundsToViewport, "function");
  assert.deepEqual(
    geometry.annotationBoundsToViewport(
      { x: 10, y: 20, width: 60, height: 0 },
      { width: 100, height: 100 },
      { width: 200, height: 100 },
    ),
    { x: 60, y: 20, width: 60, height: 0 },
  );
  assert.equal(
    geometry.hitAnnotationHandle(
      rect,
      { x: 3, y: 20 },
      { width: 100, height: 100 },
      { width: 200, height: 100 },
    ),
    "top-left",
  );
});

test("resizing a zero-extent Pen axis translates and clamps that axis", async () => {
  const { resizeAnnotation } = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js"
  );
  const pen = {
    id: "p",
    type: "pen",
    points: [
      { x: 10, y: 20 },
      { x: 50, y: 20 },
    ],
    color: "#000000",
    strokeWidth: 5,
    opacity: 1,
  };
  assert.deepEqual(
    resizeAnnotation(pen, "bottom", { x: 0, y: 15 }, { width: 100, height: 80 })
      .points,
    [
      { x: 10, y: 35 },
      { x: 50, y: 35 },
    ],
  );
  assert.deepEqual(
    resizeAnnotation(pen, "top", { x: 0, y: -100 }, { width: 100, height: 80 })
      .points,
    [
      { x: 10, y: 0 },
      { x: 50, y: 0 },
    ],
  );
});
