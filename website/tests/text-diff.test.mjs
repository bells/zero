import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/lib/web-tools/text-diff.ts';
const value = (result) => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
test('normalizes only line separators while preserving whitespace and final newline', () => {
  assert.equal(value(domain.compareText('alpha\r\nbeta\r\n', 'alpha\nbeta\n')).identical, true);
  assert.equal(value(domain.compareText('alpha\rbeta', 'alpha\nbeta')).identical, true);
  const final = value(domain.compareText('alpha\n', 'alpha'));
  assert.equal(final.finalNewlineChanged, true);
  assert.deepEqual([final.deleted, final.added, final.blocks.length], [1, 1, 1]);
  assert.equal(value(domain.compareText('alpha ', 'alpha')).identical, false);
  assert.equal(value(domain.compareText('é', 'e\u0301')).identical, false);
});
test('empty inputs have directional additions and correct logical line numbers', () => {
  assert.equal(value(domain.compareText('', '')).identical, true);
  const added = value(domain.compareText('', 'alpha\n'));
  assert.deepEqual(added.rows.map(({kind,beforeLine,afterLine,text}) => ({kind,beforeLine,afterLine,text})), [{kind:'added',beforeLine:null,afterLine:1,text:'alpha'}]);
  assert.deepEqual([added.added, added.deleted], [1,0]);
  const removed = value(domain.compareText('alpha\n', ''));
  assert.deepEqual([removed.added, removed.deleted], [0,1]);
});
test('sequential inline pairing preserves emoji code points and source text', () => {
  const result = value(domain.compareText('same\nhello 👋 world\n<script>x</script>', 'same\nhello 👋 Zero\n<script>x</script>'));
  assert.equal(result.blocks.length, 1);
  assert.deepEqual(result.rows.map(r => [r.kind,r.beforeLine,r.afterLine]), [['equal',1,1],['deleted',2,null],['added',null,2],['equal',3,3]]);
  for (const row of result.rows) {
    assert.equal(row.segments.map(s => s.text).join(''), row.text);
    for (const segment of row.segments) assert.equal(segment.text.isWellFormed(), true);
  }
  assert.ok(result.rows[1].segments.some(s => s.changed && s.text.includes('w')));
});
test('enforces source byte/line/NUL limits before comparison', () => {
  for (const [before,after,code] of [['a'.repeat(1048577),'','limit'],['中'.repeat(349526),'','limit'],['a\n'.repeat(20001),'','limit'],['a\0b','','text-file']]) {
    const result = domain.compareText(before,after); assert.equal(result.ok,false); assert.equal(result.error.code,code);
  }
  assert.equal(domain.validateDiffSource('a\n'.repeat(20000)).ok,true);
});
test('inline limits retain complete line result', () => {
  const long = value(domain.compareText('👋'.repeat(4097), 'x'));
  assert.equal(long.partialInline,true);
  assert.equal(long.rows[0].text,'👋'.repeat(4097));
  const before = Array.from({length:14},(_,i) => `${i}:`+'a'.repeat(4000)).join('\n');
  const after = Array.from({length:14},(_,i) => `${i}:`+'b'.repeat(4000)).join('\n');
  assert.equal(value(domain.compareText(before,after)).partialInline,true);
});
