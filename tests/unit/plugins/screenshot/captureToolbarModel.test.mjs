import assert from "node:assert/strict";
import test from "node:test";
import * as model from "/private/tmp/zero-tests/plugins/screenshot/capture/captureToolbarModel.js";
const toolbar = { width: 600, height: 50 };
const viewport = { width: 1440, height: 900 };
const reserve = { width: 520, height: 100 };
const position = (selection, view = viewport) =>
  model.resolveCaptureToolbarPosition(selection, toolbar, view, reserve);
test("centers below a selection only when the full reservation fits", () => {
  assert.deepEqual(position({ x: 200, y: 100, width: 900, height: 500 }), {
    left: 350,
    top: 608,
    placement: "outside-bottom",
  });
  assert.deepEqual(position({ x: 200, y: 300, width: 900, height: 500 }), {
    left: 350,
    top: 242,
    placement: "outside-top",
  });
});
test("prefers outside above for bottom-edge selections and inside bottom for fullscreen", () => {
  assert.equal(
    position({ x: 300, y: 600, width: 800, height: 300 }).placement,
    "outside-top",
  );
  assert.deepEqual(position({ x: 0, y: 0, width: 1440, height: 900 }), {
    left: 420,
    top: 842,
    placement: "inside-bottom",
  });
});
test("extends beyond narrow selections and clamps only at viewport edges", () => {
  assert.equal(position({ x: 600, y: 100, width: 40, height: 100 }).left, 320);
  assert.equal(position({ x: 0, y: 100, width: 40, height: 100 }).left, 8);
  assert.equal(position({ x: 1400, y: 100, width: 40, height: 100 }).left, 832);
});
test("a wide reservation does not alter the toolbar center", () => {
  const selection = { x: 200, y: 100, width: 900, height: 200 };
  assert.deepEqual(
    model.resolveCaptureToolbarPosition(selection, toolbar, viewport, {
      width: 1200,
      height: 100,
    }),
    position(selection),
  );
});
test("property layout flips, clamps independently, and bounds tiny viewport scrolling", () => {
  assert.equal(typeof model.resolveCapturePropertyPosition, "function");
  const bar = { x: 350, y: 608, ...toolbar };
  assert.deepEqual(
    model.resolveCapturePropertyPosition(bar, reserve, viewport, "below", 400),
    { left: 368, top: 666, caretLeft: 32, maxHeight: 226 },
  );
  const above = model.resolveCapturePropertyPosition(
    { ...bar, y: 242 },
    reserve,
    viewport,
    "above",
    1300,
  );
  assert.equal(above.left, 912);
  assert.equal(above.top, 134);
  assert.equal(above.caretLeft, 388);
  const tiny = model.resolveCapturePropertyPosition(
    { x: 8, y: 62, width: 344, height: 50 },
    { width: 344, height: 280 },
    { width: 360, height: 120 },
    "above",
    60,
  );
  assert.ok(tiny.top >= 8);
  assert.ok(tiny.maxHeight <= 104);
});
test("anchor caret follows each button and hides outside the scroll viewport", () => {
  assert.equal(
    model.resolveAnnotationPanelAnchor(
      { x: 52, y: 0, width: 40, height: 40 },
      520,
      780,
    ).caretLeft,
    32,
  );
  assert.equal(
    model.resolveAnnotationPanelAnchor(
      { x: -60, y: 0, width: 40, height: 40 },
      344,
      344,
    ).visible,
    false,
  );
});

test("automatic above toolbar clears the fixed crop strip without moving it", () => {
  const crop = { x: 200, y: 400, width: 600, height: 299 },
    bar = { width: 684, height: 50 },
    view = { width: 1000, height: 700 },
    reserved = { width: 517, height: 98 },
    strip = { x: 200, y: 356, width: 422, height: 42 };
  const result = model.resolveCaptureToolbarPosition(
    crop,
    bar,
    view,
    reserved,
    strip,
  );
  assert.equal(result.placement, "outside-top");
  assert.ok(result.top + bar.height <= strip.y - 8);
  assert.deepEqual(strip, { x: 200, y: 356, width: 422, height: 42 });
});

test("automatic below toolbar clears the strip for a tiny top-edge crop", () => {
  const result = model.resolveCaptureToolbarPosition(
    { x: 200, y: 0, width: 600, height: 4 },
    { width: 684, height: 50 },
    { width: 1000, height: 700 },
    { width: 517, height: 98 },
    { x: 200, y: 2, width: 422, height: 42 },
  );
  assert.equal(result.placement, "outside-bottom");
  assert.equal(result.top, 52);
});
