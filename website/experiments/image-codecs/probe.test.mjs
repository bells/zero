import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cpus, totalmem, platform, release } from 'node:os';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { imageMeta } from 'image-meta';

// Resolve Astro's own locked Vite, never an accidentally hoisted desktop Vite.
const require = createRequire(import.meta.resolve('astro/package.json'));
const { build, preview } = await import(require.resolve('vite'));
const configFile = fileURLToPath(new URL('vite.config.mjs', import.meta.url));
await build({ configFile });
const assetRoot = new URL('../../output/image-codecs/dist/assets/', import.meta.url);
let dropIn;
if (process.env.IMAGE_CODEC_DROP_IN_BINDING) {
  assert.equal(Boolean(process.env.IMAGE_CODEC_HEIF_BINDING), false, 'Choose alias or drop-in, not both');
  const names = await readdir(assetRoot);
  const libraries = names.filter((name) => /^libheif.*\.js$/.test(name));
  assert.equal(libraries.length, 1, 'Expected a separately replaceable HEIC module');
  const hostNames = names.filter((name) => name.endsWith('.js') && name !== libraries[0]);
  const hostHashes = await Promise.all(hostNames.map(async (name) => createHash('sha256').update(await readFile(new URL(name, assetRoot))).digest('hex')));
  await copyFile(process.env.IMAGE_CODEC_DROP_IN_BINDING, new URL(libraries[0], assetRoot));
  for (let i = 0; i < hostNames.length; i++) assert.equal(createHash('sha256').update(await readFile(new URL(hostNames[i], assetRoot))).digest('hex'), hostHashes[i]);
  dropIn = { module: libraries[0], hostUnchanged: true, method: 'replace standalone library module without rebuilding host/worker' };
}
const server = await preview({ configFile });
let browser;
try {
  browser = await chromium.launch({ channel: process.env.WEBSITE_BROWSER_CHANNEL || 'chrome' });
  const page = await browser.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.location().url}: ${message.text()}`); });
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('http://127.0.0.1:4325/image-lab/');
  await page.waitForFunction(() => Boolean(window.imageCodecProbe));
  assert.equal(await page.evaluate(() => crossOriginIsolated), false, 'Experiment must not require COOP/COEP');
  assert.equal(requests.some((url) => /wasm|heif|mozjpeg|webp_enc/.test(url)), false, 'Codec fetched before operation');
  const codec = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'codecs', fixture: 'alpha.png' }));
  assert.equal(codec.kind, 'codecs', JSON.stringify(codec));
  assert.equal(codec.pngExact, true, 'PNG optimization changed RGBA');
  assert.equal(codec.zipExact, true, 'ZIP round trip changed encoded bytes');
  assert.notEqual(codec.jpegSizes[0], codec.jpegSizes[1], 'JPEG quality ignored');
  assert.notEqual(codec.webpSizes[0], codec.webpSizes[1], 'WebP quality ignored');
  assert.deepEqual(codec.formats, ['jpeg', 'webp', 'png']);
  const archive = await page.evaluate(async () => {
    const result = await window.imageCodecProbe.run({ operation: 'archive', entryBytes: 1024 * 1024, entries: 2 });
    return result.kind === 'archive' ? { ...result, zip: { bytes: result.zip.size, type: result.zip.type } } : result;
  });
  assert.equal(archive.kind, 'archive');
  assert.equal(archive.inputBytes, 2 * 1024 * 1024);
  assert.equal(archive.roundTrip, true);
  assert.ok(archive.zip.bytes > archive.inputBytes);
  const archiveRefused = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'archive', entryBytes: 64 * 1024 * 1024, entries: 2 }));
  assert.equal(archiveRefused.code, 'archive-experiment-limit');
  const heic = [];
  for (const fixture of ['synthetic-12mp.heic', 'synthetic-48mp.heic']) {
    for (let run = 1; run <= 2; run++) {
      const result = await page.evaluate(({ fixture }) => window.imageCodecProbe.run({ operation: 'heic', fixture, pixelLimit: 50_000_000 }), { fixture });
      assert.equal(result.kind, 'heic', JSON.stringify(result));
      assert.equal(result.primary, true);
      assert.equal(result.pixels, fixture.includes('48mp') ? 48_771_072 : 12_192_768);
      heic.push({ fixture, run, ...result });
    }
  }
  const orientation = [];
  const baseline = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'heic', fixture: 'synthetic-12mp.heic', pixelLimit: 50_000_000 }));
  assert.ok(baseline.samples, 'HEIC pixel samples missing');
  for (const turn of [1, 2, 3]) {
    const result = await page.evaluate((turn) => window.imageCodecProbe.run({ operation: 'heic', fixture: `heic-rotate-${turn}.heic`, pixelLimit: 50_000_000 }), turn);
    assert.equal(result.kind, 'heic');
    assert.equal(result.width, turn % 2 ? 3024 : 4032);
    assert.equal(result.height, turn % 2 ? 4032 : 3024);
    // Samples in TL, TR, BR, BL order; HEIF irot is counterclockwise.
    for (let corner = 0; corner < 4; corner++) {
      const expected = baseline.samples[(corner + turn) % 4];
      result.samples[corner].forEach((value, channel) => assert.ok(Math.abs(value - expected[channel]) <= 4, `Rotation ${turn}, corner ${corner}, channel ${channel}`));
    }
    orientation.push({ turn, ...result });
  }
  const malformed = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'heic', fixture: 'damaged.heic', pixelLimit: 50_000_000 }));
  assert.equal(malformed.kind, 'error');
  const disguised = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'heic', fixture: 'png-disguised.jpg', pixelLimit: 50_000_000 }));
  assert.equal(disguised.kind, 'error');
  const refused = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'heic', fixture: 'synthetic-48mp.heic', pixelLimit: 16_000_000 }));
  assert.equal(refused.kind, 'error');
  assert.equal(refused.code, 'limit-before-codec');
  const underreported = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'heic', fixture: 'underreported.heic', pixelLimit: 1_000_000 }));
  assert.equal(underreported.kind, 'error', 'Inconsistent ispe/grid must never produce successful output');
  assert.equal(underreported.code, 'codec', 'Record the observed candidate failure; header dimensions are not authoritative allocation bounds');
  const cancel = await page.evaluate(() => window.imageCodecProbe.cancelDecode('synthetic-48mp.heic'));
  assert.equal(cancel.terminated, true);
  assert.equal(cancel.lateResults, 0);
  const timedOut = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'spin', fixture: '' }, 100));
  assert.equal(timedOut.kind, 'error');
  assert.equal(timedOut.code, 'timeout');
  // Exercise visible mobile-lab controls, not only the automation API.
  assert.equal(await page.locator('#stop').count(), 1, 'Missing manual cancellation control');
  await page.evaluate(() => { window.pendingProbe = window.imageCodecProbe.run({ operation: 'spin', fixture: '' }); });
  await page.locator('#stop').click();
  assert.equal((await page.evaluate(() => window.pendingProbe)).code, 'cancelled');
  await page.locator('#encode').check();
  await page.locator('#heic').click();
  await page.waitForFunction(() => !document.querySelector('#download-jpeg').disabled, { timeout: 60_000 });
  const jpegDownload = page.waitForEvent('download');
  await page.locator('#download-jpeg').click();
  const jpegFile = await jpegDownload;
  assert.equal(jpegFile.suggestedFilename(), 'image-lab-result.jpg');
  const downloadedJpeg = await readFile(await jpegFile.path());
  assert.deepEqual(imageMeta(downloadedJpeg), { width: 4032, height: 3024, type: 'jpg' });
  const zipDownload = page.waitForEvent('download');
  await page.locator('#download-zip').click();
  const zipFile = await zipDownload;
  assert.equal(zipFile.suggestedFilename(), 'image-lab-result.zip');
  const zipEntry = unzipSync(await readFile(await zipFile.path()))['image-lab-result.jpg'];
  assert.deepEqual(Buffer.from(zipEntry), downloadedJpeg);
  await page.locator('#clear').click();
  assert.equal(await page.locator('#download-jpeg').isDisabled(), true);
  assert.equal(await page.locator('#download-zip').isDisabled(), true);
  await page.locator('#encode').uncheck();
  await page.locator('#local').setInputFiles({ name: 'PRIVATE_FILENAME_MARKER.heic', mimeType: 'image/jpeg', buffer: await readFile(new URL('../../output/image-codecs/fixtures/synthetic-12mp.heic', import.meta.url)) });
  await page.waitForFunction(() => document.querySelector('#result').textContent.includes('HEIF candidate'));
  await page.locator('#decode-local').click();
  await page.waitForFunction(() => document.querySelector('#result').textContent.includes('"kind": "heic"'));
  await page.locator('#local').setInputFiles({ name: 'PRIVATE_FILENAME_MARKER.heic', mimeType: 'image/heic', buffer: await readFile(new URL('../../output/image-codecs/fixtures/quadrants.jpg', import.meta.url)) });
  await page.waitForFunction(() => document.querySelector('#result').textContent.includes('JPEG bytes'));
  await page.locator('#decode-local').click();
  assert.match(await page.locator('#result').textContent(), /choose-raw-heic/);
  assert.equal(requests.some((url) => url.includes('PRIVATE_FILENAME_MARKER')), false);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await page.locator('#clear').click();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/zero-image-lab-mobile.png', fullPage: true });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(requests.every((url) => url.startsWith('http://127.0.0.1:4325/image-lab/')), true, 'Off-origin or broken base resource');
  const manifest = JSON.parse(await readFile(new URL('../../output/image-codecs/fixtures/manifest.json', import.meta.url), 'utf8'));
  const evidence = { date: new Date().toISOString(), browser: browser.version(), device: 'desktop automated Chrome; no iPhone or Safari evidence',
    host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, memoryBytes: totalmem() },
    codec, archive, archiveRefused, heic, orientation, malformed, disguised, refused, underreported, cancel, timedOut, errors, requests: [...new Set(requests)], fixtureManifest: manifest,
    memory: 'Not measured: timings and RGBA byte count are not process peak memory or release limits.' };
  const replacementPath = process.env.IMAGE_CODEC_DROP_IN_BINDING || process.env.IMAGE_CODEC_HEIF_BINDING;
  if (replacementPath) {
    const bytes = await readFile(replacementPath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (dropIn) {
      assert.ok(requests.some((url) => url.endsWith(`/assets/${dropIn.module}`)));
      const served = await page.request.get(`http://127.0.0.1:4325/image-lab/assets/${dropIn.module}`);
      assert.equal(createHash('sha256').update(await served.body()).digest('hex'), sha256);
    }
    evidence.replacement = { bytes: bytes.length, sha256, ...dropIn };
    if (dropIn) {
      const location = new URL('../../output/image-codecs/rebuild/build-manifest.json', import.meta.url);
      const compiled = JSON.parse(await readFile(location, 'utf8'));
      assert.equal(compiled.artifact.sha256, sha256, 'Replacement must match the recorded source build');
      compiled.browserReplacementVerified = true;
      compiled.browserEvidence = 'results-rebuilt.json';
      await writeFile(location, JSON.stringify(compiled, null, 2) + '\n');
    }
  }
  await writeFile(new URL(`../../output/image-codecs/${replacementPath ? 'results-rebuilt' : 'results'}.json`, import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ codec, archive, archiveRefused, heic, orientation, malformed, disguised, refused, underreported, cancel, timedOut, errors }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
