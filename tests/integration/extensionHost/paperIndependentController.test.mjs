import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const now = Date.parse('2026-11-16T10:00:00Z');
const pref = 'paper.preferences.v1';
const latest = {id:'today',startDate:'20261116',publicationDate:'2026-11-16',title:'Lake',attribution:'Photo',remoteUrl:'https://www.bing.com/th?id=Lake'};
const old = {...latest,id:'old',startDate:'20261115',publicationDate:'2026-11-15'};
const fresh = () => ({schemaVersion:1,settings:{version:1,autoChangeDaily:false},lastApplied:null,manualOverrideUntil:null,pendingIntent:null,recoveryIntent:null});
const deferred = () => {let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve};};
let loaded;
async function load() {
  if (!loaded) loaded = (async () => {
    assert.equal(await fs.access('src/plugins/bingWallpaper/package/controller.ts').then(()=>true,()=>false),true,'Paper controller must implement the port contract');
    const temp = await fs.mkdtemp(path.join(os.tmpdir(),'zero-paper-controller-'));
    execFileSync(process.execPath,['node_modules/typescript/bin/tsc','src/plugins/bingWallpaper/package/controller.ts','src/plugins/bingWallpaper/package/backgroundWorkflow.ts','--strict','--noUncheckedIndexedAccess','--exactOptionalPropertyTypes','--target','ES2022','--module','ES2022','--moduleResolution','bundler','--lib','ES2022,DOM','--skipLibCheck','--outDir',temp],{stdio:'pipe'});
    await fs.writeFile(path.join(temp,'package.json'),' {"type":"module"}');
    const controller = await import(pathToFileURL(path.join(temp,'controller.js')));
    const background = await import(pathToFileURL(path.join(temp,'backgroundWorkflow.js')));
    await fs.rm(temp,{recursive:true,force:true});
    return {...controller,...background};
  })(); return loaded;
}
function fixture(initial = fresh(), overrides={}) {
  const storage = new Map([[pref,structuredClone(initial)]]), calls=[];
  let token=0;
  const host = {
    get:async key => structuredClone(storage.get(key) ?? null),
    compareAndSet:async (key,expected,value) => {calls.push(['cas',key,structuredClone(value)]); const current=storage.get(key)??null; if(JSON.stringify(current)!==JSON.stringify(expected)) return {swapped:false,currentValue:structuredClone(current)}; storage.set(key,structuredClone(value)); return {swapped:true,currentValue:structuredClone(value)};},
    fetchArchive:async signal => {calls.push(['fetch',signal]); return [latest,old];},
    cacheImage:async (url,signal) => {calls.push(['cache',url,signal]); return {assetId:url.includes('Lake')?'asset':'other',byteLength:10,width:2,height:2,mimeType:'image/jpeg'};},
    preview:async assetId => ({leaseId:`lease-${++token}`,url:`blob:${assetId}`,byteLength:10,width:2,height:2,mimeType:'image/jpeg'}),
    releasePreview:async leaseId => {calls.push(['release',leaseId]);},
    prepareWallpaper:async assetId => {calls.push(['prepare',assetId]); return {intentId:`intent-${++token}`,generation:token};},
    applyWallpaper:async intentId => {calls.push(['apply',intentId,structuredClone(storage.get(pref))]); return 'applied';},
    cancelPrepared:async intentId => {calls.push(['cancelPrepared',intentId]);},
    recoverWallpaper:async () => {calls.push(['recover']);},
    exportImage:async (assetId,name,signal) => {calls.push(['export',assetId,name,signal]); return {cancelled:false,fileName:name};},
    platform:async () => ({platform:'test',supported:true}),
    upsertSchedule:async input => {calls.push(['schedule',input,structuredClone(storage.get(pref))]); return {generation:1};},
    cancelSchedule:async taskId => {calls.push(['cancelSchedule',taskId]); return true;},
    ...overrides,
  }; return {host,storage,calls};
}
async function controller(f) {const {createPaperController}=await load(); const c=createPaperController(f.host,{now:()=>now}); await c.start(); return c;}
const idle = async () => {for(let i=0;i<12;i++) await Promise.resolve();};

test('failed preference read preserves unknown storage and never enables or writes defaults',async()=>{
  const f=fixture(fresh(),{get:async key=> {if(key===pref) throw Error('private path'); return null;}}); const c=await controller(f);
  assert.equal(c.getSnapshot().settingsLoaded,false); assert.equal(c.getSnapshot().error.code,'paper.storage');
  await c.setAutoChangeDaily(true); assert.equal(f.calls.some(c=>c[0]==='cas'||c[0]==='schedule'||c[0]==='apply'),false); c.dispose();
});
test('successful null preference read is fresh off without persisting defaults',async()=>{
  const f=fixture(null); const c=await controller(f); assert.equal(c.getSnapshot().automation.settings.autoChangeDaily,false);
  assert.equal(f.calls.some(c=>c[0]==='cas'&&c[1]===pref),false); c.dispose();
});
test('settings CAS retries merge latest cross-view settlement before scheduling',async()=>{
  const f=fixture(); const c=await controller(f); const peer={...fresh(),lastApplied:{wallpaperId:'peer',publicationDate:'2026-11-16',appliedAt:now,origin:'manual'}};
  f.storage.set(pref,peer); await c.setAutoChangeDaily(true); assert.equal(f.storage.get(pref).lastApplied.wallpaperId,'peer');
  const schedule=f.calls.find(c=>c[0]==='schedule'); assert.equal(schedule[1].taskId,'paper-daily'); assert.equal(schedule[1].eventId,'paper.daily'); assert.equal(schedule[2].settings.autoChangeDaily,true); c.dispose();
});
test('settings saved but scheduling failure stays visible and retryable on reopening',async()=>{
  const f=fixture(fresh(),{upsertSchedule:async()=>{throw Error('private');}}); const c=await controller(f); await c.setAutoChangeDaily(true);
  assert.equal(f.storage.get(pref).settings.autoChangeDaily,true); assert.equal(c.getSnapshot().scheduleStatus,'failed'); assert.equal(c.getSnapshot().error.code,'paper.schedule'); c.dispose();
  const reopened=await controller(f); assert.equal(reopened.getSnapshot().scheduleStatus,'failed'); reopened.dispose();
});
test('held refresh never drops foreground setting intent or makes it busy',async()=>{
  const hold=deferred(); const f=fixture(fresh(),{fetchArchive:()=>hold.promise});
  const {createPaperController}=await load(); const c=createPaperController(f.host,{now:()=>now}); const starting=c.start(); await idle();
  assert.equal(c.getSnapshot().busy,null); await c.setAutoChangeDaily(true); assert.equal(f.storage.get(pref).settings.autoChangeDaily,true);
  hold.resolve([latest]); await starting; c.dispose();
});
test('cache-first selection follows newest and preserves deliberate history until Latest',async()=>{
  const hold=deferred(); const f=fixture(fresh(),{fetchArchive:()=>hold.promise}); f.storage.set('paper.archive.v1',{schemaVersion:1,savedAt:now-1000,items:[old]});
  const {createPaperController}=await load(); const c=createPaperController(f.host,{now:()=>now}); const starting=c.start(); await idle(); assert.equal(c.getSnapshot().selected.id,'old');
  hold.resolve([latest,old]); await starting; assert.equal(c.getSnapshot().selected.id,'today'); c.selectOlder(); assert.equal(c.getSnapshot().selected.id,'old');
  await c.refresh(); assert.equal(c.getSnapshot().selected.id,'old'); c.latest(); assert.equal(c.getSnapshot().selected.id,'today'); c.dispose();
});
test('stale preview and disposal release leases and abort outstanding fetch/image work',async()=>{
  const hold=deferred(); const signals=[]; let previews=0;
  const f=fixture(fresh(),{cacheImage:async(url,signal)=>{signals.push(signal); return {assetId:url,byteLength:1,width:1,height:1,mimeType:'image/jpeg'};},preview:async()=> {previews++; return previews===1?hold.promise:{leaseId:'new',url:'blob:new',byteLength:1,width:1,height:1,mimeType:'image/jpeg'};}});
  const c=await controller(f); await idle(); c.selectOlder(); await idle(); hold.resolve({leaseId:'late',url:'blob:late',byteLength:1,width:1,height:1,mimeType:'image/jpeg'}); await idle();
  assert.equal(c.getSnapshot().preview.leaseId,'new'); assert(f.calls.some(c=>c[0]==='release'&&c[1]==='late')); c.dispose(); await idle();
  assert(f.calls.some(c=>c[0]==='release'&&c[1]==='new')); assert(signals.every(s=>s.aborted));
});
test('manual apply persists native intent before effect and settled receipt before success',async()=>{
  const f=fixture(); const c=await controller(f); await c.apply(); const effect=f.calls.find(c=>c[0]==='apply');
  assert.equal(effect[2].pendingIntent.operationId,effect[1]); assert.equal(f.storage.get(pref).pendingIntent,null); assert.equal(f.storage.get(pref).lastApplied.wallpaperId,'today'); assert.equal(c.getSnapshot().notice,'applied'); c.dispose();
});
test('pending CAS conflict cancels prepared native token and never applies',async()=>{
  const f=fixture(); const c=await controller(f); const original=f.host.compareAndSet;
  f.host.compareAndSet=async(key,expected,value)=>key===pref?{swapped:false,currentValue:fresh()}:original(key,expected,value);
  await c.apply(); assert.equal(f.calls.some(c=>c[0]==='apply'),false); assert(f.calls.some(c=>c[0]==='cancelPrepared')); c.dispose();
});
test('pending write failure cancels prepared token and prevents OS effect',async()=>{
  const f=fixture(); const c=await controller(f); f.host.compareAndSet=async()=>{throw Error('private');}; await c.apply();
  assert.equal(f.calls.some(c=>c[0]==='apply'),false); assert(f.calls.some(c=>c[0]==='cancelPrepared')); c.dispose();
});
for(const failure of ['native','settlement']) test(`${failure} ambiguity retains pending state and blocks replay`,async()=>{
  const f=fixture(); const c=await controller(f);
  if(failure==='native') f.host.applyWallpaper=async()=>{throw Error('unknown OS outcome');};
  else {const cas=f.host.compareAndSet; f.host.compareAndSet=async(key,expected,value)=>{if(key===pref&&expected?.pendingIntent&&value.pendingIntent===null) throw Error('write'); return cas(key,expected,value);};}
  await c.apply(); assert(f.storage.get(pref).pendingIntent); assert.equal(c.getSnapshot().uncertain,true); assert.notEqual(c.getSnapshot().notice,'applied');
  const count=f.calls.filter(c=>c[0]==='prepare').length; await c.apply(); assert.equal(f.calls.filter(c=>c[0]==='prepare').length,count); c.dispose();
});
test('background off performs no fetch or native effect',async()=>{
  const f=fixture(); const {runPaperBackground}=await load(); assert.deepEqual(await runPaperBackground(f.host,{attempt:1,signal:new AbortController().signal,now}),{outcome:'completed',nextAtMs:null}); assert.equal(f.calls.length,0);
});
test('background applies once, persists intent first and deduplicates stable ID',async()=>{
  const state=fresh(); state.settings.autoChangeDaily=true; const f=fixture(state); const {runPaperBackground}=await load(); const ctx={attempt:1,signal:new AbortController().signal,now};
  assert.deepEqual(await runPaperBackground(f.host,ctx),{outcome:'completed',nextAtMs:Date.parse('2026-11-16T16:00:00Z')});
  const effect=f.calls.find(c=>c[0]==='apply'); assert.equal(effect[2].pendingIntent.operationId,effect[1]); await runPaperBackground(f.host,ctx); assert.equal(f.calls.filter(c=>c[0]==='apply').length,1);
});
test('background honors manual historical override and pending uncertainty without native recovery',async()=>{
  const state=fresh(); state.settings.autoChangeDaily=true; const f=fixture(state); const c=await controller(f); c.selectOlder(); await c.apply(); c.dispose();
  assert.equal(f.storage.get(pref).manualOverrideUntil,Date.parse('2026-11-16T16:00:00Z')); const {runPaperBackground}=await load(); const ctx={attempt:1,signal:new AbortController().signal,now};
  await runPaperBackground(f.host,ctx); assert.equal(f.calls.filter(c=>c[0]==='apply').length,1);
  f.storage.get(pref).pendingIntent={operationId:'uncertain',wallpaperId:'other',publicationDate:null,origin:'manual',startedAt:now};
  assert.deepEqual(await runPaperBackground(f.host,ctx),{outcome:'failed',nextAtMs:null}); assert.equal(f.calls.some(c=>c[0]==='recover'),false);
});
test('background retry uses SDK attempt minus one and stops at market midnight',async()=>{
  const state=fresh(); state.settings.autoChangeDaily=true; const f=fixture(state,{fetchArchive:async()=>{throw Error('offline');}}); const {runPaperBackground}=await load();
  for(const [attempt,seconds] of [[1,60],[2,300],[3,900],[4,1800]]) assert.deepEqual(await runPaperBackground(f.host,{attempt,signal:new AbortController().signal,now}),{outcome:'retry',nextAtMs:now+seconds*1000});
  assert.equal((await runPaperBackground(f.host,{attempt:4,signal:new AbortController().signal,now:Date.parse('2026-12-31T15:59:50Z')})).nextAtMs,Date.parse('2026-12-31T16:00:00Z'));
});
test('corrupt bounded archive is rejected without overwriting original storage',async()=>{
  const f=fixture(fresh(),{fetchArchive:async()=>{throw Error('offline');}}); const bad={schemaVersion:1,savedAt:now,items:Array(11).fill(latest)}; f.storage.set('paper.archive.v1',bad);
  const c=await controller(f); assert.equal(c.getSnapshot().items.length,0); assert.deepEqual(f.storage.get('paper.archive.v1'),bad); c.dispose();
});

test('actual settings CAS conflict retries against peer updates without erasing lastApplied',async()=>{
  const f=fixture(); const c=await controller(f); const cas=f.host.compareAndSet; let collided=false;
  f.host.compareAndSet=async(key,expected,value)=>{if(key===pref&&!collided){collided=true;const peer={...fresh(),lastApplied:{wallpaperId:'peer-during-write',publicationDate:'2026-11-16',appliedAt:now,origin:'manual'}};f.storage.set(pref,peer);return {swapped:false,currentValue:peer};}return cas(key,expected,value);};
  await c.setAutoChangeDaily(true);assert.equal(f.storage.get(pref).lastApplied.wallpaperId,'peer-during-write');assert.equal(f.storage.get(pref).settings.autoChangeDaily,true);c.dispose();
});
test('background respects nonretryable permission denial without an endless retry schedule',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state,{fetchArchive:async()=>{throw Object.assign(Error('permission.denied'),{code:'permission.denied',retryable:false});}});
  const {runPaperBackground}=await load();assert.deepEqual(await runPaperBackground(f.host,{attempt:1,signal:new AbortController().signal,now}),{outcome:'failed',nextAtMs:null});
});
test('background rereads cancellation after image cache and schedules nothing after disable',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state);const cache=f.host.cacheImage;
  f.host.cacheImage=async(...args)=>{const value=await cache(...args);f.storage.get(pref).settings.autoChangeDaily=false;return value;};
  const {runPaperBackground}=await load();assert.deepEqual(await runPaperBackground(f.host,{attempt:1,signal:new AbortController().signal,now}),{outcome:'completed',nextAtMs:null});assert.equal(f.calls.some(c=>c[0]==='prepare'||c[0]==='apply'),false);
});
test('settlement merges concurrent disable after native effect instead of re-enabling automation',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state);const c=await controller(f);const apply=f.host.applyWallpaper;
  f.host.applyWallpaper=async id=>{const receipt=await apply(id);f.storage.get(pref).settings.autoChangeDaily=false;return receipt;};
  await c.apply();assert.equal(f.storage.get(pref).settings.autoChangeDaily,false);assert.equal(f.storage.get(pref).lastApplied.wallpaperId,'today');c.dispose();
});
test('disposing drops queued foreground effects while preserving already-started uncertain operation',async()=>{
  const f=fixture();const c=await controller(f);const hold=deferred();f.host.applyWallpaper=()=>hold.promise;
  const applying=c.apply();await idle();const saving=c.save();c.dispose();hold.resolve('applied');await Promise.all([applying,saving]);
  assert.equal(f.calls.some(c=>c[0]==='export'),false);
});
test('only an explicit recovery action clears the captured pending token',async()=>{
  const state=fresh();state.pendingIntent={operationId:'old-token',wallpaperId:'old',publicationDate:null,origin:'manual',startedAt:now};const f=fixture(state);const c=await controller(f);
  assert.equal(c.getSnapshot().uncertain,true);assert.equal(f.calls.some(c=>c[0]==='recover'),false);await c.recover();assert.equal(f.storage.get(pref).pendingIntent,null);assert.equal(c.getSnapshot().uncertain,false);assert(f.calls.some(c=>c[0]==='recover'));c.dispose();
});
test('failed native recovery retains pending safety state',async()=>{
  const state=fresh();state.pendingIntent={operationId:'old-token',wallpaperId:'old',publicationDate:null,origin:'manual',startedAt:now};const f=fixture(state,{recoverWallpaper:async()=>{throw Error('no receipt');}});const c=await controller(f);await c.recover();assert.equal(f.storage.get(pref).pendingIntent.operationId,'old-token');assert.equal(c.getSnapshot().uncertain,true);c.dispose();
});
test('newly observed peer uncertainty aborts manual prepare and cannot be cleared by enabling',async()=>{
  const f=fixture();const c=await controller(f);f.storage.get(pref).pendingIntent={operationId:'peer',wallpaperId:'old',publicationDate:null,origin:'manual',startedAt:now};await c.apply();await c.setAutoChangeDaily(true);
  assert.equal(f.calls.some(c=>c[0]==='prepare'||c[0]==='apply'),false);assert.equal(f.storage.get(pref).pendingIntent.operationId,'peer');assert.equal(f.storage.get(pref).settings.autoChangeDaily,false);c.dispose();
});
test('background never treats an unknown native receipt as applied or replayable',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state,{applyWallpaper:async()=> 'unknown'});const {runPaperBackground}=await load();
  assert.deepEqual(await runPaperBackground(f.host,{attempt:1,signal:new AbortController().signal,now}),{outcome:'failed',nextAtMs:null});assert(f.storage.get(pref).pendingIntent);assert.equal(f.storage.get(pref).lastApplied,null);
});
test('an aborted background event performs no storage writes or network calls',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state);const signal=new AbortController();signal.abort();const {runPaperBackground}=await load();assert.deepEqual(await runPaperBackground(f.host,{attempt:1,signal:signal.signal,now}),{outcome:'failed',nextAtMs:null});assert.equal(f.calls.length,0);
});

test('automatic disable after pending persistence cancels only prepared token before OS call',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state);const cas=f.host.compareAndSet;
  f.host.compareAndSet=async(key,expected,value)=>{const result=await cas(key,expected,value);if(key===pref&&result.swapped&&value.pendingIntent)f.storage.get(pref).settings.autoChangeDaily=false;return result;};
  const {runPaperBackground}=await load();assert.deepEqual(await runPaperBackground(f.host,{attempt:1,signal:new AbortController().signal,now}),{outcome:'completed',nextAtMs:null});assert.equal(f.calls.some(c=>c[0]==='apply'),false);assert(f.calls.some(c=>c[0]==='cancelPrepared'));assert.equal(f.storage.get(pref).pendingIntent,null);
});
test('invalid background delivery metadata fails before reads or network',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state);const {runPaperBackground}=await load();
  for(const attempt of [0,-1,1.5,NaN,Infinity])assert.deepEqual(await runPaperBackground(f.host,{attempt,signal:new AbortController().signal,now}),{outcome:'failed',nextAtMs:null});
  assert.deepEqual(await runPaperBackground(f.host,{attempt:1,signal:new AbortController().signal,now:NaN}),{outcome:'failed',nextAtMs:null});assert.equal(f.calls.length,0);
});

test('explicit enable permits immediate latest available history but expires before later daily occurrences',async()=>{
  const {runPaperBackground}=await load();
  for(const [enabledAtMs,at,expectedEffects]of [[now,now,1],[now,now+120000,0],[now+1000,now,0]]){
    const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state,{fetchArchive:async()=>[old]});
    await runPaperBackground(f.host,{attempt:1,signal:new AbortController().signal,now:at,explicitEnableAtMs:enabledAtMs});
    assert.equal(f.calls.filter(c=>c[0]==='apply').length,expectedEffects);
  }
});

test('unsupported platform preserves saved opt-in but never claims scheduling or permits a new enable',async()=>{
  const state=fresh();state.settings.autoChangeDaily=true;const f=fixture(state,{platform:async()=>({platform:'unsupported',supported:false})});const c=await controller(f);
  assert.equal(f.storage.get(pref).settings.autoChangeDaily,true);assert.equal(f.calls.some(c=>c[0]==='schedule'),false);assert.equal(c.getSnapshot().scheduleStatus,'unsupported');
  await c.setAutoChangeDaily(false);await c.setAutoChangeDaily(true);assert.equal(f.storage.get(pref).settings.autoChangeDaily,false);assert.equal(c.getSnapshot().error.code,'paper.unsupported');c.dispose();
});
