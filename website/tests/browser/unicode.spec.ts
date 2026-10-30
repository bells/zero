import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const locale of ['zh', 'en']) {
  const prefix = locale === 'en' ? '/en' : '';
  test(locale + ' Unicode converts, invalidates, reports errors and exports literal full text', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(prefix + '/tools/unicode/');
    await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true');
    const source = page.locator('[data-source]'), output = page.locator('[data-output]');
    await page.locator('[data-unicode-example="decode"]').click();
    await expect(source).not.toHaveValue('');
    await expect(output).toHaveValue('');
    await expect(page.locator('[data-copy-output]')).toBeDisabled();
    await source.fill('用户：\\u4F60\\u597D，\\uD83D\\uDE00 / \\u{1f600}');
    await page.locator('[data-unicode-action="unicode-decode"]').click();
    await expect(output).toHaveValue('用户：你好，😀 / 😀');
    await source.fill('A 你');
    await expect(output).toHaveValue('');
    await expect(page.locator('[data-unicode-download]')).toBeDisabled();
    await page.locator('[data-unicode-ascii]').check();
    await page.locator('[data-unicode-action="unicode-encode"]').click();
    await expect(output).toHaveValue('\\u0041\\u0020\\u4F60');
    await page.locator('[data-unicode-ascii]').uncheck();
    await expect(output).toHaveValue('');
    await source.fill('😀\na\\u12G4');
    await page.locator('[data-unicode-action="unicode-decode"]').click();
    await expect(page.locator('[data-status]')).toContainText(locale === 'zh' ? '第 2 行，第 2 列' : 'line 2, column 2');
    await expect(source).toHaveValue('😀\na\\u12G4');
    await expect(page.locator('[data-copy-output]')).toBeDisabled();
    await source.fill('\\u003Cscript>alert(1)\\u003C/script>\\u000D\\u000A\\u0000');
    await page.locator('[data-unicode-action="unicode-decode"]').click();
    await expect(page.locator('[data-unicode-download]')).toBeEnabled();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('[data-unicode-download]').click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(download.suggestedFilename()).toBe('zero-unicode.txt');
    expect(Buffer.concat(chunks)).toEqual(Buffer.from('<script>alert(1)</script>\r\n\0'));
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
    await page.locator('[data-copy-output]').click();
    await expect(page.locator('[data-manual-copy]')).toBeVisible();
    await page.locator('[data-clear]').click();
    await expect(source).toHaveValue('');
    await expect(output).toHaveValue('');
    await expect(page.locator('[data-manual-copy]')).toBeHidden();
    await expect(page.locator('[data-unicode-download]')).toBeDisabled();
    expect(await page.locator('input[type="file"]').count()).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('Unicode remains accessible in both themes, narrow layout and zoom; search finds its page', async ({ page }) => {
  await page.goto('/tools/?category=development');
  await page.locator('[data-directory-search]').fill('Unicode 转文字');
  await expect(page.locator('.wt-directory-row:visible')).toHaveCount(1);
  await page.locator('.wt-directory-row:visible').click();
  await expect(page).toHaveURL(/\/tools\/unicode\/$/);
  await page.locator('[data-source]').fill('你好 😀');
  await page.locator('[data-unicode-action="unicode-encode"]').click();
  await expect(page.locator('[data-output]')).toHaveValue('\\u4F60\\u597D \\uD83D\\uDE00');
  for (const theme of ['light', 'dark']) {
    await page.locator('[data-theme]').selectOption(theme);
    for (const width of [1440, 720, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 320) {
        const input = await page.locator('[data-source]').boundingBox(), output = await page.locator('[data-output]').boundingBox();
        expect(output!.y).toBeGreaterThan(input!.y + input!.height);
      }
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.setViewportSize({ width: 640, height: 1000 });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('[data-unicode-ascii]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-unicode-ascii]')).toBeChecked();
});

test('Unicode cancels old workers, ignores late replies, times out and recovers after failure', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    type Port = { onmessage: ((event: MessageEvent<unknown>) => void) | null; onerror: ((event: ErrorEvent) => void) | null; job?: { requestId: number }; terminated: boolean };
    const ports: Port[] = [];
    Object.assign(window, { unicodePorts: ports });
    class HeldWorker {
      onmessage = null;
      onerror = null;
      job?: { requestId: number };
      terminated = false;
      constructor() { ports.push(this); }
      postMessage(job: { requestId: number }) { this.job = job; }
      terminate() { this.terminated = true; }
    }
    window.Worker = HeldWorker as unknown as typeof Worker;
  });
  await page.goto('/en/tools/unicode/');
  const source = page.locator('[data-source]'), action = page.locator('[data-unicode-action="unicode-decode"]');
  await source.fill('first');
  await action.click();
  await expect(page.locator('[data-cancel]')).toBeVisible();
  await source.fill('second');
  await action.click();
  await page.evaluate(() => {
    const ports = (window as unknown as Window & { unicodePorts: { onmessage: ((event: MessageEvent<unknown>) => void) | null; job: { requestId: number }; terminated: boolean }[] }).unicodePorts;
    if (!ports[0]!.terminated) throw new Error('Old worker was not terminated');
    for (const [index, text] of ['STALE', 'current'].entries()) ports[index]!.onmessage?.(new MessageEvent('message', { data: { requestId: ports[index]!.job.requestId, result: { ok: true, value: { text } } } }));
  });
  await expect(page.locator('[data-output]')).toHaveValue('current');
  await action.click();
  await page.locator('[data-cancel]').click();
  await expect(page.locator('[data-status]')).toContainText('cancelled');
  await expect(source).toHaveValue('second');
  await action.click();
  await page.clock.fastForward(5001);
  await expect(page.locator('[data-status]')).toContainText('5 seconds');
  await expect(page.locator('[data-unicode-download]')).toBeDisabled();
  await action.click();
  await page.evaluate(() => {
    const ports = (window as unknown as Window & { unicodePorts: { onerror: ((event: ErrorEvent) => void) | null }[] }).unicodePorts;
    ports.at(-1)!.onerror?.(new ErrorEvent('error', { cancelable: true }));
  });
  await expect(page.locator('[data-status]')).toContainText('failed');
  await action.click();
  await page.evaluate(() => {
    const port = (window as unknown as Window & { unicodePorts: { onmessage: ((event: MessageEvent<unknown>) => void) | null; job: { requestId: number } }[] }).unicodePorts.at(-1)!;
    port.onmessage?.(new MessageEvent('message', { data: { requestId: port.job.requestId, result: { ok: true, value: { text: 'recovered' } } } }));
  });
  await expect(page.locator('[data-output]')).toHaveValue('recovered');
});

test('Unicode releases download URLs and private fields on clear and page exit', async ({ page }) => {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    const revoked: string[] = [];
    Object.assign(window, { unicodeRevoked: revoked });
    URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
  });
  await page.goto('/en/tools/unicode/');
  await page.locator('[data-source]').fill('\\u4F60');
  await page.locator('[data-unicode-action="unicode-decode"]').click();
  await expect(page.locator('[data-output]')).toHaveValue('你');
  const downloaded = page.waitForEvent('download');
  await page.locator('[data-unicode-download]').click();
  await downloaded;
  await page.locator('[data-clear]').click();
  expect(await page.evaluate(() => (window as unknown as Window & { unicodeRevoked: string[] }).unicodeRevoked.length)).toBe(1);
  await page.locator('[data-source]').fill('PRIVATE_SOURCE');
  await page.locator('[data-unicode-action="unicode-encode"]').click();
  await expect(page.locator('[data-output]')).toHaveValue('PRIVATE_SOURCE');
  await page.goto('/tools/');
  await page.goBack();
  await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-source]')).toHaveValue('');
  await expect(page.locator('[data-output]')).toHaveValue('');
  await expect(page.locator('[data-unicode-download]')).toBeDisabled();
});

test('Unicode worker works under preview base with noindex and an English counterpart', async ({ page }) => {
  await page.route('http://127.0.0.1:4321/zero-preview/**', async route => {
    const path = new URL(route.request().url()).pathname.slice('/zero-preview/'.length);
    await route.fulfill({ path: 'output/fixtures/preview/' + path + (path.endsWith('/') ? 'index.html' : '') });
  });
  await page.goto('/zero-preview/tools/unicode/');
  await page.locator('[data-source]').fill('\\u{1F600}');
  await page.locator('[data-unicode-action="unicode-decode"]').click();
  await expect(page.locator('[data-output]')).toHaveValue('😀');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click();
  await expect(page).toHaveURL(/\/zero-preview\/en\/tools\/unicode\/$/);
});
