import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('isolated SDK accepts exact media DTOs and enforces the export deadline', async context => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zero-media-sdk-'));
  try {
    execFileSync(process.execPath,['scripts/build-plugin-sdk.mjs','--output',root],{stdio:'pipe'});
    fs.mkdirSync(path.join(root,'node_modules'),{recursive:true});
    fs.symlinkSync(path.dirname(require.resolve('semver/package.json')),path.join(root,'node_modules/semver'),'dir');
    fs.writeFileSync(path.join(root,'consumer.mts'),`
      import {type ZeroBridge,type ImageAsset,type ImagePreview,type WallpaperIntent,type ImageExport,type PublicPermission} from './dist/index.js';
      export const grants:PublicPermission[]=['system.wallpaper','files.export'];
      export async function media(bridge:ZeroBridge) {
        const cached=await bridge.request('media.cacheImage',{url:'https://example.com/a.png'});
        if(!cached.ok) return;
        const asset:ImageAsset=cached.value;
        const preview=await bridge.request('media.preview',{assetId:asset.assetId});
        if(preview.ok) {const lease:ImagePreview=preview.value;await bridge.request('media.releasePreview',{leaseId:lease.leaseId});}
        const prepared=await bridge.request('wallpaper.prepare',{assetId:asset.assetId,claimId:crypto.randomUUID()});
        if(prepared.ok) {const intent:WallpaperIntent=prepared.value;await bridge.request('wallpaper.apply',{intentId:intent.intentId});await bridge.request('wallpaper.cancelPrepared',{intentId:intent.intentId});}
        await bridge.request('wallpaper.recover',{});await bridge.request('wallpaper.platform',{});
        const exported=await bridge.request('media.exportImage',{assetId:asset.assetId,suggestedName:'a.png'});if(exported.ok) {const output:ImageExport=exported.value;return output;}
      }
    `);
    execFileSync(process.execPath,[require.resolve('typescript/bin/tsc'),'consumer.mts','--strict','--noEmit','--skipLibCheck','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022'],{cwd:root,stdio:'pipe'});
    const {createZeroBridge}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
    const id='a'.repeat(64), session={sessionId:'b'.repeat(64),generation:1,pluginId:'test.media',pluginVersion:'1.0.0',apiVersion:'1.0.0',surfaceId:'test.media.main',registryRevision:1};
    let value;
    const bridge=createZeroBridge({session,ready:async()=>session,cancel:async()=>{},request:async request=>({requestId:request.requestId,ok:true,value})},new AbortController().signal);
    const asset={assetId:id,byteLength:100,width:2,height:2,mimeType:'image/png'};
    const previewPath = `/__zero_preview/${id}`;
    const preview = {
      leaseId: id, url: previewPath, byteLength: 100, width: 2, height: 2, mimeType: 'image/jpeg',
    };
    const invalidPreviews = [
      `zero-plugin://${session.sessionId}${previewPath}`,
      `http://zero-plugin.${session.sessionId}${previewPath}`,
      `https://zero-plugin.${'c'.repeat(64)}${previewPath}`,
      `//evil.example${previewPath}`,
      `https://evil.example${previewPath}`,
      previewPath.slice(1),
      `${previewPath}?extra=1`,
      `${previewPath}#extra`,
      `/__zero_preview/../__zero_preview/${id}`,
      `/__zero_preview/%61${id.slice(1)}`,
      `/__zero_preview/${'c'.repeat(64)}`,
    ].map(url => ({...preview, url}));
    invalidPreviews.push({...preview, leaseId: id.toUpperCase(), url: `/__zero_preview/${id.toUpperCase()}`});
    for(const [method,payload,valid,invalid] of [
      ['media.cacheImage',{url:'https://example.com/image.png'},asset,[{...asset,path:'/private/x'},{...asset,width:0},{...asset,mimeType:'text/html'}]],
      ['media.preview',{assetId:id},preview,invalidPreviews],
      ['wallpaper.platform',{}, {platform:'macos',supported:true},[{platform:'macos',supported:'yes'}]],
      ['wallpaper.prepare',{assetId:id,claimId:'4c612626-dd03-40b4-8fc1-96fc75f2980c'},{intentId:id,generation:1},[{intentId:id,generation:0}]],
      ['wallpaper.apply',{intentId:id},{outcome:'applied'},[{outcome:'success'}]],
      ['media.exportImage',{assetId:id,suggestedName:'wallpaper.png'},{cancelled:true,fileName:null},[{cancelled:false,fileName:'/private/path.png'},{cancelled:true,fileName:'a.png'}]],
      ['media.releasePreview',{leaseId:id},null,[{}]],
      ['wallpaper.cancelPrepared',{intentId:id},null,[{}]],
      ['wallpaper.recover',{},null,[{}]],
    ]) {
      value=valid; assert.deepEqual(await bridge.request(method,payload),{ok:true,value},method);
      for(value of invalid) assert.equal((await bridge.request(method,payload)).error?.code,'transport.invalid',method);
    }
    value = preview;
    const previewResult = await bridge.request('media.preview', {assetId: id});
    assert.ok(previewResult.ok);
    for (const scheme of ['http', 'https']) {
      const webViewOrigin = `${scheme}://zero-plugin.${session.sessionId}`;
      assert.equal(
        new URL(previewResult.value.url, `${webViewOrigin}/dist/index.html`).href,
        `${webViewOrigin}${previewPath}`,
      );
    }
    await context.test('only export waits two minutes and still propagates timeout and abort', async ({mock}) => {
      mock.timers.enable({apis: ['setTimeout']});
      const issued = [];
      const cancelled = [];
      const reply = [];
      const bridge = createZeroBridge({
        session,
        ready: async () => session,
        request: request => new Promise(resolve => {
          issued.push(request);
          reply.push(value => resolve({requestId: request.requestId, ok: true, value}));
        }),
        cancel: async request => { cancelled.push(request); },
      }, new AbortController().signal);
      const payload = {assetId: id, suggestedName: 'wallpaper.png'};
      const exported = {cancelled: false, fileName: 'wallpaper.png'};

      const exportAfterWait = bridge.request('media.exportImage', payload);
      const ordinary = bridge.request('media.preview', {assetId: id});
      await Promise.resolve();
      mock.timers.tick(10_000);
      assert.deepEqual(cancelled.map(request => request.method), ['media.preview']);
      assert.equal((await ordinary).error.code, 'request.timeout');
      mock.timers.tick(1_000);
      reply[0](exported);
      assert.deepEqual(await exportAfterWait, {ok: true, value: exported});

      const exportTimeout = bridge.request('media.exportImage', payload);
      await Promise.resolve();
      mock.timers.tick(119_999);
      assert.deepEqual(cancelled, [issued[1]]);
      mock.timers.tick(1);
      assert.deepEqual(cancelled, [issued[1], issued[2]]);
      assert.equal((await exportTimeout).error.code, 'request.timeout');
      reply[2](exported);

      const abort = new AbortController();
      const exportAbort = bridge.request('media.exportImage', payload, {signal: abort.signal});
      await Promise.resolve();
      mock.timers.tick(11_000);
      abort.abort();
      assert.equal((await exportAbort).error.code, 'request.cancelled');
      reply[3](exported);
      mock.timers.tick(120_000);
      assert.deepEqual(cancelled, [issued[1], issued[2], issued[3]]);
    });
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test("Snap PNG upload and File jobs use scoped transport without exposing OS paths", async () => {
  const {createZeroBridge} = await import("/private/tmp/zero-tests/sdk/index.js");
  const id = "a".repeat(64);
  const session = {sessionId:"b".repeat(64),generation:2,pluginId:"test.qa",pluginVersion:"0.1.0",apiVersion:"1.0.0",surfaceId:"test.qa.main",registryRevision:1};
  const bytes = Uint8Array.of(1, 2, 3);
  const capture = {captureId:id,width:2,height:2,url:`/__zero_capture/${id}`};
  const job = {id,status:"running",stage:"converting",percent:14,outputName:"test.docx",errorCode:null};
  let response = capture;
  const transport = {
    session,
    ready: async () => session,
    cancel: async () => {},
    request: async request => ({requestId:request.requestId,ok:true,value:response}),
    upload: async (request, payload) => {
      assert.equal(request.method, "screen.commitCaptureExport");
      assert.deepEqual(request.payload, {leaseId: id});
      assert.equal(request.sessionId, session.sessionId);
      assert.equal(request.generation, session.generation);
      assert.deepEqual(payload, bytes);
      return {requestId:request.requestId,ok:true,value:{cancelled:false}};
    },
  };
  const bridge = createZeroBridge(transport, new AbortController().signal);
  assert.deepEqual(await bridge.upload(id, bytes), {ok:true,value:{cancelled:false}});
  assert.equal((await bridge.upload("unknown", bytes)).error?.code, "request.invalid");
  assert.equal((await bridge.upload(id, new Uint8Array())).error?.code, "request.invalid");
  assert.deepEqual(await bridge.request("screen.captureDisplay", {}), {ok:true,value:capture});
  response = {...capture, url: "file:///private/input.png"};
  assert.equal((await bridge.request("screen.captureDisplay", {})).error?.code, "transport.invalid");
  response = job;
  assert.deepEqual(await bridge.request("documents.status", {id}), {ok:true,value:job});
  response = {...job, outputName: "/private/test.docx"};
  assert.equal((await bridge.request("documents.status", {id})).error?.code, "transport.invalid");
});
