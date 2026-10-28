import assert from 'node:assert/strict';
import test from 'node:test';
import { createCaffeineRefresh } from '/private/tmp/zero-tests/plugins/caffeine/caffeineState.js';
const snapshot = (enabled) => ({enabled, started_at_ms:null, duration_minutes:null, expires_at_ms:null, message:'', action_error:null});
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; };

test('new native state wins over an older panel read', async () => {
  const first = deferred(); const second = deferred(); const accepted=[];
  const reads=[first,second];
  const reader=createCaffeineRefresh(() => reads.shift().promise, value => accepted.push(value));
  const old=reader.refresh(); const next=reader.refresh();
  second.resolve(snapshot(true)); assert.equal(await next,true);
  first.resolve(snapshot(false)); assert.equal(await old,false);
  assert.deepEqual(accepted,[snapshot(true)]);
});
test('hiding the surface invalidates pending snapshots and errors', async () => {
  const request=deferred(); const accepted=[];
  const reader=createCaffeineRefresh(() => request.promise, value => accepted.push(value));
  const pending=reader.refresh(); reader.invalidate(); request.reject(new Error('late failure'));
  assert.equal(await pending,false); assert.deepEqual(accepted,[]);
});
test('current failure propagates and the next reveal can recover', async () => {
  const reads=[Promise.reject(new Error('offline')),Promise.resolve(snapshot(false))]; const accepted=[];
  const reader=createCaffeineRefresh(() => reads.shift(), value => accepted.push(value));
  await assert.rejects(reader.refresh(),/offline/);
  assert.equal(await reader.refresh(),true); assert.deepEqual(accepted,[snapshot(false)]);
});
test('policy save reports native stop failure separately from successful persistence',async()=>{
  const {policySaveFeedback}=await import('/private/tmp/zero-tests/plugins/caffeine/caffeineState.js');
  assert.equal(policySaveFeedback({session:{enabled:true,action_error:{action:'disable',code:'operation_failed'}}}),'stop_failed');
  assert.equal(policySaveFeedback({session:{enabled:false,action_error:null}}),'saved');
});
