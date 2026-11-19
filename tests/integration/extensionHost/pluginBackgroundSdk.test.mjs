import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('background SDK awaits native context, completes failures honestly, and disposes subscriptions', async()=> {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zero-bg-sdk-'));
 try {
  execFileSync(process.execPath,['scripts/build-plugin-sdk.mjs','--output',root],{stdio:'pipe'});
  fs.mkdirSync(path.join(root,'node_modules'));fs.symlinkSync(path.dirname(require.resolve('semver/package.json')),path.join(root,'node_modules/semver'));
  const sdk=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
  assert.equal(typeof sdk.registerBackground,'function');
  const background={taskId:'daily',eventId:'scheduled.daily',occurrenceId:'ab'.repeat(16),attempt:1,payload:{test:true},scheduleGeneration:3};
  const session={sessionId:'s1',generation:1,pluginId:'test.bg',pluginVersion:'1.0.0',apiVersion:'1.0.0',surfaceId:'background',registryRevision:1,background};
  const requests=[];let releaseReady;let disposed=0;let called=false;
  const readyPromise=new Promise(resolve=>{releaseReady=resolve;});
  const transport={session,ready:()=>readyPromise,cancel:async()=>{},request:async request=>{requests.push(request);return {requestId:request.requestId,ok:true,value:{generation:null}};}};
  const registration=sdk.registerBackground(async(event,context)=>{called=true;assert.deepEqual(event,background);context.subscriptions.push({dispose:()=>disposed++});throw new Error('synthetic');},transport);
  assert.equal(called,false);releaseReady(session);
  const result=await registration.ready;
  assert.equal(result.ok,false);assert.equal(result.error.code,'background.failed');
  assert.deepEqual(requests.map(r=>[r.method,r.payload]),[['background.complete',{outcome:'failed',nextAtMs:null}]]);
  assert.equal(disposed,1);registration.dispose();assert.equal(disposed,1);
  const view=sdk.registerBackground(async()=>assert.fail('view cannot dispatch'),{...transport,session:{...session,background:undefined},ready:async()=>({...session,background:undefined})});
  assert.equal((await view.ready).error.code,'session.kind');
  for(const invalid of [{...background,extra:true},{...background,attempt:0},{...background,payload:'x'.repeat(16384)}]) {
   const malformed={...session,background:invalid};
   const registration=sdk.registerBackground(async()=>assert.fail('invalid context dispatch'),{...transport,session:malformed,ready:async()=>malformed});
   assert.equal((await registration.ready).error.code,'session.kind');
  }
  let successSignal;let successDisposed=0;
  const success=sdk.registerBackground(async(event,context)=>{successSignal=context.signal;context.subscriptions.push({dispose:()=>successDisposed++});return {outcome:'completed',nextAtMs:500};},{...transport,ready:async()=>session});
  assert.equal((await success.ready).ok,true);assert.equal(successSignal.aborted,true);assert.equal(successDisposed,1);
  assert.deepEqual(requests.at(-1).payload,{outcome:'completed',nextAtMs:500});
  let releaseHandler;const pending=new Promise(resolve=>{releaseHandler=resolve;});let began;
  const started=new Promise(resolve=>{began=resolve;});const before=requests.length;
  const stopped=sdk.registerBackground(async()=>{began();await pending;return {outcome:'retry',nextAtMs:500};},{...transport,ready:async()=>session});
  await started;stopped.dispose();releaseHandler();assert.equal((await stopped.ready).error.code,'session.disposed');assert.equal(requests.length,before);

 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
