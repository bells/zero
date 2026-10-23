import { test, expect, type Locator } from '@playwright/test';

const gutter = (source: Locator) => source.locator('..').locator('.wt-input-gutter');
for (const prefix of ['', '/en']) {
  for (const tool of ['timestamp', 'json', 'base64', 'diff', 'markdown']) {
    test(`${prefix || 'zh'} ${tool}: default input line numbers track edits and clear`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${prefix}/tools/${tool}/`);
      await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true');
      if (tool === 'timestamp') await page.locator('[data-time-mode="batch"]').click();
      const sources = page.locator('textarea[data-numbered]:not([readonly])');
      for (const source of await sources.all()) {
        await expect(gutter(source)).toHaveText('1');
        await source.fill('first\n\n第三行\n');
        await expect(gutter(source)).toHaveText('1\n2\n3\n4');
        await source.press('End');
        await source.press('Enter');
        await expect(gutter(source)).toHaveText('1\n2\n3\n4\n5');
      }
      const source = sources.first();
      if (tool === 'markdown' && !prefix) {
        await source.fill('# 默认显示行号\n\n编辑 Markdown，左侧按原始行编号。\n\n- 输入与预览保持同步\n- 支持中文和 English');
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.locator('[data-theme]').selectOption(width === 1440 ? 'light' : 'dark');
          await source.scrollIntoViewIfNeeded();
          await source.focus();
          await page.screenshot({ path: `/tmp/zero-line-numbers-markdown-${width}.png` });
        }
      }
      const clear = tool === 'timestamp' ? '[data-batch-clear]' : tool === 'diff' ? '[data-diff-clear]' : tool === 'markdown' ? '[data-md-clear]' : '[data-clear]';
      if (tool === 'markdown') page.once('dialog', dialog => dialog.accept());
      await page.locator(clear).click();
      await expect(source).toHaveValue('');
      await expect(gutter(source)).toHaveText('1');
      expect(errors).toEqual([]);
    });
  }
}

test('line gutters stay aligned and bounded during scrolling, resizing and enhancement', async ({ page }) => {
  await page.goto('/tools/json/');
  await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true');
  const source = page.locator('[data-source]');
  await source.fill(Array.from({ length: 1000 }, (_, index) => `${index}: ${'long text '.repeat(20)}`).join('\n'));
  await source.evaluate((field: HTMLTextAreaElement) => { field.scrollTop = 2400; field.scrollLeft = 200; field.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => gutter(source).innerText()).toMatch(/^10[01]\n/);
  expect((await gutter(source).innerText()).split('\n').length).toBeLessThan(30);
  const alignment = await source.evaluate((field: HTMLTextAreaElement) => {
    const label = field.parentElement!.querySelector<HTMLElement>('.wt-input-gutter > div')!;
    const first = Number(label.textContent!.split('\n')[0]);
    const style = getComputedStyle(field);
    const expected = field.getBoundingClientRect().top + field.clientTop + parseFloat(style.paddingTop) + (first - 1) * parseFloat(style.lineHeight) - field.scrollTop;
    return Math.abs(label.getBoundingClientRect().top - expected);
  });
  expect(alignment).toBeLessThan(1);
  await source.evaluate((field: HTMLTextAreaElement) => { field.style.height = '450px'; });
  await expect.poll(async () => Math.abs((await gutter(source).boundingBox())!.height - (await source.boundingBox())!.height)).toBeLessThan(1);
  await source.fill('{"hello":true}');
  await page.locator('[data-operation="format"]').click();
  await expect(page.locator('[data-output]')).toHaveValue('{\n  "hello": true\n}');
  await expect(gutter(page.locator('[data-output]'))).toHaveText('1\n2\n3');
  await page.locator('[data-editor-enable]').click();
  await expect(page.locator('.cm-lineNumbers')).toBeVisible();
  await expect(gutter(source)).toBeHidden();
});

test('diff import, examples and swap refresh line numbers, with taller responsive inputs', async ({ page }) => {
  await page.goto('/tools/diff/');
  await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true');
  const before = page.locator('[data-diff-source="before"]');
  const after = page.locator('[data-diff-source="after"]');
  await page.locator('[data-diff-example]').click();
  await expect(gutter(before)).toHaveText('1\n2\n3\n4');
  await expect(gutter(after)).toHaveText('1\n2\n3');
  await page.locator('[data-diff-file="before"]').setInputFiles({ name: 'example.txt', mimeType: 'text/plain', buffer: Buffer.from('first\nsecond') });
  await expect(gutter(before)).toHaveText('1\n2');
  await page.locator('[data-diff-swap]').click();
  await expect(gutter(before)).toHaveText('1\n2\n3');
  await expect(gutter(after)).toHaveText('1\n2');
  expect((await before.boundingBox())!.height).toBeGreaterThanOrEqual(360);
  await before.fill('first\nsecond\nthird');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect((await before.boundingBox())!.height).toBe(width < 720 ? 280 : 360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const theme of ['light', 'dark']) {
      await page.locator('[data-theme]').selectOption(theme);
      await before.scrollIntoViewIfNeeded();
      await before.focus();
      if (width !== 320) await page.screenshot({ path: `/tmp/zero-line-numbers-diff-${width}-${theme}.png` });
    }
  }
});
