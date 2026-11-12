import assert from "node:assert/strict";
import test from "node:test";

test("layout requests coalesce behind one in-flight call and deduplicate subpixel changes", async () => {
  const { createTrayLayoutQueue } = await import("/private/tmp/zero-tests/core/windowing/trayLayout.js");
  const calls = [];
  const resolvers = [];
  const queue = createTrayLayoutQueue((height, generation) => {
    calls.push([height, generation]);
    return new Promise((resolve) => resolvers.push(resolve));
  });
  queue.measure(300);
  queue.measure(340);
  queue.measure(350);
  assert.equal(calls.length, 1);
  resolvers.shift()();
  await new Promise(setImmediate);
  assert.deepEqual(calls, [[300, 1], [350, 2]]);
  resolvers.shift()();
  await new Promise(setImmediate);
  queue.measure(350.2);
  assert.equal(calls.length, 2);
  queue.dispose();
  queue.measure(400);
  assert.equal(calls.length, 2);
});

test("failed layout does not retry itself and disposal drops queued work", async () => {
  const { createTrayLayoutQueue } = await import("/private/tmp/zero-tests/core/windowing/trayLayout.js");
  let calls = 0;
  const queue = createTrayLayoutQueue(async () => { calls++; throw new Error("native failure"); });
  queue.measure(300);
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  queue.measure(300);
  assert.equal(calls, 1);
  queue.measure(320);
  await new Promise(setImmediate);
  assert.equal(calls, 2);
  queue.dispose();
});
