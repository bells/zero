import assert from "node:assert/strict";
import test from "node:test";
import * as model from "/private/tmp/zero-tests/plugins/screenshot/capture/captureToolbarModel.js";
const toolbar = { width: 748, height: 50 },
  reserved = { width: 520, height: 98 },
  viewport = { width: 1000, height: 700 };
test("toolbar drag reserves attached properties on the original side", () => {
  assert.equal(typeof model.resolveCaptureToolbarDragBounds, "function");
  assert.deepEqual(
    model.resolveCaptureToolbarDragBounds(toolbar, reserved, viewport, "below"),
    { x: 0, y: 0, width: 748, height: 156 },
  );
  assert.deepEqual(
    model.resolveCaptureToolbarDragBounds(toolbar, reserved, viewport, "above"),
    { x: 0, y: -106, width: 748, height: 156 },
  );
});
test("whole group stays in the viewport with minimum toolbar translation", () => {
  assert.equal(typeof model.clampCaptureToolbarDragPosition, "function");
  const above = { x: 0, y: -106, width: 748, height: 156 };
  assert.deepEqual(
    model.clampCaptureToolbarDragPosition(
      { left: 80, top: 200 },
      above,
      viewport,
    ),
    { left: 80, top: 200 },
  );
  assert.deepEqual(
    model.clampCaptureToolbarDragPosition(
      { left: -5, top: 0 },
      above,
      viewport,
    ),
    { left: 8, top: 114 },
  );
  assert.deepEqual(
    model.clampCaptureToolbarDragPosition(
      { left: 900, top: 690 },
      { x: 0, y: 0, width: 748, height: 156 },
      viewport,
    ),
    { left: 244, top: 536 },
  );
});
test("short viewport bounds property scrolling before clamping the toolbar group", () => {
  assert.equal(typeof model.resolveCaptureToolbarDragBounds, "function");
  const bounds = model.resolveCaptureToolbarDragBounds(
    { width: 344, height: 50 },
    { width: 279, height: 194 },
    { width: 360, height: 160 },
    "above",
  );
  assert.deepEqual(bounds, { x: 0, y: -94, width: 344, height: 144 });
  assert.deepEqual(
    model.clampCaptureToolbarDragPosition({ left: 8, top: 20 }, bounds, {
      width: 360,
      height: 160,
    }),
    { left: 8, top: 102 },
  );
});
test("group movement applies pointer delta without touching scene coordinates", () => {
  assert.equal(typeof model.moveCaptureToolbarGroup, "function");
  assert.deepEqual(
    model.moveCaptureToolbarGroup(
      { left: 100, top: 200 },
      { x: 110, y: 210 },
      { x: 130, y: 240 },
      { x: 0, y: 0, width: 748, height: 156 },
      viewport,
    ),
    { left: 120, top: 230 },
  );
});
