import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { createHash } from 'node:crypto';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';
import { createLabServer } from './server.mjs';
import { sampleBrowserRss } from './process-memory.mjs';

// Measure only an isolated, task-owned browser tree, never the user's normal profile.
const output = new URL('../../output/image-codecs/resources/', import.meta.url);
await mkdir(output, { recursive: true });
const materialRoot = new URL('../../output/image-codecs/license-materials/', import.meta.url);
const materials = JSON.parse(await readFile(new URL('manifest.json', materialRoot), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('browser-experiment/manifest.json', materialRoot), 'utf8'));
const hostArtifacts = materials.materials.filter((entry) => entry.path.startsWith('browser-experiment/'));
for (const entry of hostArtifacts) {
  const bytes = await readFile(new URL(entry.path, materialRoot));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Changed experiment artifact ${entry.path}`);
}
const server = await createLabServer({ port: 4328 });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4328, '127.0.0.1', resolve); });
const origin = 'http://127.0.0.1:4328/image-lab/';
const evidence = {
  date: new Date().toISOString(), host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, memoryBytes: totalmem() },
  method: { metric: 'sum of per-process RSS from macOS ps, KiB converted to bytes, dedicated Chrome root and current descendants only', targetIntervalMs: 100, safetyStopRssBytes: 3 * 1024 ** 3, forcedGc: false,
    limitations: ['Sampled maximum can miss shorter-lived peaks.', 'Summed RSS may double-count shared mappings; it is not physical footprint, JS heap or allocated-pixel bytes.', 'Worker termination and URL release do not guarantee immediate RSS return or prove a memory leak.', 'Desktop Chrome headless measurements do not establish Safari/iPhone limits.', 'ZIP verification deliberately decompresses and compares all entries; its memory cost is included separately from ZIP creation timing.'] },
  verifiedLibrary: materials.replacement, fixtureManifest: manifest, experiments: [], complete: false,
};
async function scenario(name, operation) {
  let chrome, browser, monitor;
  const record = { name, phases: [], samples: [], sampleErrors: [], browserErrors: [], requests: [], complete: false };
  evidence.experiments.push(record);
  try {
    chrome = await launch({ chromeFlags: ['--headless=new', '--disable-background-networking', '--disable-extensions'], handleSIGINT: false, logLevel: 'silent' });
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
    evidence.browserVersion = browser.version();
    let phase = 'startup', stopped = false, inFlight, timer;
    const start = performance.now();
    async function take() {
      const samplingStart = performance.now();
      try {
        const sample = await sampleBrowserRss(chrome.pid);
        if (!sample.rootAlive) throw new Error('Dedicated browser root exited');
        record.samples.push({ atMs: performance.now() - start, phase, samplingMs: performance.now() - samplingStart, ...sample });
        if (sample.rssBytes > evidence.method.safetyStopRssBytes) { record.safetyStop = true; chrome.kill(); throw new Error('Experimental monitor RSS ceiling exceeded'); }
      } catch (error) { record.sampleErrors.push({ atMs: performance.now() - start, phase, code: error.code || 'sample-failed', message: error.message }); }
    }
    async function tick() { await take(); if (!stopped) timer = setTimeout(() => { inFlight = tick(); }, evidence.method.targetIntervalMs); }
    inFlight = tick();
    monitor = { async stop() { stopped = true; clearTimeout(timer); await inFlight; } };
    const context = browser.contexts()[0];
    const page = await context.newPage();
    page.on('pageerror', (error) => record.browserErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') record.browserErrors.push(message.text()); });
    page.on('request', (request) => record.requests.push(request.url()));
    page.on('response', (response) => { if (response.status() >= 400) record.browserErrors.push(`HTTP ${response.status()}`); });
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(window.imageCodecProbe));
    assert.match(await page.title(), /图片编解码实验/);
    assert.ok(await page.locator('h1').isVisible());
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    async function stage(label, action) {
      phase = label;
      const stageStart = performance.now();
      const first = record.samples.length;
      await take();
      const result = await action();
      await take();
      const samples = record.samples.slice(first).filter((sample) => sample.phase === label);
      const values = samples.map((sample) => sample.rssBytes);
      const summary = { name: label, hostElapsedMs: performance.now() - stageStart, samples: values.length, firstRssBytes: values[0], sampledPeakRssBytes: Math.max(...values), lastRssBytes: values.at(-1), result };
      record.phases.push(summary);
      return result;
    }
    const idle = (label, ms) => stage(label, async () => { await delay(ms); return { observationMs: ms }; });
    await idle('page-baseline', 1000);
    await operation({ page, stage, idle });
    assert.equal(record.browserErrors.length, 0, record.browserErrors.join('\n'));
    assert.equal(record.sampleErrors.length, 0, 'OS process sampler failed; incomplete metrics cannot pass');
    assert.ok(record.requests.every((url) => url.startsWith(origin) || url.startsWith(`blob:${new URL(origin).origin}/`)), 'Unexpected off-origin resource');
    record.requests = [...new Set(record.requests)];
    record.complete = true;
    console.log(JSON.stringify({ scenario: name, phases: record.phases.map(({ name, sampledPeakRssBytes, lastRssBytes }) => ({ name, sampledPeakRssBytes, lastRssBytes })) }));
  } catch (error) { record.error = error.message; throw error; }
  finally {
    await monitor?.stop();
    await browser?.close();
    chrome?.kill();
    await writeFile(new URL('chrome-process-rss.json', output), JSON.stringify(evidence, null, 2) + '\n');
  }
}
async function decode(page, fixture, timeoutMs = 60_000) {
  const result = await page.evaluate(({ fixture, timeoutMs }) => window.imageCodecProbe.run({ operation: 'heic', fixture, pixelLimit: 50_000_000 }, timeoutMs), { fixture, timeoutMs });
  assert.equal(result.kind, 'heic', JSON.stringify(result));
  assert.equal(result.pixels, fixture.includes('48mp') ? 48_771_072 : 12_192_768);
  return result;
}
async function clear(page) { await page.locator('#clear').click(); assert.equal(await page.locator('#download-jpeg').isDisabled(), true); }
try {
  for (const size of ['12mp', '48mp']) await scenario(`decode-${size}`, async ({ page, stage, idle }) => {
    for (const run of [1, 2]) {
      await stage(`decode-run-${run}`, () => decode(page, `synthetic-${size}.heic`));
      await idle(`after-run-${run}`, 2000);
    }
    await clear(page); await idle('after-clear', 5000);
  });
  await scenario('cancel-during-48mp', async ({ page, stage, idle }) => {
    await stage('active-decode-then-cancel', async () => {
      await page.evaluate(() => { window.resourcePending = window.imageCodecProbe.run({ operation: 'heic', fixture: 'synthetic-48mp.heic', pixelLimit: 50_000_000 }); });
      await page.waitForFunction(() => document.querySelector('#result').textContent.includes('primary-checked'));
      await delay(100);
      assert.equal(await page.locator('#stop').isEnabled(), true, 'Decode finished before the cancellation observation');
      const start = performance.now();
      await page.locator('#stop').click();
      const result = await page.evaluate(() => window.resourcePending);
      assert.equal(result.code, 'cancelled');
      return { ...result, hostCancelRoundTripMs: performance.now() - start };
    });
    await idle('after-cancel', 5000);
    await stage('recovery-12mp', () => decode(page, 'synthetic-12mp.heic'));
    await clear(page); await idle('after-clear', 5000);
  });
  await scenario('timeout-recovery', async ({ page, stage, idle }) => {
    await stage('cpu-loop-timeout', async () => {
      const result = await page.evaluate(() => window.imageCodecProbe.run({ operation: 'spin', fixture: '' }, 250));
      assert.equal(result.code, 'timeout'); return result;
    });
    await idle('after-timeout', 2000);
    await stage('recovery-12mp', () => decode(page, 'synthetic-12mp.heic'));
    await clear(page); await idle('after-clear', 5000);
  });
  for (const size of ['12mp', '48mp']) await scenario(`export-${size}`, async ({ page, stage, idle }) => {
    await page.locator('#encode').check();
    if (size === '48mp') await page.locator('#large').check();
    const result = await stage('decode-encode-zip', async () => {
      await page.locator(size === '48mp' ? '#heic48' : '#heic').click();
      await page.waitForFunction(() => !document.querySelector('#download-jpeg').disabled, null, { timeout: 65_000 });
      const value = JSON.parse(await page.locator('#result').textContent());
      assert.equal(value.kind, 'heic'); assert.ok(value.jpeg.bytes > 0); assert.ok(value.zip.bytes > value.jpeg.bytes); return value;
    });
    await idle('result-and-zip-retained', 5000);
    await stage('explicit-image-preview', async () => {
      await page.locator('#preview').click();
      await page.waitForFunction(() => document.querySelector('#image').naturalWidth > 0);
      return { width: result.width, height: result.height };
    });
    await idle('preview-and-results-retained', 2000);
    await clear(page); await idle('after-clear', 5000);
  });
  for (const [entries, entryMiB] of [[2, 8], [4, 16]]) await scenario(`archive-${entries * entryMiB}mib`, async ({ page, stage, idle }) => {
    await stage('allocate-store-zip-verify', async () => {
      const result = await page.evaluate(async ({ entries, entryBytes }) => {
        const value = await window.imageCodecProbe.run({ operation: 'archive', entries, entryBytes });
        if (value.kind !== 'archive') return value;
        window.resourceArchive = value.zip;
        return { ...value, zip: { bytes: value.zip.size, type: value.zip.type } };
      }, { entries, entryBytes: entryMiB * 1024 ** 2 });
      assert.equal(result.kind, 'archive'); assert.equal(result.roundTrip, true); return result;
    });
    await idle('archive-retained', 5000);
    await page.evaluate(() => { delete window.resourceArchive; });
    await clear(page); await idle('after-clear', 5000);
  });
  evidence.complete = true;
} finally {
  await writeFile(new URL('chrome-process-rss.json', output), JSON.stringify(evidence, null, 2) + '\n');
  await new Promise((resolve) => server.close(resolve));
}
console.log('Resource observations complete; no production limits inferred.');
