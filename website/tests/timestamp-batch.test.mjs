import test from 'node:test';
import assert from 'node:assert/strict';
import { JobRunner } from '../src/lib/web-tools/job-runner.ts';
const domain = await import('../src/lib/web-tools/timestamp-batch.ts').catch(() => ({}));
const options = { operation: 'timestamp-batch', source: '1700000000\n\nnot-a-date\r\n1700000000000\n', unit: 'auto', timezone: 'UTC+08:00', referenceNow: 123, locale: 'en' };
const value = (result) => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
test('batch keeps source identity and partial failures rather than aborting valid rows', () => {
  assert.equal(typeof domain.convertTimestampBatch, 'function', 'batch conversion is available');
  const batch = value(domain.convertTimestampBatch(options));
  assert.deepEqual(batch.counts, { success: 2, failed: 1, skipped: 1 });
  assert.deepEqual(batch.rows.map((row) => row.line), [1, 3, 4]);
  assert.equal(batch.rows[0].value.iso, '2023-11-14T22:13:20.000Z');
  assert.equal(batch.rows[2].value.iso, '2023-11-14T22:13:20.000Z');
  assert.equal(batch.rows[1].error.code, 'date');
  assert.match(batch.rows[1].error.message, /Invalid date/);
  assert.equal(batch.referenceNow, 123);
  assert.equal(batch.version, 1);
});
test('batch preserves raw source and strict units, timezones and pre-epoch rounding', () => {
  const batch = value(domain.convertTimestampBatch({ ...options, source: ' -1 \r2026-10-15 08:00:00\r2026-02-30 12:00:00', unit: 'milliseconds', timezone: 'UTC' }));
  assert.equal(batch.rows[0].source, ' -1 ');
  assert.equal(batch.rows[0].value.seconds, '-1');
  assert.equal(batch.rows[0].value.iso, '1969-12-31T23:59:59.999Z');
  assert.equal(batch.rows[1].value.iso, '2026-10-15T08:00:00.000Z');
  assert.equal(batch.rows[2].ok, false);
  assert.equal(value(domain.convertTimestampBatch({ ...options, source: '0\n-1' })).counts.failed, 2);
  assert.equal(value(domain.convertTimestampBatch({ ...options, source: '2026-10-15 08:00:00' })).rows[0].value.iso, '2026-10-15T00:00:00.000Z');
});
test('batch enforces whole input limits independently from individual row failures', () => {
  assert.equal(domain.convertTimestampBatch({ ...options, source: '\n \r\n' }).error.code, 'empty');
  assert.equal(domain.convertTimestampBatch({ ...options, source: 'x'.repeat(1024 * 1024 + 1) }).error.code, 'limit');
  assert.equal(domain.convertTimestampBatch({ ...options, source: '中'.repeat(350000) }).error.code, 'limit');
  assert.equal(domain.convertTimestampBatch({ ...options, source: Array(1001).fill('1700000000').join('\n') }).error.code, 'limit');
  const maximum = value(domain.convertTimestampBatch({ ...options, source: Array(1000).fill('1700000000').join('\n') + '\n' }));
  assert.equal(maximum.rows.length, 1000);
  const long = value(domain.convertTimestampBatch({ ...options, source: 'x'.repeat(257) + '\n1700000000' }));
  assert.equal(long.rows[0].error.code, 'limit'); assert.equal(long.rows[1].ok, true);
  const exact = value(domain.convertTimestampBatch({ ...options, source: ' '.repeat(246) + '1700000000' }));
  assert.equal(exact.rows[0].ok, true);
});
test('batch JSON export retains every row and snapshot exactly', () => {
  const batch = value(domain.convertTimestampBatch(options));
  const exported = value(domain.serializeTimestampBatch(batch));
  assert.deepEqual(JSON.parse(exported), batch);
  assert.equal(batch.rows[1].source, 'not-a-date');
  const oversized = { ...batch, extra: 'x'.repeat(8 * 1024 * 1024) };
  assert.equal(domain.serializeTimestampBatch(oversized).error.code, 'limit');
});
test('typed runner handles structured results and failed sends without stale output', async () => {
  const ports = [];
  const runner = new JobRunner(() => { const p = { onmessage: null, onerror: null, postMessage(job) { this.job = job; }, terminate() { this.dead = true; } }; ports.push(p); return p; }, 20);
  const first = runner.run(options); const second = runner.run(options);
  assert.equal((await first).error.code, 'cancelled');
  ports[0].onmessage({ data: { requestId: ports[0].job.requestId, result: { ok: true, value: { stale: true } } } });
  ports[1].onmessage({ data: { requestId: ports[1].job.requestId, result: { ok: true, value: { rows: [1] } } } });
  assert.deepEqual(value(await second), { rows: [1] });
  const broken = new JobRunner(() => ({ onmessage: null, onerror: null, postMessage() { throw Error('send'); }, terminate() {} }));
  assert.equal((await broken.run(options)).error.code, 'worker');
});

test('comparison rejects escape-expanded output above its byte budget without truncated success', async () => {
  const { compareText } = await import('../src/lib/web-tools/text-diff.ts');
  const result = compareText('"'.repeat(1024 * 1024), '\\'.repeat(1024 * 1024));
  assert.equal(result.ok, false); assert.equal(result.error.code, 'limit');
});
