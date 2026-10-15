import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
test('batch preserves failed rows, exports all pages and invalidates after changes', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('denied'); } } }); });
  await page.goto('/en/tools/timestamp/');
  await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true');
  await page.locator('[data-time-mode="batch"]').click();
  await page.locator('[data-batch-source]').fill('1700000000\n\nnot-a-date\n1700000000000');
  await page.locator('[data-batch-run]').click();
  await expect(page.locator('[data-batch-summary]')).toContainText('2 succeeded');
  await expect(page.locator('[data-batch-rows] tr')).toHaveCount(3);
  await page.locator('[data-batch-copy]').click();
  await expect(page.locator('[data-manual-copy]')).toBeVisible();
  const exported = JSON.parse(await page.locator('[data-manual-value]').inputValue());
  expect(exported.rows.map((row: { line: number }) => row.line)).toEqual([1, 3, 4]);
  expect(exported.rows[1].error.code).toBe('date');
  const pendingDownload = page.waitForEvent('download'); await page.locator('[data-batch-download]').click();
  const download = await pendingDownload; expect(download.suggestedFilename()).toBe('zero-timestamp-batch.json');
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(exported);
  await page.locator('[data-batch-source]').fill(Array(101).fill('1700000000').join('\n'));
  await expect(page.locator('[data-batch-copy]')).toBeDisabled();
  await expect(page.locator('[data-manual-copy]')).toBeHidden();
  await page.locator('[data-batch-run]').click(); await expect(page.locator('[data-batch-rows] tr')).toHaveCount(100);
  await page.locator('[data-batch-next]').click(); await expect(page.locator('[data-batch-rows] tr')).toHaveCount(1);
  await page.locator('[data-batch-copy]').click(); expect(JSON.parse(await page.locator('[data-manual-value]').inputValue()).rows).toHaveLength(101);
  await page.locator('[data-time-mode="single"]').click(); await page.locator('[data-source]').fill('0'); await page.locator('[data-unit]').selectOption('seconds');
  await expect(page.locator('[data-row="4"]')).toHaveText('1970-01-01T00:00:00.000Z');
  await page.locator('[data-time-mode="batch"]').click(); await expect(page.locator('[data-batch-source]')).not.toHaveValue('');
  await expect(page.locator('[data-batch-download]')).toBeDisabled();
});

test('batch has responsive bilingual accessible controls and stable strict settings', async ({ page }) => {
  for (const locale of ['', 'en/']) {
    await page.goto(`/${locale}tools/timestamp/`); await page.locator('[data-time-mode="batch"]').click();
    await page.locator('[data-batch-source]').fill('-1\n2026-10-15 08:00:00'); await page.locator('[data-batch-unit]').selectOption('milliseconds');
    await page.locator('[data-batch-zone]').selectOption('UTC'); await page.locator('[data-batch-run]').click();
    await expect(page.locator('[data-batch-rows]')).toContainText('1969-12-31T23:59:59.999Z');
    await expect(page.locator('[data-batch-rows]')).toContainText('2026-10-15T08:00:00.000Z');
    for (const theme of ['light', 'dark']) {
      await page.locator('[data-theme]').selectOption(theme);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
    for (const width of [1440, 720, 390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: `/tmp/zero-batch-${locale ? 'en' : 'zh'}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `/tmp/zero-batch-${locale ? 'en' : 'zh'}-mobile.png`, fullPage: true });
    await page.locator('[data-batch-zone]').selectOption('UTC+08:00'); await expect(page.locator('[data-batch-download]')).toBeDisabled();
  }
});

test('batch timeout, cancel and clear reject late results and preserve source', async ({ page }) => {
  await page.addInitScript(() => { class SilentWorker { onmessage = null; onerror = null; postMessage() {} terminate() {} } Object.defineProperty(window, 'Worker', { value: SilentWorker }); });
  await page.goto('/en/tools/timestamp/'); await page.locator('[data-time-mode="batch"]').click(); await page.locator('[data-batch-source]').fill('1700000000');
  await page.locator('[data-batch-run]').click(); await expect(page.locator('[data-status]')).toContainText('5 seconds', { timeout: 7000 });
  await expect(page.locator('[data-batch-source]')).toHaveValue('1700000000'); await expect(page.locator('[data-batch-download]')).toBeDisabled();
  await page.locator('[data-batch-run]').click(); await page.locator('[data-batch-cancel]').click();
  await expect(page.locator('[data-status]')).toContainText('cancelled');
  await page.locator('[data-batch-clear]').click(); await expect(page.locator('[data-batch-source]')).toHaveValue('');
});

test('batch content stays local and clear or page exit releases actual workers and export URLs', async ({ page }) => {
  const marker = 'PRIVATE_BATCH_20261015'; const observations: string[] = [];
  page.on('request', (request) => observations.push(request.url() + (request.postData() ?? '')));
  page.on('console', (message) => observations.push(message.text()));
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; let active = 0;
    window.Worker = class extends NativeWorker { constructor(url: string | URL, options?: WorkerOptions) { super(url, options); active++; document.documentElement.dataset.workers = String(active); } terminate() { super.terminate(); active--; document.documentElement.dataset.workers = String(active); } };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL); const urls = new Set<string>();
    URL.createObjectURL = (value) => { const url = create(value); urls.add(url); document.documentElement.dataset.blobs = String(urls.size); return url; };
    URL.revokeObjectURL = (url) => { urls.delete(url); document.documentElement.dataset.blobs = String(urls.size); revoke(url); };
  });
  await page.goto('/en/tools/timestamp/'); await page.locator('[data-time-mode="batch"]').click();
  await page.locator('[data-batch-source]').fill(`1700000000\n${marker}`); await page.locator('[data-batch-run]').click(); await expect(page.locator('[data-batch-download]')).toBeEnabled();
  const pending = page.waitForEvent('download'); await page.locator('[data-batch-download]').click(); await pending;
  await expect(page.locator('html')).toHaveAttribute('data-workers', '0'); await expect(page.locator('html')).toHaveAttribute('data-blobs', '1');
  const storage = await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, dbs: (await indexedDB.databases()).map(db => db.name) }));
  expect(storage).toEqual({ local: {}, session: {}, dbs: [] }); expect(observations.join('\n')).not.toContain(marker); expect(page.url()).not.toContain(marker);
  await page.locator('[data-batch-clear]').click(); await expect(page.locator('html')).toHaveAttribute('data-blobs', '0');
  await page.locator('[data-batch-source]').fill(marker);
  const sourceAfterExit = await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide')); return (document.querySelector('[data-batch-source]') as HTMLTextAreaElement).value; });
  expect(sourceAfterExit).toBe(''); await expect(page.locator('[data-batch-copy]')).toBeDisabled();
});
