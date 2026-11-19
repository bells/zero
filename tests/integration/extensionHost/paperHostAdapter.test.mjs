import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

let loaded;
async function load() {
  if (!loaded) loaded = (async () => {
    assert(await fs.access('src/plugins/bingWallpaper/package/host.ts').then(() => true, () => false), 'Paper must bind to actual public SDK methods');
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-paper-host-'));
    try {
      execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'src/plugins/bingWallpaper/package/tsconfig.json', '--noEmit', 'false', '--outDir', temp], {stdio:'pipe'});
      await fs.writeFile(path.join(temp, 'package.json'), '{"type":"module"}');
      await fs.symlink(path.resolve('node_modules'), path.join(temp, 'node_modules'), 'dir');
      const modules = await Promise.all([
        'plugins/bingWallpaper/package/host.js',
        'plugins/bingWallpaper/package/backgroundWorkflow.js',
        'sdk/index.js',
      ].map(file => import(pathToFileURL(path.join(temp, file)).href)));
      return Object.assign({}, ...modules);
    } finally { await fs.rm(temp, {recursive:true,force:true}); }
  })();
  return loaded;
}

test('Paper native factory forwards bounded media operations and native receipts', async () => {
  const {createPaperHost} = await load();
  const calls = [];
  const image = {assetId:'a'.repeat(64),byteLength:10,width:1,height:1,mimeType:'image/png'};
  const replies = {
    'storage.get': {saved:true}, 'storage.compareAndSet':{swapped:false,currentValue:{newer:true}},
    'media.cacheImage':image, 'media.preview':{leaseId:'b'.repeat(64),url:`/__zero_preview/${'b'.repeat(64)}`,byteLength:8,width:1,height:1,mimeType:'image/jpeg'},
    'media.releasePreview':null, 'wallpaper.prepare':{intentId:'native-intent',generation:8},
    'wallpaper.apply':{outcome:'alreadyApplied'}, 'wallpaper.cancelPrepared':null,'wallpaper.recover':null,
    'wallpaper.platform':{platform:'macos',supported:true}, 'media.exportImage':{cancelled:true,fileName:null},
    'schedule.upsert':{generation:7},'schedule.cancel':{cancelled:true},
  };
  const host = createPaperHost({request:async (...args) => {calls.push(args); return {ok:true,value:structuredClone(replies[args[0]])};}});
  const signal = new AbortController().signal;
  assert.deepEqual(await host.get('own-state'),{saved:true});
  assert.deepEqual(await host.compareAndSet('own-state',null,{version:1}),{swapped:false,currentValue:{newer:true}});
  assert.deepEqual(await host.cacheImage('https://www.bing.com/th?id=sample',signal),image);
  assert.equal((await host.preview(image.assetId)).leaseId,'b'.repeat(64));
  await host.releasePreview('preview');
  assert.deepEqual(await host.prepareWallpaper(image.assetId),{intentId:'native-intent',generation:8});
  assert.equal(await host.applyWallpaper('native-intent'),'alreadyApplied');
  await host.cancelPrepared('native-intent'); await host.recoverWallpaper();
  assert.deepEqual(await host.exportImage(image.assetId,'sample.png',signal),{cancelled:true,fileName:null});
  assert.deepEqual(await host.platform(),{platform:'macos',supported:true});
  assert.deepEqual(await host.upsertSchedule({taskId:'paper-daily',eventId:'paper.daily',nextAtMs:1000,payload:{explicitEnableAtMs:null}}),{generation:7});
  assert.equal(await host.cancelSchedule('paper-daily'),true);
  const media = calls.find(([method])=>method==='media.cacheImage');
  assert.deepEqual(media,['media.cacheImage',{url:'https://www.bing.com/th?id=sample'},{signal}]);
  assert.deepEqual(calls.find(([method])=>method==='media.exportImage'),['media.exportImage',{assetId:image.assetId,suggestedName:'sample.png'},{signal}]);
  assert.deepEqual(calls.find(([method])=>method==='wallpaper.recover').slice(0,2),['wallpaper.recover',{}]);
});

test('each prepare workflow gets a distinct native claim to isolate concurrent CAS owners', async () => {
  const {createPaperHost} = await load(); const claims=[];
  const host=createPaperHost({request:async (method,payload)=>{assert.equal(method,'wallpaper.prepare'); claims.push(payload.claimId);return {ok:true,value:{intentId:'host-issued',generation:1}};}});
  await Promise.all([host.prepareWallpaper('a'.repeat(64)),host.prepareWallpaper('a'.repeat(64))]);
  assert.equal(new Set(claims).size,2);
  for(const id of claims) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('denial, uncertain intent and cancellation stay typed without private native messages', async () => {
  const {createPaperHost}=await load(); let code='permission.denied';
  const host=createPaperHost({request:async()=>({ok:false,error:{code,message:'private-native-path',retryable:false}})});
  await assert.rejects(host.cacheImage('https://www.bing.com/th?id=sample',new AbortController().signal),error=>error.code==='paper.image'&&!error.retryable&&!error.message.includes('private-native-path'));
  code='wallpaper.prepared_conflict'; await assert.rejects(host.prepareWallpaper('a'.repeat(64)),{code:'paper.uncertain'});
  code='request.cancelled'; await assert.rejects(host.platform(),{code:'paper.cancelled'});
  const broken=createPaperHost({request:async()=>{throw new Error('private-native-path');}});
  await assert.rejects(broken.platform(),error=>error.code==='paper.unsupported'&&!error.message.includes('private-native-path'));
});

test('metadata goes through scoped public network parsing rather than remote image embedding', async () => {
  const {createPaperHost}=await load();const calls=[];
  const body={images:[{startdate:'20200101',fullstartdate:'201912311600',hsh:'old-archive',title:'Archive',url:'/th?id=OHR.Archive_ZH-CN_1920x1080.jpg'}]};
  const host=createPaperHost({request:async(...args)=>{calls.push(args);return {ok:true,value:{status:200,contentType:'application/json',bodyBase64:Buffer.from(JSON.stringify(body)).toString('base64')}};}});
  const signal=new AbortController().signal; const items=await host.fetchArchive(signal);
  assert.equal(items[0].id,'old-archive'); assert.equal(calls[0][0],'network.fetch');
  assert.deepEqual(calls[0][2],{signal});
});

function nativeFailure(request, code, retryable) {
  return {requestId: request.requestId, ok: false, error: {code, retryable, message: 'private native detail'}};
}

test('Paper preserves native network retry flags through the SDK and sanitizes messages', async () => {
  const {createPaperHost, createZeroBridge} = await load();
  const signal = new AbortController().signal;
  for (const [code, retryable, expectedFailure] of [
    ['network.failed', true],
    ['network.timeout', true],
    ['network.limit', true],
    ['network.scopeDenied', false],
    ['network.responseTooLarge', false],
    ['network.invalidResponse', false],
    ['permission.denied', false],
    ['request.cancelled', false, 'paper.cancelled'],
    ['session.stale', false, 'paper.cancelled'],
  ]) {
    const transport = {
      session: {sessionId: 'paper-session', generation: 1},
      request: async request => nativeFailure(request, code, retryable),
    };
    const host = createPaperHost(createZeroBridge(transport, signal));
    const verify = kind => error => error.code === (expectedFailure ?? kind)
      && error.retryable === retryable && !error.message.includes('private native detail');
    await assert.rejects(host.fetchArchive(signal), verify('paper.network'));
    await assert.rejects(host.cacheImage('https://www.bing.com/th?id=sample', signal), verify('paper.image'));
  }
});

test('Paper reports bounded retry for transient native failures and media contention', async () => {
  const {createPaperHost, registerBackground, runPaperBackground} = await load();
  const archive = {
    images: [{startdate:'20251031', fullstartdate:'202510301600', hsh:'paper-today',
      title:'Today', url:'/th?id=OHR.Today_ZH-CN_1920x1080.jpg'}],
  };
  const now = Date.parse('2025-10-31T00:00:00Z');
  const archiveResponse = {
    status: 200, contentType: 'application/json', bodyBase64: Buffer.from(JSON.stringify(archive)).toString('base64'),
  };
  const preferences = {
    schemaVersion: 1, settings: {version: 1, autoChangeDaily: true}, lastApplied: null,
    manualOverrideUntil: null, pendingIntent: null, recoveryIntent: null,
  };
  for (const [failedMethod, code, retryable, attempt, time, expectedAt] of [
    ['network.fetch', 'network.timeout', true, 1, now, now + 60_000],
    ['network.fetch', 'network.limit', true, 2, now, now + 300_000],
    ['media.cacheImage', 'network.failed', true, 3, now, now + 900_000],
    ['media.cacheImage', 'network.timeout', true, 7, now, now + 1_800_000],
    ['media.cacheImage', 'network.limit', true, 4, Date.parse('2025-10-31T15:59:50Z'), Date.parse('2025-10-31T16:00:00Z')],
    ['media.cacheImage', 'media.busy', true, 2, now, now + 300_000],
    ['media.cacheImage', 'media.busy', true, 4, Date.parse('2025-10-31T15:59:50Z'), Date.parse('2025-10-31T16:00:00Z')],
    ['network.fetch', 'permission.denied', false, 1, now, null],
    ['media.cacheImage', 'permission.denied', false, 1, now, null],
    ['media.cacheImage', 'media.state', false, 1, now, null],
    ['media.cacheImage', 'request.cancelled', false, 1, now, null],
    ['media.cacheImage', 'network.invalidResponse', false, 1, now, null],
  ]) {
    const expectedOutcome = expectedAt === null ? 'failed' : 'retry';
    const background = {
      taskId: 'paper-daily', eventId: 'paper.daily', occurrenceId: 'ab'.repeat(16), attempt,
      payload: {explicitEnableAtMs: null}, scheduleGeneration: 1,
    };
    const session = {sessionId: 'paper-background', generation: 1, pluginId: 'zero.paper', pluginVersion: '1.0.0',
      apiVersion: '1.0.0', surfaceId: 'background', registryRevision: 1, background};
    const requests = [];
    const transport = {
      session,
      ready: async () => session,
      cancel: async () => {},
      request: async request => {
        requests.push(request);
        if (request.method === failedMethod) return nativeFailure(request, code, retryable);
        let value;
        switch (request.method) {
          case 'storage.get': value = request.payload.key === 'paper.preferences.v1' ? preferences : null; break;
          case 'storage.compareAndSet':
            assert.equal(request.payload.key, 'paper.archive.v1');
            value = {swapped: true, currentValue: null};
            break;
          case 'wallpaper.platform': value = {platform: 'macos', supported: true}; break;
          case 'network.fetch': value = archiveResponse; break;
          case 'background.complete': value = {generation: expectedAt === null ? null : 2}; break;
          default: assert.fail(`Unexpected host request ${request.method}`);
        }
        return {requestId: request.requestId, ok: true, value};
      },
    };
    const result = await registerBackground((event, context) => runPaperBackground(createPaperHost(context.bridge), {
      attempt: event.attempt, signal: context.signal, now: time,
    }), transport).ready;
    const detail = `${failedMethod} ${code}`;
    assert.equal(result.ok, true, detail);
    assert.equal(requests.filter(request => request.method === failedMethod).length, 1, detail);
    assert.equal(requests.filter(request => request.method.startsWith('wallpaper.') && request.method !== 'wallpaper.platform').length, 0, detail);
    assert.deepEqual(requests.filter(request => request.method === 'background.complete').map(request => request.payload), [
      {outcome: expectedOutcome, nextAtMs: expectedAt},
    ], detail);
  }
});
