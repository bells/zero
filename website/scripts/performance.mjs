import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const origin = process.env.WEBSITE_ORIGIN || 'http://127.0.0.1:4321';
const routes = ['/', '/en/', '/download/', '/en/download/', '/tools/snap/', '/guide/install/', '/en/guide/install/', '/en/faq/', ...['', 'en/'].flatMap((locale) => ['tools/', 'tools/timestamp/', 'tools/json/', 'tools/base64/'].map((route) => `/${locale}${route}`))];
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
