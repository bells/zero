import test from 'node:test';
import assert from 'node:assert/strict';
import { processTreeRss } from './process-memory.mjs';
test('counts only the dedicated browser process and descendants, converts KiB to bytes', () => {
  const result = processTreeRss('101 1 100\n102 101 200\n103 102 300\n999 1 9000\n', 101);
  assert.equal(result.rootAlive, true);
  assert.equal(result.rssBytes, 614400);
  assert.deepEqual(result.processes.map((entry) => entry.pid), [101, 102, 103]);
});
test('a missing browser or unreadable ps sample cannot become a false zero-memory success', () => {
  assert.deepEqual(processTreeRss('999 1 9000\n', 101), { rootAlive: false, rssBytes: null, processes: [] });
  for (const text of ['', '101 1 NaN', '101 1 -3', '101 1 1 trailing', '101 1 10\n101 1 20']) assert.throws(() => processTreeRss(text, 101));
});
test('removed workers leave the current tree instead of accumulating stale RSS', () => {
  assert.equal(processTreeRss('101 1 100\n102 101 200\n', 101).rssBytes, 307200);
  assert.equal(processTreeRss('101 1 110\n', 101).rssBytes, 112640);
});
