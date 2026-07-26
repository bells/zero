import assert from "node:assert/strict";
import test from "node:test";
import {
  annotationBounds,
  clampBounds,
  hitTestAnnotation,
  isAnnotationLargeEnough,
  normalizeRect,
} from "/private/tmp/zero-capture-test/captureCanvas.js";

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

test("treats axis-aligned arrows as large enough by distance", () => {
  assert.equal(
    isAnnotationLargeEnough({
      id: "arrow-horizontal",
      type: "arrow",
      from: { x: 10, y: 20 },
      to: { x: 70, y: 20 },
      color: "#55f280",
      strokeWidth: 5,
    }),
    true,
  );
  assert.equal(
    isAnnotationLargeEnough({
      id: "arrow-vertical",
      type: "arrow",
      from: { x: 10, y: 20 },
      to: { x: 10, y: 70 },
      color: "#55f280",
      strokeWidth: 5,
    }),
    true,
  );
  assert.equal(
    isAnnotationLargeEnough({
      id: "arrow-tiny",
      type: "arrow",
      from: { x: 10, y: 20 },
      to: { x: 12, y: 20 },
      color: "#55f280",
      strokeWidth: 5,
    }),
    false,
  );
});
