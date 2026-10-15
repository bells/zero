import test from 'node:test';
import assert from 'node:assert/strict';
import * as file from '../src/lib/web-tools/text-diff-file.ts';
const bytes = text => new TextEncoder().encode(text);
test('strict UTF-8 consumes BOM while retaining source whitespace', () => {
  assert.deepEqual(file.decodeDiffFile(bytes('\ufeff hello\r\n')), { ok:true,value:' hello\r\n' });
  for (const input of [new Uint8Array([0xff]),bytes('x\0y'),bytes('%PDF-1.7'),new Uint8Array([0x50,0x4b,3,4]),new Uint8Array([0x89,0x50,0x4e,0x47]),new Uint8Array([0xff,0xd8,0xff])]) {
    const result = file.decodeDiffFile(input); assert.equal(result.ok,false); assert.equal(result.error.code,'text-file');
  }
  assert.deepEqual(file.decodeDiffFile(bytes('{"url":"https://example.test"}')), {ok:true,value:'{"url":"https://example.test"}'});
});
test('rejects byte and logical line overflow without a replacement result', () => {
  assert.equal(file.decodeDiffFile(new Uint8Array(1048577)).error.code,'limit');
  assert.equal(file.decodeDiffFile(bytes('x\n'.repeat(20001))).error.code,'limit');
});
