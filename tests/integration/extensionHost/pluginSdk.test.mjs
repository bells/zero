import assert from 'node:assert/strict';
import test from 'node:test';
import { createZeroBridge, registerPlugin } from '/private/tmp/zero-tests/sdk/index.js';
const session = {sessionId:'test-session',generation:1,pluginId:'test.notes',pluginVersion:'1.0.0',apiVersion:'1.0.0',surfaceId:'test.notes.main',registryRevision:0};
function transport(request) {return {session,ready:async()=>session,request,cancel:async()=>{}};}
test('SDK plain registration activates once, cleans every subscription and reports explicit results', async()=>{
 let activate=0,dispose=0,deactivate=0;
 const registration=registerPlugin({activate(context){activate++;context.subscriptions.push({dispose(){dispose++;throw Error('cleanup');}},{dispose(){dispose++;}});},deactivate(){deactivate++;}},transport(async r=>({requestId:r.requestId,ok:true,value:null})));
 const result=await registration.ready;assert.equal(result.ok,true);assert.equal(activate,1);
 assert.deepEqual(await result.value.bridge.request('storage.set',{key:'notes',value:'hello'}),{ok:true,value:null});
 registration.dispose();registration.dispose();await Promise.resolve();
 assert.equal(dispose,2);assert.equal(deactivate,1);assert.equal(result.value.signal.aborted,true);
 assert.equal((await result.value.bridge.request('storage.get',{key:'notes'})).error.code,'request.cancelled');
});
test('SDK cancellation reaches host and late results cannot settle twice',async()=>{
 let finish,cancel=0;const conn=transport(r=>new Promise(resolve=>{finish=()=>resolve({requestId:r.requestId,ok:true,value:'late'});}));conn.cancel=async()=>{cancel++;};
 const lifetime=new AbortController(),requestAbort=new AbortController();
 const pending=createZeroBridge(conn,lifetime.signal).request('storage.get',{key:'notes'},{signal:requestAbort.signal});
 await Promise.resolve();requestAbort.abort();assert.equal((await pending).error.code,'request.cancelled');finish();await Promise.resolve();assert.equal(cancel,1);
});
test('SDK rejects pre-cancelled work and lifetime disposal cancels pending host calls',async()=>{
 let calls=0,cancel=0,finish;
 const conn=transport(r=>{calls++;return new Promise(resolve=>{finish=()=>resolve({requestId:r.requestId,ok:true,value:'late'});});});
 conn.cancel=async()=>{cancel++;};
 const lifetime=new AbortController(),aborted=new AbortController();aborted.abort();
 const bridge=createZeroBridge(conn,lifetime.signal);
 assert.equal((await bridge.request('storage.get',{key:'note'},{signal:aborted.signal})).error.code,'request.cancelled');
 assert.equal(calls,0);assert.equal(cancel,0);
 const pending=bridge.request('storage.get',{key:'note'});await Promise.resolve();
 lifetime.abort();assert.equal((await pending).error.code,'request.cancelled');
 finish();await Promise.resolve();assert.equal(cancel,1);
 assert.equal((await bridge.request('storage.get',{key:'note'})).error.code,'request.cancelled');assert.equal(calls,1);
});
test('SDK deadline cancels the native request and discards its late reply',async context=>{
 context.mock.timers.enable({apis:['setTimeout']});
 let cancel=0,finish;
 const conn=transport(r=>new Promise(resolve=>{finish=()=>resolve({requestId:r.requestId,ok:true,value:'late'});}));
 conn.cancel=async()=>{cancel++;};
 const pending=createZeroBridge(conn,new AbortController().signal).request('storage.get',{key:'note'});
 await Promise.resolve();context.mock.timers.tick(10_000);
 assert.equal((await pending).error.code,'request.timeout');assert.equal(cancel,1);
 finish();await Promise.resolve();assert.equal(cancel,1);
});
test('SDK rejects mismatched replies, failed activation and unsupported command registration',async()=>{
 const lifetime=new AbortController();
 const malformed=createZeroBridge(transport(async()=>({requestId:'wrong',ok:true,value:null})),lifetime.signal);
 assert.equal((await malformed.request('storage.set',{key:'x',value:1})).error.code,'transport.invalid');
 const registration=registerPlugin({activate(){throw Error('failure');}},transport(async()=>{}));
 assert.equal((await registration.ready).error.code,'activation.failed');
 const command=registerPlugin({activate(){throw Error('must not run');},commands:{'test.notes.undeclared':async()=>({ok:true,value:null})}},transport(async()=>{}));
 assert.equal((await command.ready).error.code,'api.unavailable');
});
test('optional React adapter exposes the same context and requires an explicit provider',async()=>{
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {ZeroPluginProvider,useZeroPlugin}=await import('/private/tmp/zero-tests/sdk/react.js');
 const context={session,signal:new AbortController().signal,subscriptions:[],bridge:{}};
 function Consumer(){return createElement('span',null,useZeroPlugin().session.pluginId);}
 assert.equal(renderToStaticMarkup(createElement(ZeroPluginProvider,{value:context},createElement(Consumer))),'<span>test.notes</span>');
 assert.throws(()=>renderToStaticMarkup(createElement(Consumer)),/ZeroPluginProvider/);
});
test('registry refresh coalesces overlap and never applies older snapshots',async()=>{
 const {createRegistryRefresh}=await import('/private/tmp/zero-tests/core/pluginHost/registryRefresh.js');
 const pending=[],applied=[];
 const refresh=createRegistryRefresh(()=>new Promise(resolve=>pending.push(resolve)),s=>applied.push(s.revision));
 const first=refresh.refresh(); const second=refresh.refresh(3);
 assert.equal(pending.length,1);pending.shift()({revision:2,records:[]});await Promise.resolve();
 assert.equal(pending.length,1);pending.shift()({revision:3,records:[]});await Promise.all([first,second]);
 assert.deepEqual(applied,[2,3]);await refresh.refresh(2);assert.equal(pending.length,0);
 const stale=refresh.refresh();pending.shift()({revision:1,records:[]});await stale;
 assert.deepEqual(applied,[2,3]);refresh.dispose();await refresh.refresh();assert.equal(pending.length,0);
});
