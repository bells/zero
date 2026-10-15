import test from 'node:test';
import assert from 'node:assert/strict';
import { compareText } from '../src/lib/web-tools/text-diff.ts';
import * as render from '../src/lib/web-tools/text-diff-window.ts';
const diff = (a,b) => { const result = compareText(a,b); assert.equal(result.ok,true); return result.value; };
test('folds exactly the equal rows outside three-line context and can inspect omissions', () => {
 const before = Array.from({length:20},(_,i) => `line ${i+1}`).join('\n');
 const result=diff(before,before.replace('line 11','changed'));
 const window=render.diffWindow(result,{row:0,offset:0});
 assert.deepEqual(window.items.filter(i=>i.type==='fold').map(i=>[i.row,i.count]),[[0,7],[15,6]]);
 assert.deepEqual(window.items.filter(i=>i.type==='line').map(i=>i.beforeLine).filter(Boolean),[8,9,10,11,12,13,14]);
 const inspected=render.diffWindow(result,{row:0,offset:0},true);
 assert.equal(inspected.items.filter(i=>i.type==='line').length,21);
});
test('mounted windows bound both-side rows and bytes while preserving every long-line code point', () => {
 const text='👋'.repeat(200000);
 const result=diff(text,'changed');
 let cursor={row:0,offset:0}, recovered='', pages=0;
 while(cursor) {
   const window=render.diffWindow(result,cursor,true);
   assert.ok(window.textRows<=400); assert.ok(window.sourceBytes<=204800);
   recovered+=window.items.filter(i=>i.type==='line'&&i.kind==='deleted').map(i=>i.text).join('');
   for(const line of window.items.filter(i=>i.type==='line')) assert.equal(line.text.isWellFormed(),true);
   cursor=window.next; pages++; assert.ok(pages<20);
 }
 assert.equal(recovered,text); assert.ok(pages>1);
 const many=diff('x\n'.repeat(1000),'x\n'.repeat(1000));
 const window=render.diffWindow(many,{row:0,offset:0},true);
 assert.equal(window.textRows,400); assert.equal(window.next.row,200);
});
test('prioritizes initial and navigated difference targets over oversized context without losing context access', () => {
  const long = 'x'.repeat(300000);
  const original = ['first','one','two','three','four',long,'six','seven','second'].join('\n');
  const changed = original.replace('first','FIRST').replace('second','SECOND');
  const result = diff(original,changed);
  assert.equal(result.blocks.length,2);
  const target = result.blocks[1].start;
  const requested = {row:target-3,offset:0};
  const focused = render.diffWindow(result,requested,false,target);
  assert.ok(focused.items.some(item=>item.type==='line'&&item.row===target),'Next difference must mount the target block');
  assert.ok(focused.sourceBytes<=204800); assert.ok(focused.textRows<=400);
  let cursor=requested,recovered='';
  while(cursor && cursor.row<target) {
    const section=render.diffWindow(result,cursor);
    recovered+=section.items.filter(item=>item.type==='line'&&item.row===target-3).map(item=>item.text).join('');
    cursor=section.next;
  }
  assert.equal(recovered,long,'The skipped context remains fully inspectable');
  const first=diff([long,'one','two','old'].join('\n'),[long,'one','two','new'].join('\n'));
  const initial=render.diffWindow(first,{row:0,offset:0},false,first.blocks[0].start);
  assert.ok(initial.items.some(item=>item.type==='line'&&item.kind!=='equal'),'Initial results must mount the first difference');
  assert.ok(initial.sourceBytes<=204800); assert.ok(initial.textRows<=400);
  const longTarget=diff([long,'one','two',`target-${long}-old`].join('\n'),[long,'one','two',`target-${long}-new`].join('\n'));
  const segmented=render.diffWindow(longTarget,{row:0,offset:0},false,longTarget.blocks[0].start);
  const targetSegment=segmented.items.find(item=>item.type==='line'&&item.kind==='deleted');
  assert.equal(targetSegment.offset,0); assert.ok(targetSegment.text.startsWith('target-'));
  assert.equal(targetSegment.continued,true); assert.ok(segmented.sourceBytes<=204800);
});
