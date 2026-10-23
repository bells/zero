import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
const ready = async (page: Page, route: string) => { await page.goto(route); await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true'); };
for (const locale of ['zh', 'en'] as const) {
  const prefix = locale === 'zh' ? '' : 'en/';
  for (const slug of ['', 'timestamp', 'json', 'base64', 'diff', 'image-converter', 'image-watermark', 'image-compressor', 'markdown']) {
    test(`${locale} web ${slug || 'directory'}: rendered, accessible, responsive and no-script guidance`, async ({ page, browser }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const route = `/${prefix}tools/${slug ? `${slug}/` : ''}`;
      await ready(page, route);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/Zero/);
      for (const theme of ['light', 'dark']) {
        await page.locator('[data-theme]').selectOption(theme);
        const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(a11y.violations).toEqual([]);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mkdir('output/screenshots/web-tools', { recursive: true });
      for (const width of [1440, 768, 720, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const targets = await page.locator('.wt button:visible, .wt select:visible, .wt summary:visible, .wt-breadcrumb a:visible').evaluateAll((elements) => elements.map((item) => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height })));
        for (const target of targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
        if (width === 1440 || width === 390) await page.screenshot({ path: `output/screenshots/web-tools/${locale}-${slug || 'directory'}-${width}.png`, fullPage: true });
      }
      await page.getByRole('link', { name: locale === 'zh' ? 'Switch to English' : '切换为中文', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale === 'zh' ? 'en/' : ''}tools/${slug ? `${slug}/` : ''}$`));
      const context = await browser.newContext({ javaScriptEnabled: false });
      const staticPage = await context.newPage();
      await staticPage.goto(`http://127.0.0.1:4321${route}`);
      await expect(staticPage.locator('noscript .wt-notice')).toBeVisible();
      await expect(staticPage.locator('noscript .wt-notice')).toContainText('JavaScript');
      if (slug) {
        await expect(staticPage.locator('.wt-guidance[aria-labelledby="usage"]')).toBeVisible();
        await expect(staticPage.locator('.wt-guidance[aria-labelledby="agent-usage"]')).toBeVisible();
      } else {
        await expect(staticPage.locator('.wt-guidance')).toBeVisible();
      }
      await expect(staticPage.locator('.wt-cta')).toContainText(locale === 'zh' ? '尚未内置桌面版' : 'not currently built into');
      await expect(staticPage.locator(slug ? '.wt-breadcrumb a' : '.wt-directory a')).toHaveCount(slug ? 2 : 8);
      await context.close();
      expect(errors).toEqual([]);
    });
  }
}
test('tools search supports keyboard, empty state, focus restore and no shortcut outside tools', async ({ page }) => {
  await ready(page, '/tools/');
  const open = page.locator('[data-open-search]');
  await open.focus(); await page.keyboard.press('Control+k');
  await expect(page.locator('dialog')).toBeVisible();
  await page.locator('[data-search-input]').fill('no such tool');
  await expect(page.locator('[data-search-empty]')).toBeVisible();
  await page.locator('[data-search-input]').fill('JSON');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-search-name]:visible')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(open).toBeFocused();
  await open.click(); await page.locator('[data-search-input]').fill('JSON'); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tools\/json\/$/);
  await ready(page, '/tools/json/');
  await page.getByRole('button', { name: '启用增强编辑' }).click(); await expect(page.locator('.cm-content')).toBeVisible();
  await page.keyboard.press('Control+k'); await expect(page.locator('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.cm-content')).toBeFocused();
  await page.goto('/'); await page.keyboard.press('Control+k'); await expect(page.locator('dialog')).toHaveCount(0);
});
test('live timestamp freezes copy values and explicit interpretation is correct', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } } }); });
  await ready(page, '/en/tools/timestamp/');
  await page.locator('[data-pause]').click();
  const frozen = await page.locator('[data-clock="milliseconds"]').textContent();
  await page.clock.runFor(3000);
  await expect(page.locator('[data-clock="milliseconds"]')).toHaveText(frozen ?? '');
  await page.locator('[data-copy-clock="milliseconds"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-copied', frozen ?? '');
  await page.locator('[data-source]').fill('2026-10-14 20:24:00');
  await expect(page.locator('[data-row="4"]')).toHaveText('2026-10-14T12:24:00.000Z');
  await page.locator('[data-zone]').selectOption('UTC');
  await expect(page.locator('[data-row="4"]')).toHaveText('2026-10-14T20:24:00.000Z');
  await page.locator('[data-source]').fill('0'); await expect(page.locator('[data-status]')).toContainText('Choose seconds');
  await page.locator('[data-unit]').selectOption('seconds'); await expect(page.locator('[data-row="4"]')).toHaveText('1970-01-01T00:00:00.000Z');
  await page.locator('[data-source]').fill('2026-02-30 00:00:00'); await expect(page.locator('[data-time-results]')).toBeHidden();
  await page.locator('[data-pause]').click(); await expect(page.locator('[data-clock="milliseconds"]')).not.toHaveText(frozen ?? '');
});
test('JSON preserves source, diagnoses errors, enhances folding and offers honest clipboard fallback', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('denied'); } } }); });
  const requests: string[] = []; page.on('request', (request) => requests.push(request.url()));
  await ready(page, '/en/tools/json/');
  expect(requests.some((url) => /\/editor\./.test(url))).toBe(false);
  const input = '{"id":9007199254740993,"a":1,"a":2,"n":1e+03}';
  await page.locator('[data-source]').fill(input); await page.locator('[data-operation="format"]').click();
  await expect(page.locator('[data-output]')).toHaveValue(/9007199254740993/);
  await page.locator('[data-copy-output]').click(); await expect(page.locator('[data-manual-copy]')).toBeVisible();
  await expect(page.locator('[data-status]')).toContainText('Automatic copy is unavailable');
  await page.locator('[data-operation="compact"]').click(); await expect(page.locator('[data-output]')).toHaveValue(input);
  await page.locator('[data-source]').fill('{\r\n "👋": }'); await page.locator('[data-operation="validate"]').click();
  await expect(page.locator('[data-status]')).toContainText('line 2, column'); await expect(page.locator('[data-copy-output]')).toBeDisabled();
  await page.locator('[data-source]').fill(JSON.stringify(input)); await page.locator('[data-operation="unwrap"]').click();
  await expect(page.locator('[data-source]')).toHaveValue(input);
  await page.locator('[data-editor-enable]').click(); await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('9007199254740993');
  await page.locator('[data-theme]').selectOption('dark');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.locator('[data-operation="format"]').click(); await expect(page.locator('[data-output]')).toHaveValue(/\n/);
  await page.locator('[data-clear]').click(); await expect(page.locator('.cm-content')).toHaveText(''); await expect(page.locator('[data-output]')).toHaveValue('');
});
test('JSON enhancement failure leaves basic editing and operations available', async ({ page }) => {
  await page.route('**/editor.*.js', (route) => route.abort());
  await ready(page, '/en/tools/json/'); await page.locator('[data-source]').fill('[1,2]'); await page.locator('[data-editor-enable]').click();
  await expect(page.locator('[data-status]')).toContainText('Enhanced editing is unavailable');
  await expect(page.locator('[data-source]')).toHaveValue('[1,2]');
  await page.locator('[data-operation="format"]').click(); await expect(page.locator('[data-output]')).toHaveValue(/\n/);
});
test('Unicode text and URL components round trip without rendering markup', async ({ page }) => {
  await ready(page, '/en/tools/base64/');
  const text = '你好，Zero 👋 <script>window.pwned=true</script>';
  await page.locator('[data-source]').fill(text); await page.locator('[data-codec-action="encode"]').click();
  await expect(page.locator('[data-copy-output]')).toBeEnabled();
  const encoded = await page.locator('[data-output]').inputValue();
  await page.locator('[data-source]').fill(encoded); await page.locator('[data-codec-action="decode"]').click();
  await expect(page.locator('[data-output]')).toHaveValue(text);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
  await page.locator('[data-mode]').selectOption('url'); await page.locator('[data-source]').fill('a+b'); await page.locator('[data-codec-action="decode"]').click();
  await expect(page.locator('[data-output]')).toHaveValue('a+b');
  await page.locator('[data-source]').fill('%ZZ'); await page.locator('[data-codec-action="decode"]').click();
  await expect(page.locator('[data-status]')).toContainText('Invalid URL'); await expect(page.locator('[data-output]')).toHaveValue('');
});
test('local images preview, round trip and release Blob URLs on clear or mode switch', async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreate = URL.createObjectURL.bind(URL); const originalRevoke = URL.revokeObjectURL.bind(URL);
    const active = new Set<string>();
    URL.createObjectURL = (blob) => { const url = originalCreate(blob); active.add(url); document.documentElement.dataset.blobs = String(active.size); return url; };
    URL.revokeObjectURL = (url) => { active.delete(url); document.documentElement.dataset.blobs = String(active.size); originalRevoke(url); };
  });
  await ready(page, '/en/tools/base64/'); await page.locator('[data-mode]').selectOption('image');
  const buffer = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#08717d' } }).png().toBuffer();
  await page.locator('[data-file]').setInputFiles({ name: 'safe.png', mimeType: 'image/png', buffer });
  await page.locator('[data-codec-action="encode"]').click(); await expect(page.locator('[data-image-area]')).toBeVisible();
  await expect(page.locator('[data-image-info]')).toContainText('8 × 6');
  const encoded = await page.locator('[data-output]').inputValue(); expect(Buffer.from(encoded.split(',')[1] ?? '', 'base64')).toEqual(buffer);
  const downloadPromise = page.waitForEvent('download'); await page.locator('[data-image-download]').click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe('zero-image.png');
  const downloaded = await download.path(); expect(await readFile(downloaded!)).toEqual(buffer);
  await page.locator('[data-clear]').click(); await expect(page.locator('html')).toHaveAttribute('data-blobs', '0');
  await page.locator('[data-source]').fill(encoded); await page.locator('[data-codec-action="decode"]').click(); await expect(page.locator('[data-image-area]')).toBeVisible();
  await page.locator('[data-mode]').selectOption('text'); await expect(page.locator('html')).toHaveAttribute('data-blobs', '0');
  await page.locator('[data-mode]').selectOption('image'); await page.locator('[data-source]').fill('data:image/svg+xml;base64,PHN2Zy8+'); await page.locator('[data-codec-action="decode"]').click();
  await expect(page.locator('[data-status]')).toContainText('Invalid image'); await expect(page.locator('[data-image-area]')).toBeHidden();
});
test('synthetic private marker never enters network, site storage, URL or console', async ({ page }) => {
  const marker = 'PRIVATE_TOOL_FIXTURE_20261014'; const observed: string[] = [];
  page.on('request', (request) => observed.push(request.url(), request.postData() ?? ''));
  page.on('console', (message) => observed.push(message.text()));
  await ready(page, '/en/tools/json/'); await page.locator('[data-theme]').selectOption('dark');
  await page.locator('[data-source]').fill(JSON.stringify({ secret: marker })); await page.locator('[data-operation="format"]').click();
  await expect(page.locator('[data-output]')).toHaveValue(new RegExp(marker));
  await page.locator('[data-open-search]').click(); await page.locator('[data-search-input]').fill(marker); await page.keyboard.press('Escape');
  const storage = await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, dbs: await indexedDB.databases() }));
  expect(storage).toEqual({ local: { 'zero.web-tools.theme': 'dark' }, session: {}, dbs: [] });
  expect(observed.join(' ')).not.toContain(marker); expect(page.url()).not.toContain(marker);
  expect(observed.filter((url) => url.startsWith('http') && !url.startsWith('http://127.0.0.1:4321'))).toEqual([]);
  await page.reload(); await expect(page.locator('[data-source]')).toHaveValue('');
});
test('blocked preference storage falls back to system appearance', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw Error('denied'); } }); });
  await page.emulateMedia({ colorScheme: 'dark' }); await ready(page, '/tools/');
  await expect(page.locator('body')).toHaveAttribute('data-theme-resolved', 'dark');
});
test('worker timeout and cancellation do not leave stale copyable results', async ({ page }) => {
  await page.addInitScript(() => { const NativeWorker = Worker; window.Worker = class extends NativeWorker { postMessage() {} }; });
  await ready(page, '/en/tools/json/'); await page.locator('[data-source]').fill('{"a":1}');
  await page.locator('[data-operation="format"]').click(); await page.locator('[data-cancel]').click();
  await expect(page.locator('[data-status]')).toContainText('cancelled'); await expect(page.locator('[data-copy-output]')).toBeDisabled();
  await page.locator('[data-operation="format"]').click(); await expect(page.locator('[data-status]')).toContainText('5 seconds', { timeout: 7000 });
  await expect(page.locator('[data-cancel]')).toBeHidden(); await expect(page.locator('[data-source]')).toHaveValue('{"a":1}');
});
test('tool under preview base path keeps scripts, language route and noindex working', async ({ page }) => {
  await page.route('http://127.0.0.1:4321/zero-preview/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice('/zero-preview/'.length);
    await route.fulfill({ path: `output/fixtures/preview/${path}${path.endsWith('/') ? 'index.html' : ''}` });
  });
  await ready(page, '/zero-preview/tools/timestamp/'); await page.locator('[data-source]').fill('1700000000');
  await expect(page.locator('[data-row="4"]')).toHaveText('2023-11-14T22:13:20.000Z');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click(); await expect(page).toHaveURL(/\/zero-preview\/en\/tools\/timestamp\/$/);
});
test('CTA follows catalog availability and never invents a platform download', async ({ page }) => {
  await ready(page, '/en/tools/json/');
  await expect(page.locator('.wt-cta a')).toHaveAttribute('href', '/en/download/');
  await expect(page.locator('.wt-cta a')).toContainText('Explore the trial');
  await page.route('http://127.0.0.1:4321/en/tools/json/', (route) => route.fulfill({ path: 'output/fixtures/catalog/en/tools/json/index.html' }));
  await ready(page, '/en/tools/json/');
  await expect(page.locator('.wt-cta a')).toContainText('Download Zero');
  await expect(page.locator('.wt-cta a')).toHaveAttribute('href', '/en/download/');
  await expect(page.locator('a[href*="/releases/download/"]')).toHaveCount(0);
});
test('worker construction failure keeps the original input and enables retry', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class extends Worker { constructor(url: string | URL, options?: WorkerOptions) { super(url, options); this.terminate(); throw Error('worker unavailable'); } }; });
  await ready(page, '/en/tools/json/'); await page.locator('[data-source]').fill('[1,2]'); await page.locator('[data-operation="format"]').click();
  await expect(page.locator('[data-status]')).toContainText('Local processing failed');
  await expect(page.locator('[data-source]')).toHaveValue('[1,2]'); await expect(page.locator('[data-operation="format"]')).toBeEnabled();
});
