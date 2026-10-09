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
