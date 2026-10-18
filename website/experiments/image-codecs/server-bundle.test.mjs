import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabServer } from './server.mjs';
test('verified local bundle serves real browser assets and notices, refuses writes and unrelated files', async () => {
  const server = await createLabServer({ port: 4326 });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4326, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:4326';
  try {
    const page = await fetch(`${base}/image-lab/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /图片编解码实验/);
    const script = html.match(/src="(\/image-lab\/assets\/[^\"]+\.js)"/)[1];
    assert.equal((await fetch(base + script)).status, 200);
    assert.equal((await fetch(`${base}/image-lab/materials/THIRD_PARTY_NOTICES.md`)).status, 200);
    assert.equal((await fetch(`${base}/image-lab/materials/manifest.json`)).status, 200);
    const source = await fetch(`${base}/image-lab/materials/application-source/image-codecs/REBUILD.md`);
    assert.match(await source.text(), /Emscripten/);
    assert.equal((await fetch(`${base}/image-lab/`, { method: 'POST', body: 'synthetic-private-marker' })).status, 405);
    assert.equal((await fetch(`${base}/image-lab/materials/application-source/package.json`, { headers: { Origin: 'https://unrelated.invalid' } })).status, 403);
    for (const path of ['/package.json', '/image-lab/.git/config', '/image-lab/index.html?private=marker', '/image-lab/materials/no-such-file']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(`${base}/image-lab/`, { method: 'HEAD' })).headers.get('cache-control'), 'no-store');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
