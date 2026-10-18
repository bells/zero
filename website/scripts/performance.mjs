import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const origin = process.env.WEBSITE_ORIGIN || 'http://127.0.0.1:4321';
const routes = ['/', '/en/', '/download/', '/en/download/', '/tools/snap/', '/guide/install/', '/en/guide/install/', '/en/faq/', ...['', 'en/'].flatMap((locale) => ['tools/', 'tools/timestamp/', 'tools/json/', 'tools/base64/', 'tools/diff/', 'tools/image-converter/', 'tools/image-watermark/', 'tools/image-compressor/'].map((route) => `/${locale}${route}`))];
await mkdir('output/performance', { recursive: true });
const browser = await chromium.launch({ channel: process.env.WEBSITE_BROWSER_CHANNEL || undefined });
const browserVersion = browser.version();
const measurements = [];
const enhanced = {};
try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const resources = [];
    page.on('response', (response) => resources.push(response));
    await page.goto(`${origin}${route}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    let firstViewportBytes = 0;
    let initialJsGzip = 0;
    const inlineScripts = await page.locator('script:not([src])').evaluateAll((elements) => elements.filter((element) => !element.type || ['module', 'text/javascript', 'application/javascript'].includes(element.type)).map((element) => element.textContent || ''));
    for (const script of inlineScripts) initialJsGzip += gzipSync(script).length;
    for (const response of resources) {
      const body = await response.body();
      const kind = response.request().resourceType();
      if (kind === 'script') initialJsGzip += gzipSync(body).length;
      if (['document', 'script', 'stylesheet', 'image', 'font'].includes(kind)) firstViewportBytes += body.length;
    }
    measurements.push({ route, initialJsGzip, firstViewportBytes, jsBudgetPass: initialJsGzip <= 50 * 1024, transferBudgetPass: firstViewportBytes <= 1024 * 1024 });
    await page.close();
  }
  const toolPage = await browser.newPage();
  await toolPage.goto(`${origin}/en/tools/json/`);
  await toolPage.locator('[data-web-tools][data-ready="true"]').waitFor();
  const enhancedResponses = [];
  toolPage.on('response', (response) => { if (response.request().resourceType() === 'script') enhancedResponses.push(response); });
  const editorStart = Date.now();
  await toolPage.locator('[data-editor-enable]').click();
  await toolPage.locator('.cm-content').waitFor();
  enhanced.editorReadyMs = Date.now() - editorStart;
  enhanced.editorScriptGzip = 0;
  for (const response of enhancedResponses) enhanced.editorScriptGzip += gzipSync(await response.body()).length;
  await toolPage.close();
  const stressPage = await browser.newPage();
  await stressPage.goto(`${origin}/en/tools/json/`);
  await stressPage.locator('[data-web-tools][data-ready="true"]').waitFor();
  const maximumInput = JSON.stringify({ payload: 'x'.repeat(1024 * 1024 - JSON.stringify({ payload: '' }).length) });
  enhanced.jsonInputBytes = Buffer.byteLength(maximumInput);
  await stressPage.locator('[data-source]').fill(maximumInput);
  const processingStart = Date.now();
  await stressPage.locator('[data-operation="compact"]').click();
  await stressPage.locator('[data-copy-output]:enabled').waitFor();
  enhanced.maximumJsonMs = Date.now() - processingStart;
  if (await stressPage.locator('[data-output]').inputValue() !== maximumInput) throw new Error('Maximum-size JSON did not preserve input');
  await stressPage.locator('[data-clear]').click();
  if (await stressPage.locator('[data-output]').inputValue() !== '') throw new Error('Clear retained maximum-size output');
  await stressPage.close();
  const batchPage = await browser.newPage();
  await batchPage.goto(`${origin}/en/tools/timestamp/`);
  await batchPage.locator('[data-time-mode="batch"]').click();
  await batchPage.locator('[data-batch-source]').fill(Array(1000).fill('1700000000').join('\n'));
  const batchStart = Date.now(); await batchPage.locator('[data-batch-run]').click();
  await batchPage.locator('[data-batch-download]:enabled').waitFor();
  enhanced.batch1000Ms = Date.now() - batchStart;
  if (await batchPage.locator('[data-batch-rows] tr').count() !== 100) throw new Error('Batch rendering exceeded page size');
  await batchPage.close();
  const diffPage = await browser.newPage();
  await diffPage.goto(`${origin}/en/tools/diff/`);
  await diffPage.locator('[data-web-tools][data-ready="true"]').waitFor();
  const algorithmResponses = []; diffPage.on('response', response => { if (response.request().resourceType() === 'script') algorithmResponses.push(response); });
  await diffPage.locator('[data-diff-source="before"]').fill('a'.repeat(10000));
  await diffPage.locator('[data-diff-source="after"]').fill('b'.repeat(10000));
  const diffStart = Date.now(); await diffPage.locator('[data-diff-compare]').click();
  await diffPage.locator('[data-diff-result]:visible').waitFor();
  enhanced.diffLongLineMs = Date.now() - diffStart;
  enhanced.diffAlgorithmGzip = 0;
  enhanced.diffAlgorithmMeasurement = 'Observed executable URLs; worker bodies unavailable through page response are reread from the same local preview URL.';
  for (const response of algorithmResponses) {
    let body;
    try { body = await response.body(); }
    catch {
      if (new URL(response.url()).origin !== new URL(origin).origin) throw new Error('Unexpected external algorithm resource');
      const resource = await diffPage.request.get(response.url());
      if (!resource.ok()) throw new Error(`Cannot measure algorithm resource: ${response.url()}`);
      body = await resource.body();
    }
    enhanced.diffAlgorithmGzip += gzipSync(body).length;
  }
  if (!await diffPage.locator('[data-diff-inline]').isVisible()) throw new Error('Long lines did not report inline fallback');
  // Native automation paste stalls on this many lines; seed the bulk fixture, then probe real keyboard interaction.
  await diffPage.evaluate(({ before, after }) => {
    for (const [side, value] of Object.entries({ before, after })) {
      const input = document.querySelector(`[data-diff-source="${side}"]`);
      input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { before: Array.from({length:20000},(_,i)=>'before-'+i).join('\n'), after: Array.from({length:20000},(_,i)=>'after-'+i).join('\n') });
  enhanced.diffStressInput = '20,000 lines per side seeded with DOM value + input event after native automation fill timed out; actual keyboard, compare, cancel and search actions follow.';
  const editStart = Date.now(); await diffPage.locator('[data-diff-source="before"]').focus(); await diffPage.keyboard.press('End'); await diffPage.keyboard.type('x'); enhanced.diffEditMs = Date.now() - editStart;
  await diffPage.locator('[data-diff-compare]').click();
  const cancelStart=Date.now(); await diffPage.locator('[data-diff-cancel]').click();
  await diffPage.locator('[data-diff-compare]:enabled').waitFor(); enhanced.diffCancelMs=Date.now()-cancelStart;
  if (await diffPage.locator('[data-diff-result]').isVisible()) throw new Error('Cancelled comparison retained results');
  const navigationStart=Date.now(); await diffPage.locator('[data-open-search]').click(); await diffPage.keyboard.press('Escape'); enhanced.diffNavigationMs=Date.now()-navigationStart;
  if (enhanced.diffCancelMs > 1000 || enhanced.diffNavigationMs > 1000) throw new Error('Heavy comparison blocked cancellation/navigation');
  await diffPage.close();


  const imagePage = await browser.newPage();
  await imagePage.goto(`${origin}/en/tools/image-converter/`);
  await imagePage.locator('[data-web-tools][data-ready="true"]').waitFor();
  const imageResponses = [];
  imagePage.on('response', response => imageResponses.push(response));
  await imagePage.locator('[data-image-files]').setInputFiles('tests/fixtures/image-codecs/synthetic-12mp.heic');
  await imagePage.locator('[data-image-results] article').waitFor();
  if (imageResponses.some(response => /libheif|wasm/.test(response.url()))) throw new Error('Import automatically loaded an image codec');
  const imageStart = Date.now();
  await imagePage.locator('[data-image-run]').click();
  await imagePage.locator('[data-image-download]').waitFor({timeout:65000});
  enhanced.image12MPFirstMs = Date.now() - imageStart;
  enhanced.imageInteractionResources = [];
  for (const response of [...imageResponses]) {
    if (!['script', 'fetch', 'other'].includes(response.request().resourceType())) continue;
    let body;
    try { body = await response.body(); }
    catch { const resource = await imagePage.request.get(response.url()); if (!resource.ok()) throw new Error('Cannot read local image resource'); body = await resource.body(); }
    enhanced.imageInteractionResources.push({ path:new URL(response.url()).pathname, bytes:body.length, gzipBytes:gzipSync(body).length });
  }
  enhanced.imageInteractionResourceBytes = enhanced.imageInteractionResources.reduce((sum, resource) => sum + resource.bytes, 0);
  enhanced.image12MPResult = await imagePage.locator('[data-image-results]').innerText();
  await imagePage.locator('[data-image-clear]').click();
  if (await imagePage.locator('[data-image-download]').count()) throw new Error('Image clear retained output downloads');
  await imagePage.locator('[data-image-files]').setInputFiles('tests/fixtures/image-codecs/synthetic-12mp.heic');
  await imagePage.locator('[data-image-results] article').waitFor();
  const subsequentStart = Date.now(); await imagePage.locator('[data-image-run]').click();
  await imagePage.locator('[data-image-download]').waitFor({timeout:65000});
  enhanced.image12MPSubsequentMs = Date.now() - subsequentStart;
  await imagePage.locator('[data-image-quality]').fill('74');
  await imagePage.locator('[data-image-run]').click();
  const imageCancelStart = Date.now(); await imagePage.locator('[data-image-cancel]').click();
  await imagePage.locator('[data-image-run]:enabled').waitFor();
  enhanced.imageCancelMs = Date.now() - imageCancelStart;
  if (await imagePage.locator('[data-image-download]').count()) throw new Error('Image cancel restored an obsolete download');
  await imagePage.locator('[data-image-clear]').click();
  enhanced.imageReleaseEvidence = 'Browser downloads and queue clear; lifecycle tests assert worker termination and Blob URL revocation. OS process-memory reclamation is a separate device gate.';
  await imagePage.close();

} finally { await browser.close(); }
const chrome = await launch({ chromeFlags: ['--headless', '--disable-extensions'], logLevel: 'silent' });
const reports = [];
try {
  for (const route of routes) {
    const result = await lighthouse(`${origin}${route}`, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility'], formFactor: 'mobile', screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 1, disabled: false } });
    if (!result) throw new Error(`No Lighthouse report for ${route}`);
    const lhr = result.lhr;
    const scores = { route, performance: Math.round(lhr.categories.performance.score * 100), accessibility: Math.round(lhr.categories.accessibility.score * 100), lcpMs: lhr.audits['largest-contentful-paint'].numericValue, cls: lhr.audits['cumulative-layout-shift'].numericValue };
    reports.push(scores);
    await writeFile(`output/performance/${route.replaceAll('/', '-') || 'home'}.json`, result.report);
  }
} finally { chrome.kill(); }
const lock = await readFile('pnpm-lock.yaml', 'utf8');
const summary = { capturedAt: new Date().toISOString(), node: process.version, browserVersion, platform: process.platform, architecture: process.arch, protocol: 'Local production preview; Lighthouse mobile simulated throttling, 390x844, DPR 1; Lighthouse resets storage per route; transfer budget uses uncompressed response bodies conservatively; JS gzip includes inline and external executable scripts', lighthouse: '13.5.0', lockfilePresent: Boolean(lock.length), measurements, reports, enhanced };
await writeFile('output/performance/summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (measurements.some((m) => !m.jsBudgetPass || !m.transferBudgetPass) || reports.some((r) => r.performance < 95 || r.accessibility < 95 || r.lcpMs > 2500 || r.cls > 0.1)) process.exitCode = 1;
