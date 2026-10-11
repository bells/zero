import test from "node:test";
import assert from "node:assert/strict";
import { acceptMainNavigation } from "/private/tmp/zero-tests/appShell/mainNavigation.js";

test("late initial snapshot cannot replace a newer destination event", () => {
  const initial = { destination: "tools", revision: -1 };
  const newer = acceptMainNavigation(initial, { destination: "preferences", revision: 3 });
  assert.equal(acceptMainNavigation(newer, { destination: "tools", revision: 2 }), newer);
  assert.equal(acceptMainNavigation(newer, { destination: "tools", revision: 3 }), newer);
  assert.deepEqual(acceptMainNavigation(newer, { destination: "tools", revision: 4 }), { destination: "tools", revision: 4 });
});

test("invalid navigation never changes the current destination", () => {
  const current = { destination: "preferences", revision: 1 };
  for (const incoming of [{ destination: "capture", revision: 2 }, { destination: "tools", revision: NaN }, { destination: "tools", revision: 1.5 }]) {
    assert.equal(acceptMainNavigation(current, incoming), current);
  }
});


test("a retained tool target survives a late snapshot and a later tool replaces it", () => {
  const snap = { destination: "tools", revision: 2, pluginId: "zero.snap" };
  assert.equal(acceptMainNavigation(snap, { destination: "tools", revision: 1 }), snap);
  const file = { destination: "tools", revision: 3, pluginId: "zero.file" };
  assert.equal(acceptMainNavigation(snap, file), file);
  assert.equal(acceptMainNavigation(file, { destination: "tools", revision: 4, pluginId: 42 }), file);
});
