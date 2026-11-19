import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

let module;
async function load() {
  if (!module) module = (async () => {
    assert(await fs.access('src/plugins/bingWallpaper/package/network.ts').then(() => true, () => false), 'package-owned metadata adapter is required');
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-paper-network-'));
    try {
      execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'src/plugins/bingWallpaper/package/tsconfig.json', '--noEmit', 'false', '--outDir', temp], {stdio: 'pipe'});
      await fs.writeFile(path.join(temp, 'package.json'), '{"type":"module"}');
      return await import(pathToFileURL(path.join(temp, 'plugins/bingWallpaper/package/network.js')).href);
    } finally { await fs.rm(temp, {recursive: true, force: true}); }
  })();
  return module;
}
const now = Date.parse('2026-11-16T10:00:00Z');
const metadata = {images: [{startdate: '20261116', fullstartdate: '202611151600', title: '山与湖', copyright: 'Photo', hsh: 'native-bing-id', url: '/th?id=OHR.Lake_ZH-CN_1920x1080.jpg'}]};
const response = (overrides = {}) => ({status: 200, contentType: 'application/json; charset=utf-8', bodyBase64: Buffer.from(JSON.stringify(metadata)).toString('base64'), ...overrides});
const bridge = value => ({request: async () => ({ok: true, value})});

test('Paper metadata adapter uses the public scoped GET and parses UTF8 archive', async () => {
  const {fetchArchive, ARCHIVE_URL} = await load();
  const signal = new AbortController().signal;
  const calls = [];
  const items = await fetchArchive({request: async (...args) => {calls.push(args); return {ok: true, value: response()};}}, now, signal);
  assert.equal(items[0].title, '山与湖');
  assert.deepEqual(calls, [['network.fetch', {url: ARCHIVE_URL, method: 'GET'}, {signal}]]);
  assert.equal(new URL(ARCHIVE_URL).origin, 'https://www.bing.com');
});

test('HTTP failure is not treated as archive metadata', async () => {
  const {fetchArchive} = await load();
  await assert.rejects(fetchArchive(bridge(response({status: 503})), now), {code: 'bing.http', retryable: true});
  await assert.rejects(fetchArchive(bridge(response({status: 302})), now), {code: 'bing.http'});
});

test('malformed encoded responses and wrong media types fail within metadata bounds', async () => {
  const {fetchArchive} = await load();
  for (const value of [
    response({bodyBase64: '%%%='}), response({bodyBase64: 'YQ='}),
    response({bodyBase64: Buffer.from([0xff, 0xfe]).toString('base64')}),
    response({contentType: 'text/html'}), response({contentType: null}),
    response({bodyBase64: Buffer.alloc(512 * 1024 + 1, 32).toString('base64')}),
    response({bodyBase64: Buffer.from('{broken').toString('base64')}),
  ]) await assert.rejects(fetchArchive(bridge(value), now), error => /^bing\.response_/.test(error.code));
});

test('cancellation before and after transport delivery cannot publish archive items', async () => {
  const {fetchArchive} = await load();
  const first = new AbortController(); first.abort();
  let calls = 0;
  await assert.rejects(fetchArchive({request: async () => {calls++; return {ok: true, value: response()};}}, now, first.signal), {code: 'request.cancelled'});
  assert.equal(calls, 0);
  const second = new AbortController();
  await assert.rejects(fetchArchive({request: async () => {second.abort(); return {ok: true, value: response()};}}, now, second.signal), {code: 'request.cancelled'});
});

test('native permission failure stays typed and rejected transports expose no raw message', async () => {
  const {fetchArchive} = await load();
  await assert.rejects(fetchArchive({request: async () => ({ok: false, error: {code: 'permission.denied', message: 'private host detail', retryable: false}})}, now), {code: 'permission.denied', retryable: false});
  await assert.rejects(fetchArchive({request: async () => {throw new Error('private host detail');}}, now), error => error.code === 'network.failed' && !error.message.includes('private host detail'));
});
