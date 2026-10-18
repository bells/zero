import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/lib/web-tools/image-batch.ts';
import * as contracts from '../src/lib/web-tools/image-contracts.ts';
const settings = { operation: 'convert', output: { format: 'preserve', quality: 75, maxLongEdge: null, jpegBackground: '#ffffff' } };
const sources = ['a', 'b', 'c'].map((itemId) => ({ itemId, sourceBytes: 100, format: 'heic' }));
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
function loaded(count = 3) {
  return ok(model.replaceImageSources(model.createImageBatch(settings), sources.slice(0, count)));
}
function started(state, selection = 'pending') { return ok(model.startImageBatch(state, selection)); }
function next(state) { return ok(model.nextImageJob(state)); }
function success(identity) { return { kind: 'result', ...identity, output: { format: 'jpeg', mime: 'image/jpeg', width: 10, height: 5, byteLength: 3, bytes: new ArrayBuffer(3) } }; }
const current = (state) => model.currentImageResults(state).map((item) => item.itemId);
test('import is idle and dispatch permits only one active item', () => {
  const state = loaded();
  assert.equal(state.mode, 'idle'); assert.equal(state.active, null);
  assert.equal(next(state).job, null);
  const run = next(started(state));
  assert.equal(run.job.itemId, 'a'); assert.equal(run.state.items[0].status, 'probing');
  assert.equal(model.nextImageJob(run.state).ok, false);
  assert.equal(model.startImageBatch(run.state, 'pending').ok, false);
  assert.equal(state.items[0].status, 'queued', 'Transitions must not mutate previous snapshots');
});
test('failure continues the queue; retry selects failed items and preserves successful output', () => {
  let run = next(started(loaded(2)));
  let state = model.acceptImageMessage(run.state, { kind: 'error', ...run.job, code: 'decode' });
  run = next(state); assert.equal(run.job.itemId, 'b');
  state = model.acceptImageMessage(run.state, success(run.job));
  assert.deepEqual(current(state), ['b']); assert.equal(state.mode, 'idle');
  run = next(started(state, 'failed')); assert.equal(run.job.itemId, 'a');
  assert.deepEqual(current(run.state), ['b']);
  state = model.acceptImageMessage(run.state, success(run.job));
  assert.deepEqual(current(state), ['a', 'b']);
});
test('cancel stops active and queued work while preserving same-revision successes', () => {
  let run = next(started(loaded()));
  let state = model.acceptImageMessage(run.state, success(run.job));
  run = next(state); const old = run.job;
  state = model.cancelImageBatch(run.state);
  assert.deepEqual(state.items.map((item) => item.status), ['success', 'cancelled', 'cancelled']);
  assert.deepEqual(current(state), ['a']); assert.equal(next(state).job, null);
  assert.equal(model.acceptImageMessage(state, success(old)), state);
  run = next(started(state)); assert.equal(run.job.itemId, 'b'); assert.notEqual(run.job.jobId, old.jobId);
  assert.equal(model.acceptImageMessage(run.state, success(old)), run.state, 'Late attempt cannot replace retried work');
});
test('settings changes invalidate exports, stop active identity and retain source descriptors', () => {
  let run = next(started(loaded(2)));
  let state = model.acceptImageMessage(run.state, success(run.job));
  run = next(state);
  state = ok(model.changeImageSettings(run.state, { ...settings, output: { ...settings.output, quality: 80 } }));
  assert.equal(state.revision, run.state.revision + 1); assert.equal(state.active, null);
  assert.deepEqual(current(state), []); assert.deepEqual(state.items.map((item) => item.itemId), ['a', 'b']);
  assert.equal(model.acceptImageMessage(state, success(run.job)), state);
});
test('clear increments revision and rejects old completions without resurrecting sources', () => {
  const run = next(started(loaded(1)));
  const state = ok(model.clearImageBatch(run.state));
  assert.equal(state.revision, run.state.revision + 1); assert.deepEqual(state.items, []);
  assert.equal(model.acceptImageMessage(state, success(run.job)), state);
});
test('progress cannot regress or cross item/job/revision boundaries', () => {
  const run = next(started(loaded(1)));
  const state = model.acceptImageMessage(run.state, { kind: 'progress', ...run.job, phase: 'encoding' });
  assert.equal(state.items[0].status, 'encoding');
  for (const identity of [{ ...run.job, itemId: 'other' }, { ...run.job, jobId: run.job.jobId + 1 }, { ...run.job, batchRevision: 999 }]) assert.equal(model.acceptImageMessage(state, success(identity)), state);
  assert.equal(model.acceptImageMessage(state, { kind: 'progress', ...run.job, phase: 'decoding' }), state);
});
test('duplicate identities and invalid source sizes cannot create ambiguous jobs', () => {
  const state = loaded(1);
  for (const input of [[sources[0], sources[0]], [{ ...sources[0], sourceBytes: NaN }], [{ ...sources[0], sourceBytes: 0 }], [{ ...sources[0], itemId: '' }]]) {
    assert.equal(model.replaceImageSources(state, input).ok, false);
  }
  assert.equal(state.items.length, 1);
});
test('worker boundary validates bytes, dimensions, MIME and known errors, stripping unrelated fields', () => {
  const identity = { jobId: 1, batchRevision: 1, itemId: 'a' };
  const valid = success(identity);
  assert.equal(contracts.parseImageMessage(valid).output.bytes, valid.output.bytes);
  const malformed = [null, {}, { ...valid, jobId: '1' }, { ...valid, output: { ...valid.output, mime: 'image/png' } }, { ...valid, output: { ...valid.output, width: Infinity } }, { ...valid, output: { ...valid.output, bytes: new ArrayBuffer(2) } }, { ...valid, output: { ...valid.output, bytes: new Uint8Array(3) } }, { kind: 'error', ...identity, code: 'raw-sensitive-message' }];
  for (const message of malformed) assert.equal(contracts.parseImageMessage(message), null);
  assert.deepEqual(contracts.parseImageMessage({ kind: 'error', ...identity, code: 'decode', detail: 'PRIVATE_METADATA' }), { kind: 'error', ...identity, code: 'decode' });
});
