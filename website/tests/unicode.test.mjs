import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../src/lib/web-tools/execute.ts';
import { limits } from '../src/lib/web-tools/contracts.ts';
import { webTools } from '../src/content/web-tools.ts';
import { isThread, parseCreate } from '../../feedback/shared/contracts.ts';

const run = (input, operation = 'unicode-decode', escapeAscii = false) => execute({ requestId: 1, operation, input, escapeAscii });
const value = (result) => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value.text; };

test('Unicode decodes mixed logs, both escape forms and supplementary boundaries', () => {
  for (const [input, expected] of [
    ['用户：\\u4F60\\u597D，\\uD83D\\uDE00 / \\u{1f600}', '用户：你好，😀 / 😀'],
    ['\\u0041B', 'AB'], ['\\u{0}\\u{10FFFF}', '\0' + String.fromCodePoint(0x10ffff)],
    [' U+4E2D &#x4E2D; %E4%B8%AD \\n \\t \\" \\U00004E2D ', ' U+4E2D &#x4E2D; %E4%B8%AD \\n \\t \\" \\U00004E2D '],
  ]) assert.equal(value(run(input)), expected);
});

test('Unicode respects original backslash parity and never rescans generated text', () => {
  for (const [input, expected] of [
    ['\\\\u4F60', '\\\\u4F60'], ['\\\\\\u4F60', '\\\\你'],
    ['\\\\\\\\u4F60', '\\\\\\\\u4F60'], ['\\u005Cu4F60', '\\u4F60'],
    ['\\\\u12G4', '\\\\u12G4'], ['path\\', 'path\\'],
  ]) assert.equal(value(run(input)), expected);
});

test('Unicode encoding has deterministic uppercase output and reversible ASCII exceptions', () => {
  assert.equal(value(run('你好，Zero 😀', 'unicode-encode')), '\\u4F60\\u597D\\uFF0CZero \\uD83D\\uDE00');
  assert.equal(value(run('A 你', 'unicode-encode', true)), '\\u0041\\u0020\\u4F60');
  assert.equal(value(run('\n\t\\n\u007f', 'unicode-encode')), '\\u000A\\u0009\\u005Cn\\u007F');
  for (const original of ['\\u4F60', '\\\\u4F60', ' e\u0301 é 😀 \r\n\t\0', '\ufefftext', '<script>alert(1)</script>']) {
    for (const ascii of [false, true]) assert.equal(value(run(value(run(original, 'unicode-encode', ascii)))), original);
  }
});

test('Unicode rejects malformed escapes and isolated surrogates with no partial result', () => {
  for (const input of ['\\u12', '\\u12G4', '\\u{}', '\\u{1234567}', '\\u{110000}', '\\u{D800}', '\\uD800', '\\uDC00\\uD800', '\\uD800\\u0041', '\\uD800\\u{DC00}']) {
    const result = run('ok ' + input);
    assert.equal(result.ok, false, input);
    assert.equal(result.error.code, 'unicode');
    assert.deepEqual([result.error.line, result.error.column], [1, 4]);
    assert.equal('value' in result, false);
  }
  for (const operation of ['unicode-encode', 'unicode-decode']) {
    for (const input of ['\ud800', '\udc00', '😀\ud800']) assert.equal(run(input, operation).ok, false);
  }
});

test('Unicode first-error positions count original UTF-16 columns and CRLF lines', () => {
  for (const [input, line, column] of [
    ['😀\\u12G4', 1, 3], ['😀\r\na\\u12G4', 2, 2],
    ['a\rb\\u12', 2, 2], ['a\nb\\u{}', 2, 2], ['\\u0041\\u12', 1, 7],
    ['\\u12 \ud800', 1, 1],
  ]) {
    const result = run(input);
    assert.equal(result.ok, false);
    assert.deepEqual([result.error.line, result.error.column], [line, column]);
  }
});

test('Unicode checks UTF-8 input bytes, preserves whitespace and does not truncate expanded encoding', () => {
  assert.equal(run('').error?.code, 'empty');
  assert.equal(value(run(' \n\t ')), ' \n\t ');
  assert.equal(run('中'.repeat(Math.floor(limits.text / 3) + 1)).error?.code, 'limit');
  assert.equal(run('a'.repeat(limits.text + 1)).error?.code, 'limit');
  const encoded = value(run('a'.repeat(limits.text), 'unicode-encode', true));
  assert.equal(encoded.length, limits.text * 6);
  assert.equal(encoded.slice(-6), '\\u0061');
  assert.equal(run(encoded).error?.code, 'limit');
});

test('Unicode bilingual guidance matches conversion and feedback admits only its stable identity', () => {
  for (const locale of ['zh', 'en']) {
    const tool = webTools[locale].find(tool => tool.slug === 'unicode');
    assert.ok(tool, 'Unicode is discoverable');
    assert.equal(tool.category, 'development');
    for (const [index, example] of tool.guide.examples.entries()) {
      assert.equal(value(run(example.input, index === 1 ? 'unicode-encode' : 'unicode-decode')), example.output);
    }
  }
  assert.equal(isThread('tools/unicode'), true);
  for (const id of ['en/tools/unicode', 'tools/unicode?source=private']) assert.equal(isThread(id), false);
  const request = { threadId: 'tools/unicode', content: 'synthetic', idempotencyKey: 'synthetic-attempt-00001' };
  assert.ok(parseCreate(request));
  for (const field of ['source', 'output', 'escapeAscii']) assert.equal(parseCreate({ ...request, [field]: 'private' }), null);
});
