import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
const origin = process.env.WEBSITE_ORIGIN || 'http://127.0.0.1:4321';
const server = await chromium.launchServer({ channel: process.env.WEBSITE_BROWSER_CHANNEL || 'chrome' });
const browser = await chromium.connect(server.wsEndpoint());
const chromePid = server.process().pid;
let peakRssKiB = 0;
function sampleRss() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([chromePid]); let changed = true;
  while (changed) { changed = false; for (const [pid, parent] of rows) if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true; } }
  const rss = rows.reduce((sum, [pid, , memory]) => sum + (descendants.has(pid) ? memory : 0), 0);
  peakRssKiB = Math.max(peakRssKiB, rss); return rss;
}
const sampler = setInterval(sampleRss, 200);
const results = { capturedAt: new Date().toISOString(), browser: browser.version(), node: process.version, platform: process.platform, memoryMethod: 'Sum of RSS for the dedicated Chrome process tree sampled every 200ms; shared memory may be counted repeatedly. This is not physical footprint or iPhone evidence.', inputMethod: 'Synthetic long source seeded through DOM value and a real input event; visible controls used for preview/export/cancel.', measurements: {} };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; const responses = [];
  page.on('response', response => { if (new URL(response.url()).origin === new URL(origin).origin) responses.push(response); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/en/tools/markdown/`); await page.locator('[data-web-tools][data-ready=true]').waitFor();
  await page.waitForLoadState('networkidle');
  results.initialPaths = [...new Set(responses.map(response => new URL(response.url()).pathname))];
  results.measurements.baselineRssKiB = sampleRss();
  const large = '# Bound\n\n' + 'word '.repeat(Math.floor((1048576 - 10) / 5));
  const parseStart = Date.now();
  await page.locator('[data-md-source]').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, large);
  await page.locator('[data-md-preview] h1').filter({ hasText: 'Bound' }).waitFor();
  results.measurements.maximumSourceBytes = Buffer.byteLength(large); results.measurements.maximumPreviewMs = Date.now() - parseStart;
  const pathological = '['.repeat(50_000) + 'bounded' + ']'.repeat(50_000);
  const pathologicalStart = Date.now();
  await page.locator('[data-md-source]').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, pathological);
  await page.waitForFunction(() => document.querySelector('[data-md-preview]')?.textContent?.includes('bounded') || /timed out|failed/.test(document.querySelector('[data-status]')?.textContent || ''));
  results.measurements.pathologicalSourceBytes = Buffer.byteLength(pathological);
  results.measurements.pathologicalMs = Date.now() - pathologicalStart;
  results.measurements.pathologicalResult = (await page.locator('[data-md-preview]').textContent()).includes('bounded') ? 'rendered' : await page.locator('[data-status]').textContent();
  const note = '# 中文文档\n\nSearchable Chinese text.\n\n| 名称 | Value |\n| --- | --- |\n' + Array.from({ length: 160 }, (_, i) => `| 中文行${i} | value ${i} |`).join('\n') + '\n\n```ts\n' + 'const value = 42;\n'.repeat(120) + '```';
  await page.locator('[data-md-source]').fill(note); await page.locator('[data-md-preview] h1').filter({ hasText: '中文文档' }).waitFor();
  for (const label of ['firstPdfMs', 'subsequentPdfMs']) {
    const start = Date.now(); const download = page.waitForEvent('download', { timeout: 80000 }); await page.locator('[data-md-download=pdf]').click(); const file = await download;
    results.measurements[label] = Date.now() - start; await file.saveAs(`/tmp/zero-markdown-${label}.pdf`);
  }
  const htmlPromise = page.waitForEvent('download'); await page.locator('[data-md-download=html]').click();
  await (await htmlPromise).saveAs('/tmp/zero-markdown-standalone.html');
  const standalone = await browser.newPage(); const standaloneNetwork = [];
  standalone.on('request', request => { if (/^https?:/.test(request.url())) standaloneNetwork.push(request.url()); });
  await standalone.goto('file:///tmp/zero-markdown-standalone.html');
  results.measurements.standaloneHtmlHeading = await standalone.locator('h1').textContent();
  results.measurements.standaloneHtmlTableRows = await standalone.locator('tbody tr').count();
  results.measurements.standaloneHtmlNetworkRequests = standaloneNetwork.length;
  if (standaloneNetwork.length || results.measurements.standaloneHtmlHeading !== '中文文档' || results.measurements.standaloneHtmlTableRows !== 160) throw new Error('Standalone HTML verification failed');
  await standalone.close();
  await page.screenshot({ path: '/tmp/zero-markdown-desktop.png', fullPage: false });
  await page.locator('[data-md-download=pdf]').click(); await page.locator('[data-md-cancel]:visible').waitFor();
  const cancelStart = Date.now(); await page.locator('[data-md-cancel]').click(); results.measurements.cancelMs = Date.now() - cancelStart;
  const navigateStart = Date.now(); await page.locator('[data-open-search]').click(); await page.keyboard.press('Escape'); results.measurements.searchAfterCancelMs = Date.now() - navigateStart;
  const png = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: '#08717d' } }).png().toBuffer();
  await page.route('https://synthetic-image.example/*.png', route => route.fulfill({ contentType: 'image/png', body: png, headers: { 'access-control-allow-origin': '*' } }));
  await page.locator('[data-md-source]').fill('# Bounded image\n\n![first](https://synthetic-image.example/first.png)\n\n![second](https://synthetic-image.example/second.png)');
  await page.locator('[data-md-images]:visible').waitFor(); await page.locator('[data-md-images] summary').click();
  const imageStart = Date.now(); await page.locator('[data-md-image-list] button').first().click(); await page.locator('[data-md-preview] img').waitFor();
  results.measurements.image16MPMs = Date.now() - imageStart; results.measurements.image16MPSourceBytes = png.length;
  await page.locator('[data-md-image-list] button').nth(1).click();
  await page.getByText('Image count, bytes or pixels exceed the limits.', { exact: true }).waitFor();
  results.measurements.second16MPRefused = await page.locator('[data-md-preview] img').count() === 1;
  await page.route('**/markdown-editor.*.js', route => route.abort());
  await page.locator('[data-md-enhance]').click();
  await page.getByText('Enhanced editing could not load. Basic editing remains available.', { exact: true }).waitFor();
  results.measurements.enhancementFailureBasicInputVisible = await page.locator('[data-md-source]').isVisible();
  await page.unroute('**/markdown-editor.*.js');
  // A failed module import is cached by the browser, so retry enhancement in a fresh document.
  await page.reload(); await page.locator('[data-web-tools][data-ready=true]').waitFor();
  const enhanceStart = Date.now(); await page.locator('[data-md-enhance]').click(); await page.locator('.cm-editor').waitFor();
  results.measurements.enhancementReadyMs = Date.now() - enhanceStart;
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-md-clear]').click();
  results.measurements.finalRssKiB = sampleRss(); results.measurements.peakRssKiB = peakRssKiB; results.pageErrors = errors;
  if (errors.length) throw new Error('Browser reported page errors');
  if (results.initialPaths.some(path => /markdown-(?:worker|editor|pdf)|markdown-fonts|pdfmake/.test(path))) throw new Error('Heavy Markdown assets loaded before interaction');
  const resources = new Map();
  for (const response of responses) {
    const path = new URL(response.url()).pathname;
    if (!/markdown|\/_astro\//.test(path) || !['script', 'fetch', 'font', 'other'].includes(response.request().resourceType()) || resources.has(path)) continue;
    let bytes;
    try { bytes = await response.body(); }
    catch { const reread = await page.request.get(response.url()); if (!reread.ok()) throw new Error(`Cannot measure local resource: ${path}`); bytes = await reread.body(); }
    resources.set(path, { path, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, initiallyLoaded: results.initialPaths.includes(path) });
  }
  results.resources = [...resources.values()];
  results.resourceMethod = 'Unique same-origin response bodies, uncompressed and gzip; worker bodies unavailable through response are reread locally. Includes interaction-triggered modules and fonts; not a network-cache transfer estimate.';
  results.isolation = [];
  for (const locale of ['', 'en/']) {
    for (const route of ['', 'tools/', ...['timestamp', 'json', 'base64', 'diff', 'image-converter', 'image-watermark', 'image-compressor'].map(slug => `tools/${slug}/`)]) {
      const isolated = await browser.newPage(); const paths = [];
      isolated.on('request', request => { paths.push(new URL(request.url()).pathname); });
      await isolated.goto(`${origin}/${locale}${route}`); await isolated.waitForLoadState('networkidle');
      const unexpected = paths.filter(path => /markdown-(?:workspace|worker|editor|pdf)|markdown-fonts|pdfmake/.test(path));
      results.isolation.push({ route: `/${locale}${route}`, unexpected }); await isolated.close();
      if (unexpected.length) throw new Error('Markdown dependency leaked to an unrelated route');
    }
  }
  await mkdir('output', { recursive: true }); await writeFile('output/markdown-resource.json', JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { clearInterval(sampler); await browser.close(); await server.close(); }
