import assert from 'node:assert/strict';
import test from 'node:test';
await import('pdfjs-dist/legacy/build/pdf.mjs');
const {OPS}=await import('pdfjs-dist');
const {extractPdfDrawing}=await import('/private/tmp/zero-tests/plugins/file/engine/pdfDrawing.js');
const identity=[1,0,0,-1,0,800];
test('unaccounted shading and clipping reject before body can be reported complete',()=>{
 for(const op of [OPS.shadingFill,OPS.clip,OPS.eoClip,OPS.paintSolidColorImageMask,OPS.beginAnnotation]){
  assert.throws(()=>extractPdfDrawing([op],[[]],identity),/unsupportedInput/);
 }
});

test('image-only rectangular clipping intersects placements and restores the prior clip',()=>{
 const path=[OPS.endPath,[new Float32Array([0,10,20,1,110,20,1,110,220,1,10,220,4])],new Float32Array([10,20,110,220])];
 const ops=[OPS.save,OPS.clip,OPS.constructPath,OPS.transform,OPS.paintImageXObject,OPS.restore,OPS.transform,OPS.paintImageXObject];
 const args=[[],[],path,[200,0,0,300,0,0],['first',200,300],[],[200,0,0,300,0,0],['second',200,300]];
 const drawing=extractPdfDrawing(ops,args,identity,true);
 assert.deepEqual(drawing.images.map(image=>image.bounds),[{x:10,y:580,width:100,height:200},{x:0,y:500,width:200,height:300}]);
 assert.throws(()=>extractPdfDrawing(ops,args,identity),/unsupportedInput/);
 assert.throws(()=>extractPdfDrawing([OPS.clip,OPS.constructPath],[[],[OPS.endPath,[[0,0,0,1,100,0,1,50,100,4]],[0,0,100,100]]],identity,true),/unsupportedInput/);
 assert.throws(()=>extractPdfDrawing([OPS.eoClip],[[]],identity,true),/unsupportedInput/);
});
