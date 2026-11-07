import assert from "node:assert/strict";
import test from "node:test";
import { observePopoverPlacement } from "/private/tmp/zero-tests/core/windowing/popoverPlacement.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("popover subscribes before reading its snapshot and ignores an older snapshot", async () => {
  const calls = [];
  const received = [];
  let listener;
  let resolveSnapshot;
  const dispose = observePopoverPlacement({
    listen(accept) {
      calls.push("listen");
      listener = accept;
      return Promise.resolve(() => calls.push("stop"));
    },
    snapshot() {
      calls.push("snapshot");
      return new Promise((resolve) => { resolveSnapshot = resolve; });
    },
  }, (placement) => received.push(placement));
  await flush();
  assert.deepEqual(calls, ["listen", "snapshot"]);
  listener({ revision: 2, anchorX: 360 });
  resolveSnapshot({ revision: 1, anchorX: 200 });
  await flush();
  listener({ revision: 2, anchorX: 100 });
  listener({ revision: 3, anchorX: null });
  assert.deepEqual(received, [{ revision: 2, anchorX: 360 }, { revision: 3, anchorX: null }]);
  dispose();
  listener({ revision: 4, anchorX: 20 });
  assert.equal(received.length, 2);
  assert.equal(calls.at(-1), "stop");
});

test("a lazy popover reads the latest retained anchor without a live event", async () => {
  const received = [];
  const dispose = observePopoverPlacement({
    listen: async () => () => {},
    snapshot: async () => ({ revision: 7, anchorX: 32 }),
  }, (placement) => received.push(placement));
  await flush();
  assert.deepEqual(received, [{ revision: 7, anchorX: 32 }]);
  dispose();
});

test("unmount during listener registration releases the late subscription", async () => {
  let resolveListener;
  let stopped = 0;
  let snapshotReads = 0;
  const received = [];
  const dispose = observePopoverPlacement({
    listen: () => new Promise((resolve) => { resolveListener = resolve; }),
    snapshot: async () => {
      snapshotReads += 1;
      return { revision: 1, anchorX: 200 };
    },
  }, (placement) => received.push(placement));
  dispose();
  resolveListener(() => { stopped += 1; });
  await flush();
  assert.equal(stopped, 1);
  assert.equal(snapshotReads, 0);
  assert.deepEqual(received, []);
});

test("unmount while a snapshot is pending prevents late state publication", async () => {
  let resolveSnapshot;
  const received = [];
  const dispose = observePopoverPlacement({
    listen: async () => () => {},
    snapshot: () => new Promise((resolve) => { resolveSnapshot = resolve; }),
  }, (placement) => received.push(placement));
  await flush();
  dispose();
  resolveSnapshot({ revision: 1, anchorX: 200 });
  await flush();
  assert.deepEqual(received, []);
});
