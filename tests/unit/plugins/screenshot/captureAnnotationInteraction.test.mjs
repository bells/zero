import assert from "node:assert/strict";
import test from "node:test";
import { hitTestAnnotation } from "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js";
const image = { width: 1000, height: 700 };
const context = { image, viewport: image };
const style = { color: "#ff5252", strokeWidth: 2, opacity: 1 };
const rect = {
  id: "rect",
  type: "rectangle",
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  cornerRadius: 0,
  fillMode: "outline",
  ...style,
};
const hit = (objects, point, ctx = context) =>
  hitTestAnnotation(objects, point, ctx)?.id ?? null;

test("outline interiors pass through while strokes remain selectable", () => {
  assert.equal(hit([rect], { x: 150, y: 150 }), null);
  assert.equal(hit([rect], { x: 100, y: 150 }), "rect");
  const behind = { ...rect, id: "behind", fillMode: "solid" };
  assert.equal(hit([behind, rect], { x: 150, y: 150 }), "behind");
  assert.equal(hit([{ ...rect, opacity: 0.01 }], { x: 100, y: 150 }), "rect");
});
test("rounded corners and ellipse outlines do not use bounding-box picking", () => {
  const rounded = {
    ...rect,
    width: 200,
    height: 200,
    cornerRadius: 80,
    fillMode: "solid",
  };
  assert.equal(hit([rounded], { x: 103, y: 103 }), null);
  assert.equal(hit([rounded], { x: 180, y: 105 }), "rect");
  const ellipse = {
    ...rect,
    id: "ellipse",
    type: "ellipse",
    width: 400,
    height: 20,
  };
  assert.equal(hit([ellipse], { x: 300, y: 110 }), null);
  assert.equal(hit([ellipse], { x: 300, y: 100 }), "ellipse");
  assert.equal(hit([ellipse], { x: 100, y: 100 }), null);
  assert.equal(
    hit([{ ...ellipse, fillMode: "solid" }], { x: 300, y: 110 }),
    "ellipse",
  );
});
test("arrow shafts, both filled heads and actual Pen segments are selectable", () => {
  const arrow = {
    id: "arrow",
    type: "arrow",
    from: { x: 100, y: 100 },
    to: { x: 300, y: 300 },
    heads: "double",
    ...style,
    strokeWidth: 10,
  };
  assert.equal(hit([arrow], { x: 110, y: 280 }), null);
  assert.equal(hit([arrow], { x: 200, y: 200 }), "arrow");
  const horizontal = {
    ...arrow,
    from: { x: 100, y: 100 },
    to: { x: 300, y: 100 },
  };
  assert.equal(hit([horizontal], { x: 275, y: 111 }), "arrow");
  assert.equal(hit([horizontal], { x: 125, y: 111 }), "arrow");
  const pen = {
    id: "pen",
    type: "pen",
    points: [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
    ],
    ...style,
  };
  assert.equal(hit([pen], { x: 180, y: 200 }), null);
  assert.equal(hit([pen], { x: 200, y: 100 }), "pen");
  assert.equal(
    hit([{ ...pen, points: [{ x: 100, y: 100 }] }], { x: 104, y: 100 }),
    "pen",
  );
  assert.equal(hit([{ ...pen, points: [] }], { x: 100, y: 100 }), null);
});
test("stroke click tolerance stays constant in CSS pixels at different scales", () => {
  const pen = {
    id: "pen",
    type: "pen",
    points: [
      { x: 100, y: 200 },
      { x: 700, y: 200 },
    ],
    ...style,
    strokeWidth: 0.1,
  };
  for (const scale of [1, 0.5, 2]) {
    const ctx = {
      image,
      viewport: { width: image.width * scale, height: image.height * scale },
    };
    assert.equal(hit([pen], { x: 300, y: 200 + 5 / scale }, ctx), "pen");
    assert.equal(hit([pen], { x: 300, y: 200 + 7 / scale }, ctx), null);
  }
});
test("text layout and Mosaic regions are selectable while Pin is not an object", () => {
  const text = {
    id: "text",
    type: "text",
    x: 100,
    y: 140,
    text: "中A\nB",
    fontSize: 24,
    bold: true,
    ...style,
  };
  assert.equal(hit([text], { x: 110, y: 140 }), "text");
  const mosaic = {
    id: "mosaic",
    type: "mosaic",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    pixelSize: 14,
  };
  assert.equal(hit([mosaic], { x: 150, y: 150 }), "mosaic");
  assert.equal(
    hit([{ ...mosaic, id: "pin", type: "pin" }], { x: 150, y: 150 }),
    null,
  );
});
test("object handles precede crop handles and Option skips only bodies", async () => {
  const { resolveAnnotationPointerTarget } = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationInteraction.js"
  );
  const input = {
    annotations: [rect],
    selected: rect,
    point: { x: 100, y: 100 },
    context,
    cropHandle: "top-left",
    bypassObjectBody: true,
  };
  assert.equal(resolveAnnotationPointerTarget(input).kind, "object-handle");
  assert.equal(
    resolveAnnotationPointerTarget({ ...input, selected: null }).kind,
    "crop-handle",
  );
  assert.equal(
    resolveAnnotationPointerTarget({
      ...input,
      point: { x: 100, y: 150 },
      cropHandle: null,
      selected: null,
    }).kind,
    "blank",
  );
  assert.equal(
    resolveAnnotationPointerTarget({
      ...input,
      point: { x: 100, y: 150 },
      cropHandle: null,
      selected: null,
      bypassObjectBody: false,
    }).kind,
    "object",
  );
});

test("shape Shift resize preserves original ratio and fixed anchors at image limits", async () => {
  const { resizeAnnotation } = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js"
  );
  const original = { ...rect, x: 100, y: 100, width: 80, height: 40 };
  const resized = resizeAnnotation(
    original,
    "bottom-right",
    { x: 80, y: 0 },
    image,
    { preserveAspectRatio: true },
  );
  assert.equal(resized.width / resized.height, 2);
  assert.equal(resized.x, 100);
  assert.equal(resized.y, 100);
  assert.equal(resized.width, 144);
  assert.equal(resized.height, 72);
  const edge = resizeAnnotation(original, "right", { x: 80, y: 0 }, image, {
    preserveAspectRatio: true,
  });
  assert.deepEqual(
    [edge.x, edge.y, edge.width, edge.height],
    [100, 80, 160, 80],
  );
  const boundary = resizeAnnotation(
    original,
    "top-left",
    { x: -1000, y: -1000 },
    image,
    { preserveAspectRatio: true },
  );
  assert.equal(boundary.width / boundary.height, 2);
  assert.equal(boundary.x, 0);
  assert.equal(boundary.x + boundary.width, 180);
  assert.equal(boundary.y + boundary.height, 140);
  for (const type of ["ellipse", "mosaic"]) {
    const object = { ...original, type, pixelSize: 14 };
    const result = resizeAnnotation(object, "left", { x: 999, y: 0 }, image, {
      preserveAspectRatio: true,
    });
    assert.equal(result.width / result.height, 2);
    assert.ok(result.width >= 4 && result.height >= 4);
  }
  const free = resizeAnnotation(
    original,
    "bottom-right",
    { x: 80, y: 0 },
    image,
    { preserveAspectRatio: false },
  );
  assert.deepEqual([free.width, free.height], [160, 40]);
  assert.deepEqual(
    resizeAnnotation(original, "bottom-right", { x: 80, y: 0 }, image, {
      preserveAspectRatio: true,
    }),
    resized,
  );
});
test("Pen scaling is uniform and degenerate axes remain finite", async () => {
  const { resizeAnnotation } = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js"
  );
  const pen = {
    id: "pen",
    type: "pen",
    points: [
      { x: 100, y: 100 },
      { x: 180, y: 140 },
    ],
    ...style,
  };
  const scaled = resizeAnnotation(pen, "right", { x: 80, y: 30 }, image);
  assert.deepEqual(scaled.points, [
    { x: 100, y: 80 },
    { x: 260, y: 160 },
  ]);
  assert.equal(scaled.strokeWidth, 2);
  const flat = {
    ...pen,
    points: [
      { x: 100, y: 100 },
      { x: 180, y: 100 },
    ],
  };
  assert.deepEqual(
    resizeAnnotation(flat, "bottom-right", { x: 80, y: 100 }, image).points,
    [
      { x: 100, y: 100 },
      { x: 260, y: 100 },
    ],
  );
  const point = { ...pen, points: [{ x: 100, y: 100 }] };
  assert.deepEqual(
    resizeAnnotation(point, "bottom-right", { x: 80, y: 100 }, image),
    point,
  );
});
test("Text corner resize retains opposite measured anchor and manual lines", async () => {
  const { resizeAnnotation, textLayout, annotationHandles } = await import(
    "/private/tmp/zero-tests/plugins/screenshot/capture/captureAnnotationGeometry.js"
  );
  const text = {
    id: "text",
    type: "text",
    x: 300,
    y: 224,
    text: "中文\nAB",
    fontSize: 24,
    bold: true,
    ...style,
  };
  assert.equal(annotationHandles(text).length, 4);
  const bounds = textLayout(text).bounds;
  for (const handle of [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]) {
    const dx = handle.includes("left") ? -bounds.width : bounds.width;
    const dy = handle.includes("top") ? -bounds.height : bounds.height;
    const result = resizeAnnotation(text, handle, { x: dx, y: dy }, image);
    assert.equal(result.fontSize, 48);
    assert.equal(result.text, text.text);
    assert.equal(result.bold, true);
    const after = textLayout(result).bounds;
    const anchorX = handle.includes("left")
      ? bounds.x + bounds.width
      : bounds.x;
    const anchorY = handle.includes("top")
      ? bounds.y + bounds.height
      : bounds.y;
    assert.ok(
      Math.abs(
        (handle.includes("left") ? after.x + after.width : after.x) - anchorX,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        (handle.includes("top") ? after.y + after.height : after.y) - anchorY,
      ) < 1e-8,
    );
  }
  const left = { ...text, x: 0 };
  assert.equal(
    resizeAnnotation(left, "top-left", { x: -100, y: -100 }, image).fontSize,
    24,
  );
  assert.equal(
    resizeAnnotation(text, "bottom-right", { x: 10000, y: 10000 }, image)
      .fontSize,
    96,
  );
  assert.equal(
    resizeAnnotation(text, "bottom-right", { x: -10000, y: -10000 }, image)
      .fontSize,
    12,
  );
});
