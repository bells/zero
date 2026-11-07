import assert from 'node:assert/strict';
import test from 'node:test';
import { styleScanText, reconstructScanPage } from '/private/tmp/zero-tests/plugins/file/engine/pdfScanLayout.js';
const sample=(text,x,y,width,height=16)=>({text,x,y,width,height,rotationDegrees:0});

test('scan typography uses long CJK advances without changing recognition geometry or text',()=>{
 const input=[sample('合成文档可编辑正文',40,60,120,15),sample('合成文档可编辑正文',40,80,120,18),sample('合成文档可编辑正文',40,100,120,16),sample('标题',200,30,80,40)];
 const styled=styleScanText(input,{width:600,height:800},600,800);
 assert.deepEqual(styled.slice(0,3).map(t=>t.fontSize),[120/9,120/9,120/9]);
 assert.ok(styled[3].fontSize>30);
 for(let i=0;i<input.length;i++)for(const key of ['text','x','y','width','height'])assert.equal(styled[i][key],input[i][key]);
 assert.ok(input.every(t=>t.fontSize===undefined));
});

test('scan color sampling distinguishes light and dark text on a colored heading',()=>{
 for(const ink of [30,230]){
  const pixels=new Uint8ClampedArray(120*20*4);
  for(let i=0;i<120*20;i++)pixels.set(i%12===0?[ink,ink,ink,255]:[96,133,114,255],i*4);
  const [styled]=styleScanText([sample('Synthetic label',0,20,120,20)],{width:120,height:20,pixels},120,20);
  assert.equal(styled.background,'608572');assert.equal(styled.color,ink===30?'000000':'FFFFFF');
 }
});

test('scan local columns retain separate fields, reading order, all source IDs and original sizes',()=>{
 const text=[sample('Field one',40,100,120),sample('Field two',40,120,120),sample('Field three',260,105,170),sample('Field four',260,125,170)]
  .map(t=>({...t,fontSize:12,color:'000000'}));
 const page=reconstructScanPage({width:600,height:800,text,lines:[],figures:[{id:'portrait',bounds:{x:470,y:80,width:80,height:110},nonEditable:false}]});
 assert.equal(page.blocks.length,1);const block=page.blocks[0];assert.equal(block.kind,'columns');assert.equal(block.columns.length,3);
 assert.deepEqual(block.columns.map(c=>c.blocks.map(b=>b.kind)),[['paragraph','paragraph'],['paragraph','paragraph'],['figure']]);
 assert.deepEqual(block.columns.flatMap(c=>c.blocks.flatMap(b=>b.sourceIds)),['text-0','text-1','text-2','text-3']);
 assert.equal(block.columns.at(-1).blocks[0].bounds.height,110);
});

test('scan text in vertically separated areas does not acquire a false parallel column',()=>{
 const text=[sample('Upper left one',40,100,140),sample('Upper left two',40,120,140),sample('Lower right one',320,300,150),sample('Lower right two',320,320,150)]
  .map(t=>({...t,fontSize:12,color:'000000'}));
 const page=reconstructScanPage({width:600,height:800,text,lines:[],figures:[]});
 assert.ok(page.blocks.every(b=>b.kind==='paragraph'));
 assert.deepEqual(page.blocks.flatMap(b=>b.sourceIds),['text-0','text-1','text-2','text-3']);
});
