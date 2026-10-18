import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageWorkerSession } from '../src/scripts/web-tools/image-worker-session.ts';
import { safeOriginalImageName, previewLongEdge } from '../src/scripts/web-tools/image-ui-policy.ts';
const request=(id=1,timeoutMs=1000)=>({kind:'process',jobId:id,batchRevision:2,itemId:'a',bytes:new ArrayBuffer(2),policy:{timeoutMs},settings:{}});
function fake(){return {onmessage:null,onerror:null,terminated:0,posted:[],postMessage(...args){this.posted.push(args);},terminate(){this.terminated++;}};}
const result=(id=1)=>({kind:'result',jobId:id,batchRevision:2,itemId:'a',output:{format:'png',mime:'image/png',width:1,height:1,byteLength:1,bytes:new ArrayBuffer(1)}});
test('cancel and replacement suppress delayed messages and transfer the owned buffer',()=>{
 const workers=[];const session=new ImageWorkerSession(()=>{const w=fake();workers.push(w);return w;});const messages=[],errors=[];const first=request();session.start(first,m=>messages.push(m),e=>errors.push(e));const old=workers[0];assert.equal(old.posted[0][1][0],first.bytes);session.cancel();old.onmessage({data:result()});assert.equal(messages.length,0);assert.equal(old.terminated,1);
 session.start(request(2),m=>messages.push(m),e=>errors.push(e));old.onmessage({data:result()});workers[1].onmessage({data:result(1)});assert.equal(messages.length,0);workers[1].onmessage({data:result(2)});assert.equal(messages.length,1);assert.equal(workers[1].terminated,1);assert.deepEqual(errors,[]);
});
test('timeout terminates and cannot accept late successful bytes',async()=>{
 const worker=fake(),messages=[],errors=[];const session=new ImageWorkerSession(()=>worker);session.start(request(1,5),m=>messages.push(m),e=>errors.push(e));await new Promise(r=>setTimeout(r,20));assert.deepEqual(errors,['timeout']);assert.equal(worker.terminated,1);worker.onmessage({data:result()});assert.deepEqual(messages,[]);
});
test('malformed messages and startup failures produce bounded worker errors',()=>{
 const worker=fake(),errors=[];const session=new ImageWorkerSession(()=>worker);session.start(request(),()=>assert.fail(),e=>errors.push(e));worker.onmessage({data:{secret:'untrusted'}});assert.deepEqual(errors,['worker']);assert.equal(worker.terminated,1);
 const throwing=new ImageWorkerSession(()=>{throw Error('private diagnostic');});throwing.start(request(),()=>assert.fail(),e=>errors.push(e));assert.deepEqual(errors,['worker','worker']);
});
test('preview edge respects a bounded selected thumbnail, optional resize and no upscaling',()=>{
 assert.equal(previewLongEdge(100,50,400000,null),100);assert.equal(previewLongEdge(4000,3000,400000,100),100);const edge=previewLongEdge(4000,3000,400000,null);assert.ok(edge*Math.round(edge*3/4)<=400000);assert.ok(edge<4000);
});
test('original download basename removes paths, unsafe characters and reserved device names',()=>{
 assert.equal(safeOriginalImageName('../../CON.jpg'),'_CON.jpg');assert.equal(safeOriginalImageName('folder\\photo\x00.jpg'),'photo_.jpg');assert.equal(safeOriginalImageName('...'),'image');assert.equal(safeOriginalImageName('照片.png'),'照片.png');
});
test('rapid preview replacements terminate each decoder before creating its successor',()=>{
 const workers=[],received=[];
 const session=new ImageWorkerSession(()=>{assert.ok(workers.every(worker=>worker.terminated===1),'No previous decoder may remain active');const worker=fake();workers.push(worker);return worker;});
 for(let id=1;id<=4;id++)session.start(request(id),message=>received.push(message),()=>assert.fail());
 for(let index=0;index<3;index++)workers[index].onmessage({data:result(index+1)});
 assert.equal(received.length,0);workers[3].onmessage({data:result(4)});assert.equal(received.length,1);assert.ok(workers.every(worker=>worker.terminated===1));
});
