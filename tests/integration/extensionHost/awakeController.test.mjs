import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'zero-awake-controller-'));
for(const file of ['domain','controller']) {
 const source=(await fs.readFile(`src/plugins/caffeine/package/${file}.ts`,'utf8')).replace('"./domain"','"./domain.mjs"');
 await fs.writeFile(path.join(temp,`${file}.mjs`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2020,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {AwakeController}=await import(pathToFileURL(path.join(temp,'controller.mjs')));
const {defaultPreferences,taskConditions}=await import(pathToFileURL(path.join(temp,'domain.mjs')));
after(()=>fs.rm(temp,{recursive:true,force:true}));
function host() {
 const h={stored:structuredClone(defaultPreferences),task:null,events:[],fail:{},before:null};
 const ok=value=>({ok:true,value}),bad=code=>({ok:false,error:{code,message:code,retryable:true}});
 h.bridge={request:async(method,input)=>{
  h.events.push({method,input:structuredClone(input)});
  if(h.before)await h.before(method,input);
  if(h.fail[method]){h.fail[method]--;return bad('injected.failure');}
  if(method==='storage.get')return ok(structuredClone(h.stored));
  if(method==='storage.set'){h.stored=structuredClone(input.value);return ok(null);}
  if(method==='storage.compareAndSet'){const swapped=JSON.stringify(h.stored)===JSON.stringify(input.expectedValue);if(swapped)h.stored=structuredClone(input.value);return ok({swapped,currentValue:structuredClone(h.stored)});}
  if(method==='power.taskStatus')return ok(structuredClone(h.task));
  if(method==='power.readSnapshot')return ok({source:'external',battery:'supported',battery_percent:100,low_power_mode_capability:'supported',low_power_mode:false});
  if(method==='power.startTask'){
   if((h.task?.active?h.task.generation:null)!==input.expectedGeneration)return bad('power.taskConflict');
   if('expectedConditionsRevision' in input&&(h.task?.active?h.task.conditionsRevision:null)!==input.expectedConditionsRevision)return bad('power.taskConflict');
   h.task={generation:(h.task?.generation??0)+1,conditionsRevision:1,active:true,schedule:input.schedule,conditions:input.conditions,startedAtMs:0,expiresAtMs:null,elapsedMs:0,remainingMs:null,batteryThresholdOverridden:false,protectionUnavailable:false,lastStopReason:null};return ok(structuredClone(h.task));
  }
  if(method==='power.updateTaskConditions'){
   if(h.task.generation!==input.generation||('expectedConditionsRevision' in input&&h.task.conditionsRevision!==input.expectedConditionsRevision))return bad('power.taskConflict');
   h.task.conditions=structuredClone(input.conditions);h.task.conditionsRevision++;return ok(structuredClone(h.task));
  }
  if(method==='power.stopTask'){h.task=null;return ok(null);}
  throw new Error(method);
 }};return h;
}
test('failed or invalid saved config blocks starts and writes until validated recovery',async()=>{
 for(const invalid of [false,true]) {
  const h=host();h.stored.battery_policy.stop_on_low_battery=true;
  if(invalid)h.stored={broken:true};else h.fail['storage.get']=1;
  const controller=new AwakeController(h.bridge);await controller.refresh();
  assert.equal(controller.state.ready,false);
  await controller.start({kind:'unlimited'},false,null);await controller.savePolicy({stop_on_low_power_mode:true});
  assert(!h.events.some(e=>['power.startTask','storage.set','storage.compareAndSet'].includes(e.method)));
  h.stored=structuredClone(defaultPreferences);h.stored.battery_policy.stop_on_low_battery=true;
  await controller.refresh();assert.equal(controller.state.ready,true);assert.equal(controller.state.error,null);
  await controller.start({kind:'unlimited'},false,null);assert.equal(h.task.conditions.batteryThresholdPercent,10);
 }
});
test('complete initialization retries after transient power failure and restores controls',async()=>{
 const h=host();h.fail['power.readSnapshot']=1;const c=new AwakeController(h.bridge);
 await c.refresh();assert.equal(c.state.ready,false);
 await c.refresh();assert.equal(c.state.ready,true);assert.equal(c.state.error,null);
 await c.start({kind:'unlimited'},false,null);assert.equal(h.task.active,true);
});
test('two views merge only edited fields and start using current saved protection',async()=>{
 const h=host(),main=new AwakeController(h.bridge),tray=new AwakeController(h.bridge);
 await Promise.all([main.refresh(),tray.refresh()]);
 await main.savePolicy({stop_on_low_battery:true});
 await tray.start({kind:'duration',minutes:30},false,{mode:'duration',duration_minutes:30,hour:18,minute:0});
 assert.equal(h.task.conditions.batteryThresholdPercent,10);assert.equal(h.stored.battery_policy.stop_on_low_battery,true);
 await main.savePolicy({stop_on_low_power_mode:true});
 assert.equal(h.stored.custom_input.duration_minutes,30);
 assert.equal(h.stored.battery_policy.stop_on_low_battery,true);
 // Simultaneous single-field mutations must preserve both edits after CAS conflict/retry.
 await Promise.all([main.savePolicy({threshold_percent:25}),tray.savePolicy({stop_on_low_power_mode:false})]);
 assert.equal(h.stored.battery_policy.threshold_percent,25);assert.equal(h.stored.battery_policy.stop_on_low_power_mode,false);
});
test('saved but unapplied protection stays explicitly pending and recovers with bounded retry',async()=>{
 const h=host(),c=new AwakeController(h.bridge);await c.refresh();await c.start({kind:'unlimited'},false,null);
 h.fail['power.updateTaskConditions']=10;
 await c.savePolicy({stop_on_low_battery:true});
 assert.equal(h.stored.battery_policy.stop_on_low_battery,true);assert.equal(h.task.conditions.batteryThresholdPercent,null);
 assert.equal(c.state.policyPending,true);assert.equal(c.state.error,'policy_pending');
 assert(h.events.filter(e=>e.method==='power.updateTaskConditions').length<=3);
 h.fail['power.updateTaskConditions']=0;await c.refresh();
 assert.equal(h.task.conditions.batteryThresholdPercent,10);assert.equal(c.state.policyPending,false);assert.equal(c.state.error,null);
});
test('a replaced task is reconciled and a late older policy cannot overwrite the newer policy',async()=>{
 const h=host(),a=new AwakeController(h.bridge),b=new AwakeController(h.bridge);await Promise.all([a.refresh(),b.refresh()]);await a.start({kind:'unlimited'},false,null);
 let replaced=false;
 h.before=async(method)=>{if(method==='power.updateTaskConditions'&&!replaced){replaced=true;h.task.generation++;h.task.conditionsRevision=1;}};
 await a.savePolicy({stop_on_low_battery:true});assert.equal(h.task.conditions.batteryThresholdPercent,10);assert.equal(a.state.policyPending,false);
 h.before=null;
 let gate,entered;const blocked=new Promise(resolve=>entered=resolve),release=new Promise(resolve=>gate=resolve);let held=false;
 h.before=async(method,input)=>{if(method==='power.updateTaskConditions'&&input.conditions.batteryThresholdPercent===25&&!held){held=true;entered();await release;}};
 const old=a.savePolicy({threshold_percent:25});await blocked;
 await b.savePolicy({threshold_percent:40});gate();await old;
 assert.equal(h.stored.battery_policy.threshold_percent,40);assert.equal(h.task.conditions.batteryThresholdPercent,40);assert.equal(a.state.policyPending,false);
});

test('a validated configuration read failure during an action preserves last-good config and native task',async()=>{
 const h=host(),c=new AwakeController(h.bridge);await c.refresh();await c.start({kind:'unlimited'},false,null);
 const previous=structuredClone(h.task),stored=structuredClone(h.stored);
 h.fail['storage.get']=1;
 await c.savePolicy({stop_on_low_battery:true});
 assert.deepEqual(h.stored,stored);assert.deepEqual(h.task,previous);assert.equal(c.state.ready,false);
 assert.deepEqual(c.state.preferences,stored);
 await c.stop();assert.equal(h.task,null,'Stop remains available after config read failure');
 await c.refresh();assert.equal(c.state.ready,true);
});

test('failed custom-input persistence reports unsaved input without claiming saved policy is pending',async()=>{
 const h=host(),c=new AwakeController(h.bridge);await c.refresh();
 h.fail['storage.compareAndSet']=1;
 await c.start({kind:'duration',minutes:30},false,{mode:'duration',duration_minutes:30,hour:18,minute:0});
 assert.equal(h.task.active,true);assert.equal(h.stored.custom_input,null);
 assert.equal(c.state.error,'preferences_save_failed');assert.equal(c.state.policyPending,false);
});

function holdNextSnapshot(h) {
 let enter,release;
 const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve);
 let blocked=false;
 h.before=async method=>{if(method==='power.readSnapshot'&&!blocked){blocked=true;enter();await held;}};
 return {entered,release};
}

test('Stop accepted during a held background refresh eventually stops the native task',async()=>{
 const h=host(),c=new AwakeController(h.bridge);await c.refresh();await c.start({kind:'unlimited'},false,null);
 const gate=holdNextSnapshot(h),poll=c.refresh();await gate.entered;
 assert.equal(c.state.busy,false,'background polling alone leaves foreground controls usable');
 const stop=c.stop(),pending=c.state.busy;
 gate.release();await Promise.all([poll,stop]);
 assert.equal(h.events.filter(event=>event.method==='power.stopTask').length,1,'accepted Stop must reach the native boundary');
 assert.equal(h.task,null);assert.equal(c.state.task,null);
 assert.equal(pending,true,'accepted foreground intent is visibly pending before the poll finishes');
 assert.equal(c.state.busy,false);assert.equal(c.state.error,null);
});

for(const action of ['start','policy']) {
 test(`${action} accepted during background refresh keeps its requested result`,async()=>{
  const h=host(),c=new AwakeController(h.bridge);await c.refresh();
  if(action==='policy')await c.start({kind:'unlimited'},false,null);
  const gate=holdNextSnapshot(h),poll=c.refresh();await gate.entered;
  const intent=action==='start'?c.start({kind:'duration',minutes:30},false,null):c.savePolicy({stop_on_low_battery:true});
  const pending=c.state.busy;
  gate.release();await Promise.all([poll,intent]);
  if(action==='start')assert.deepEqual(h.task?.schedule,{kind:'duration',minutes:30});
  else {
   assert.equal(h.stored.battery_policy.stop_on_low_battery,true);
   assert.equal(h.task.conditions.batteryThresholdPercent,10);
   assert.equal(c.state.policyPending,false);
  }
  assert.equal(pending,true,`${action} must report queued work`);
  assert.equal(c.state.busy,false);assert.equal(c.state.error,null);
 });
}

test('disposing during a held refresh cancels queued foreground work without native or storage mutations',async()=>{
 for(const action of ['stop','start','policy']) {
  const h=host(),c=new AwakeController(h.bridge);await c.refresh();await c.start({kind:'unlimited'},false,null);
  const previous=structuredClone(h.task),stored=structuredClone(h.stored);
  const gate=holdNextSnapshot(h),poll=c.refresh();await gate.entered;
  const intent=action==='stop'?c.stop():action==='start'?c.start({kind:'duration',minutes:30},false,null):c.savePolicy({stop_on_low_battery:true});
  c.dispose();await intent;
  gate.release();await poll;
  assert.deepEqual(h.task,previous,`${action} must not escape disposal`);
  assert.deepEqual(h.stored,stored);assert.equal(c.state.busy,false);
 }
});
