import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { parseTimestamp, timestampRows } from '../src/lib/web-tools/timestamp.ts';
import { transformJson } from '../src/lib/web-tools/json.ts';
import { transformText, decodeBytes, encodeBytes } from '../src/lib/web-tools/encoding.ts';
import { inspectImage, transformImage } from '../src/lib/web-tools/image.ts';
import { limits } from '../src/lib/web-tools/contracts.ts';
import { JobRunner } from '../src/lib/web-tools/job-runner.ts';
import { execute } from '../src/lib/web-tools/execute.ts';
const value = (result) => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fails = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); };
test('timestamp units, epoch, signed values and strict range', () => {
  assert.equal(value(parseTimestamp('1700000000')).milliseconds, 1700000000000);
  assert.equal(value(parseTimestamp('1700000000000')).milliseconds, 1700000000000);
  assert.equal(value(parseTimestamp('-1700000000')).milliseconds, -1700000000000);
  for (const text of ['0', '-1', '17000000000', '170000000000']) fails(parseTimestamp(text), 'unit');
  assert.equal(value(parseTimestamp('0', 'seconds')).milliseconds, 0);
  assert.equal(timestampRows(-1, 0, 'en')[0], '-1');
  assert.equal(timestampRows(-1, 0, 'en')[4], '1969-12-31T23:59:59.999Z');
  fails(parseTimestamp('9007199254740993', 'milliseconds'), 'number');
  fails(parseTimestamp('8640000000000001', 'milliseconds'), 'number');
  assert.equal(value(parseTimestamp('8640000000000000', 'milliseconds')).milliseconds, 8.64e15);
  assert.ok(timestampRows(8.64e15, 0, 'en')[2].includes('UTC+08:00'));
  for (const input of ['1.5', '1e3', 'Infinity', 'NaN']) assert.equal(parseTimestamp(input).ok, false);
  fails(parseTimestamp('x'.repeat(257)), 'limit');
});
test('date parsing never infers host timezone or normalizes invalid dates', () => {
  assert.equal(timestampRows(value(parseTimestamp('2026-10-14 20:24:00')).milliseconds, 0, 'en')[4], '2026-10-14T12:24:00.000Z');
  assert.equal(timestampRows(value(parseTimestamp('2026-10-14 20:24:00', 'auto', 'UTC')).milliseconds, 0, 'en')[4], '2026-10-14T20:24:00.000Z');
  assert.equal(value(parseTimestamp('2026-10-14T20:24:00.123+08:00')).milliseconds, Date.parse('2026-10-14T12:24:00.123Z'));
  assert.equal(value(parseTimestamp('2024-02-29 12:00:00')).interpretation, 'UTC+08:00');
  assert.equal(new Date(value(parseTimestamp('0001-01-01 00:00:00', 'auto', 'UTC')).milliseconds).getUTCFullYear(), 1);
  for (const input of ['2026-02-30 12:00:00', '2026-02-29 12:00:00', '2026-10-14T12:00:00', '2026/10/14', '2026-10-14', '2026-10-14 24:00:00', '2026-10-14T12:00:60Z', '2026-10-14T12:00:00+24:00']) fails(parseTimestamp(input), 'date');
});
test('JSON format/compact preserve numeric lexemes, duplicate keys and string whitespace', () => {
  const input = '{"id":9007199254740993,"a":1,"a":2,"n":1e+03,"s":" a b "}';
  const formatted = value(transformJson(input, 'format'));
  assert.ok(formatted.includes('\n  "id": 9007199254740993'));
  assert.equal(value(transformJson(formatted, 'compact')), input);
  for (const text of ['[]', '"x"', 'false', 'null', '2.0', '1e999']) assert.equal(value(transformJson(text, 'validate')), text);
  assert.equal(value(transformJson(' [ true , null ] \r\n', 'compact')), '[true,null]');
});
test('JSON strict diagnostics, CRLF/Unicode locations, limits and one-layer unescape', () => {
  const broken = '{\r\n  "👋": 1,\r\n  "a": }';
  const error = transformJson(broken, 'validate').error;
  assert.equal(error.line, 3); assert.equal(error.column, 8);
  for (const text of ['{"a":1,}', '// comment\n{}', '[1,]', '']) fails(transformJson(text, 'validate'), 'json');
  const input = '{"path":"C:\\temp","id":9007199254740993}';
  assert.equal(value(transformJson(JSON.stringify(input), 'unwrap')), input);
  fails(transformJson(input, 'unwrap'), 'unwrap');
  fails(transformJson('"hello"', 'unwrap'), 'unwrap');
  const twice = JSON.stringify(JSON.stringify(input));
  assert.equal(value(transformJson(twice, 'unwrap')), JSON.stringify(input));
  fails(transformJson(' '.repeat(limits.text + 1), 'format'), 'limit');
  fails(transformJson('['.repeat(129) + '0' + ']'.repeat(129), 'validate'), 'depth');
  assert.equal(transformJson('['.repeat(128) + '0' + ']'.repeat(128), 'validate').ok, true);
});
test('Base64 Unicode/byte round trips and strict failures', () => {
  for (const input of ['', '你好，Zero 👋', '\ufeffHello', '<script>alert(1)</script>']) assert.equal(value(transformText(value(transformText(input, 'base64-encode')), 'base64-decode')), input);
  assert.equal(value(transformText(' Y Q \n', 'base64-decode')), 'a');
  for (const text of ['A', '=aaa', 'abcd=', 'YQ=', 'YR==', 'a-b_', '%%']) fails(decodeBytes(text), 'base64');
  fails(transformText('/w==', 'base64-decode'), 'utf8');
  fails(transformText('a'.repeat(limits.text + 1), 'base64-encode'), 'limit');
  fails(decodeBytes('YWFh', 2), 'limit');
});
test('URL component semantics preserve plus and reject malformed UTF-8', () => {
  const input = 'a+b &中';
  assert.equal(value(transformText(value(transformText(input, 'url-encode')), 'url-decode')), input);
  assert.equal(value(transformText('a+b', 'url-decode')), 'a+b');
  for (const text of ['%ZZ', '%E4%B8', '%']) fails(transformText(text, 'url-decode'), 'url');
  fails(transformText('\ud800', 'url-encode'), 'utf8');
});
test('image types, byte identity, declared MIME, pixels and encoded limits', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const bytes = new Uint8Array(await sharp({ create: { width: 2, height: 3, channels: 3, background: '#08717d' } }).toFormat(format).toBuffer());
    const image = value(transformImage(bytes, `image/${format}`));
    assert.equal(image.width, 2); assert.equal(image.height, 3);
    assert.deepEqual(value(transformImage(image.text)).bytes, bytes);
    assert.deepEqual(value(transformImage(encodeBytes(bytes))).bytes, bytes);
    fails(transformImage(bytes, format === 'png' ? 'image/jpeg' : 'image/png'), 'image');
  }
  const png = new Uint8Array(await sharp({ create: { width: 2, height: 3, channels: 3, background: 'white' } }).png().toBuffer());
  const overPixels = png.slice(); new DataView(overPixels.buffer).setUint32(16, 16_000_001);
  fails(inspectImage(overPixels), 'limit');
  fails(transformImage(new Uint8Array(limits.image + 1)), 'limit');
  fails(transformImage('x'.repeat(limits.encodedImage + 1)), 'limit');
  for (const input of ['data:image/svg+xml;base64,PHN2Zy8+', 'https://example.com/private.png', 'data:image/jpeg;base64,' + encodeBytes(png), 'AAAA']) assert.equal(transformImage(input).ok, false);
});
class FakeWorker {
  onmessage = null; onerror = null; terminated = false; job = null;
  postMessage(job) { this.job = job; }
  terminate() { this.terminated = true; }
  finish(result = { ok: true, value: { text: 'done' } }, id = this.job.requestId) { this.onmessage?.({ data: { requestId: id, result } }); }
}
test('worker cancellation, timeout, failures and stale replies', async () => {
  const ports = [];
  const runner = new JobRunner(() => { const port = new FakeWorker(); ports.push(port); return port; }, 30);
  const first = runner.run({ operation: 'format', input: '{}' });
  const second = runner.run({ operation: 'compact', input: '{}' });
  fails(await first, 'cancelled'); assert.equal(ports[0].terminated, true);
  ports[0].finish(); ports[1].finish(undefined, -1); ports[1].finish();
  assert.equal(value(await second).text, 'done');
  fails(await runner.run({ operation: 'format', input: '{}' }), 'timeout');
  assert.equal(ports[2].terminated, true);
  const third = runner.run({ operation: 'format', input: '{}' });
  ports[3].onerror({ preventDefault() {} }); fails(await third, 'worker');
  fails(await new JobRunner(() => { throw Error(); }).run({ operation: 'format', input: '{}' }), 'worker');
  assert.equal(value(execute({ requestId: 1, operation: 'compact', input: ' [ 1 ] ' })).text, '[1]');
});
