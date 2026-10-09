import assert from "node:assert/strict";
import test from "node:test";
import { navigationOverflow } from "/private/tmp/zero-tests/appShell/navigationLayout.js";

test("overflow controls distinguish boundaries and subpixel tolerance", () => {
  assert.deepEqual(navigationOverflow(0, 300, 299), { overflowing: false, previous: false, next: false });
  assert.deepEqual(navigationOverflow(0, 300, 900), { overflowing: true, previous: false, next: true });
  assert.deepEqual(navigationOverflow(200, 300, 900), { overflowing: true, previous: true, next: true });
  assert.deepEqual(navigationOverflow(599.5, 300, 900), { overflowing: true, previous: true, next: false });
  assert.deepEqual(navigationOverflow(-3, 300, 900), { overflowing: true, previous: false, next: true });
});
