import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

const note = '# 中文文档\n\nHello **Zero** [link](https://example.com)\n\n| 名称 | 数量 |\n| --- | --- |\n| 工具 | 8 |\n\n- [x] 完成\n\n```ts\nconst value = 42;\n```';
async function open(page: import('@playwright/test').Page, locale = 'en') {
  await page.goto(`${locale === 'en' ? '/en' : ''}/tools/markdown/`);
  await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true');
}
test('local GFM preview, inert HTML, source and standalone HTML downloads', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await page.locator('[data-md-source]').fill(note + '\n<script>window.MARKDOWN_INJECTED=1</script>');
  await expect(page.locator('[data-md-preview] h1')).toHaveText('中文文档');
  await expect(page.locator('[data-md-preview] table')).toContainText('工具');
  await expect(page.locator('[data-md-preview] .hljs-keyword')).toBeVisible();
  expect(await page.evaluate(() => 'MARKDOWN_INJECTED' in window)).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('markdown')))).toEqual([]);
  const mdPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download Markdown', exact: true }).click();
  const md = await mdPromise; expect(md.suggestedFilename()).toMatch(/\.md$/); expect(await readFile((await md.path())!, 'utf8')).toContain('中文文档');
  const htmlPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const html = await htmlPromise; const text = await readFile((await html.path())!, 'utf8');
  expect(text).toContain('<!doctype html>'); expect(text).toContain('<style>'); expect(text).toContain('中文文档'); expect(text).not.toContain('<script>');
  expect(errors).toEqual([]);
});
test('PDF directly downloads selectable-text document and font is lazy', async ({ page }) => {
  test.setTimeout(90000); const fonts: string[] = []; page.on('request', request => { if (request.url().includes('/markdown-fonts/')) fonts.push(request.url()); });
  await open(page); expect(fonts).toEqual([]);
  await page.locator('[data-md-source]').fill(note);
  await expect(page.locator('[data-md-preview] h1')).toHaveText('中文文档');
  expect(fonts).toEqual([]);
  const promise = page.waitForEvent('download', { timeout: 80000 });
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const pdf = await promise; const bytes = await readFile((await pdf.path())!);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/); expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(fonts.length).toBeGreaterThan(0);
  await pdf.saveAs('/tmp/zero-markdown-browser.pdf');
});
test('external images never request before consent and missing images require an export decision', async ({ page }) => {
  const external: string[] = []; page.on('request', request => { if (request.url().includes('private-image.example')) external.push(request.url()); });
  await page.route('https://private-image.example/**', route => route.abort());
  await open(page); await page.locator('[data-md-source]').fill('# Images\n\n![private](https://private-image.example/photo.png)');
  await expect(page.locator('[data-md-preview] [data-markdown-image]')).toBeVisible(); expect(external).toEqual([]);
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  await expect(page.locator('[data-md-cancel]')).toBeHidden(); expect(external).toEqual([]);
  await page.locator('[data-md-images] summary').click(); await page.getByRole('button', { name: 'Load image', exact: true }).click();
  await expect.poll(() => external.length).toBe(1); await expect(page.locator('[data-status]')).toContainText(/CORS|could not|failed/i);
});
test('draft opt-in, restore, deletion and replacement cancellation preserve the document', async ({ page }) => {
  await open(page); await page.locator('[data-md-source]').fill('private draft');
  await page.locator('[data-md-draft]').check(); await expect(page.locator('[data-md-draft-status]')).toContainText('Saved');
  await page.reload(); await expect(page.locator('[data-md-source]')).toHaveValue('');
  await page.getByRole('button', { name: 'Restore local draft', exact: true }).click(); await expect(page.locator('[data-md-source]')).toHaveValue('private draft');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Clear document', exact: true }).click(); await expect(page.locator('[data-md-source]')).toHaveValue('private draft');
  await page.getByRole('button', { name: 'Delete local draft', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('zero.markdown.draft.v1'))).toBeNull(); await expect(page.locator('[data-md-source]')).toHaveValue('private draft');
});
test('enhanced editing, toolbar undo, find and global search remain available', async ({ page }) => {
  await open(page); await page.locator('[data-md-source]').fill('hello'); await page.getByRole('button', { name: 'Enable enhanced editing', exact: true }).click();
  await expect(page.locator('[data-md-editor] .cm-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Bold', exact: true }).click(); await expect(page.locator('[data-md-source]')).toHaveValue(/\*\*/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('[data-md-source]')).toHaveValue('hello');
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click(); await expect(page.locator('.cm-search')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k'); await expect(page.locator('[data-search-dialog]')).toBeVisible(); await expect(page.locator('[data-search-name]')).toHaveCount(9);
});
test('narrow bilingual themes, focus and accessibility', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 }); await open(page, 'zh');
  await expect(page.locator('[data-markdown]')).toHaveAttribute('data-mode', 'source');
  await page.locator('[data-md-source]').fill(note); await page.locator('[data-md-mode="preview"]').click(); await expect(page.locator('[data-md-preview] h1')).toBeVisible();
  await page.locator('[data-theme]').selectOption('dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const results = await new AxeBuilder({ page }).include('[data-markdown]').analyze(); expect(results.violations).toEqual([]);
  await page.screenshot({ path: '/tmp/zero-markdown-mobile.png', fullPage: false });
});

test('image cancellation can retry in the same document and standalone HTML embeds only local bytes', async ({ page }) => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#08717d' } }).png().toBuffer();
  let requests = 0; let release: (() => void) | undefined;
  await page.route('https://image.example/photo.png', async route => {
    requests++;
    if (requests === 1) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
  });
  await open(page); await page.locator('[data-md-source]').fill('# Image\n\n![photo](https://image.example/photo.png)');
  await expect(page.locator('[data-md-preview] [data-markdown-image]')).toBeVisible(); await page.locator('[data-md-images] summary').click();
  await page.getByRole('button', { name: 'Load image', exact: true }).click(); await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click(); release?.();
  await page.getByRole('button', { name: 'Load image', exact: true }).click();
  await expect(page.locator('[data-md-preview] img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const html = await promise; const content = await readFile((await html.path())!, 'utf8');
  expect(content).toContain('data:image/png;base64,'); expect(content).not.toContain('https://image.example');
});

test('imports reject malformed UTF-8 and preserve current edits', async ({ page }) => {
  await open(page); await page.locator('[data-md-source]').fill('retained');
  await page.locator('[data-md-file]').setInputFiles({ name: 'broken.md', mimeType: 'text/markdown', buffer: Buffer.from([0xff]) });
  await expect(page.locator('[data-status]')).toContainText('UTF-8'); await expect(page.locator('[data-md-source]')).toHaveValue('retained');
  await page.locator('[data-md-file]').setInputFiles({ name: 'large.md', mimeType: 'text/markdown', buffer: Buffer.alloc(1048577, 65) });
  await expect(page.locator('[data-status]')).toContainText('1 MiB'); await expect(page.locator('[data-md-source]')).toHaveValue('retained');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-md-file]').setInputFiles({ name: 'valid.markdown', mimeType: 'text/markdown', buffer: Buffer.from('\ufeff# Imported\r\n\r\nBody') });
  await expect(page.locator('[data-md-source]')).toHaveValue('# Imported\n\nBody'); await expect(page.locator('[data-md-preview] h1')).toHaveText('Imported');
});

test('cancelled PDF jobs cannot download or cancel a newer export', async ({ page }) => {
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  let fontRequests = 0;
  await page.route('**/markdown-fonts/*.ttf', async route => { fontRequests++; await new Promise(resolve => setTimeout(resolve, 150)); await route.continue().catch(() => {}); });
  await open(page); await page.locator('[data-md-source]').fill('# Old document'); await expect(page.locator('[data-md-preview] h1')).toHaveText('Old document');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click(); await expect.poll(() => fontRequests).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const html = await promise; expect(html.suggestedFilename()).toMatch(/\.html$/);
  await expect(page.locator('[data-md-cancel]')).toBeHidden(); expect(downloads).toHaveLength(1);
});

test('worker timeout preserves basic editing, source downloads and retry', async ({ page }) => {
  await page.route('**/markdown-worker-*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = () => {};' }));
  await open(page); await page.locator('[data-md-source]').fill('retained after timeout');
  await expect(page.locator('[data-status]')).toContainText('timed out', { timeout: 8000 });
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download Markdown', exact: true }).click();
  const md = await promise; expect(await readFile((await md.path())!, 'utf8')).toBe('retained after timeout');
  await page.unroute('**/markdown-worker-*.js'); await page.locator('[data-md-source]').fill('# Recovered'); await expect(page.locator('[data-md-preview] h1')).toHaveText('Recovered');
});

test('fullscreen keeps search and exit focus, and printing uses only the complete document', async ({ page }) => {
  await page.addInitScript(() => { window.print = () => {}; });
  await open(page); await page.locator('[data-md-source]').fill('# Full document\n\nPrint body');
  await expect(page.locator('[data-md-preview] h1')).toHaveText('Full document');
  await page.getByRole('button', { name: 'Expand workspace', exact: true }).click();
  await expect(page.locator('[data-markdown]')).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('ControlOrMeta+k'); await expect(page.locator('[data-search-dialog]')).toBeVisible(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand workspace', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('[data-md-print-body]')).toContainText('Print body');
  await expect(page.locator('[data-md-print-body]')).not.toContainText('Download PDF');
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(page.locator('[data-md-print-body]')).toHaveCount(0);
});

test('restoring identical source revokes image consent and cancels the previous PDF snapshot', async ({ page }) => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
  await page.route('https://image.example/photo.png', route => route.fulfill({ body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }));
  let fonts = 0; await page.route('**/markdown-fonts/*.ttf', async route => { fonts++; await new Promise(resolve => setTimeout(resolve, 100)); await route.continue().catch(() => {}); });
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  await open(page); const text = '# Same document\n\n![photo](https://image.example/photo.png)';
  await page.locator('[data-md-source]').fill(text); await page.locator('[data-md-draft]').check();
  await expect(page.locator('[data-md-draft-status]')).toContainText('Saved');
  await expect(page.locator('[data-md-preview] [data-markdown-image]')).toBeVisible(); await page.locator('[data-md-images] summary').click(); await page.getByRole('button', { name: 'Load image', exact: true }).click();
  await expect(page.locator('[data-md-preview] img')).toBeVisible();
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click(); await expect.poll(() => fonts).toBeGreaterThan(0);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Restore local draft', exact: true }).click();
  await expect(page.locator('[data-md-preview] [data-markdown-image]')).toBeVisible();
  await expect(page.locator('[data-md-preview] img')).toHaveCount(0); await expect(page.locator('[data-md-cancel]')).toBeHidden();
  await expect(page.locator('[data-md-source]')).toHaveValue(text); expect(downloads).toEqual([]);
});

test('the first toolbar action preserves a selection made in the basic editor', async ({ page }) => {
  await open(page); await page.locator('[data-md-source]').fill('one selected word');
  await page.locator('[data-md-source]').evaluate((input: HTMLTextAreaElement) => { input.focus(); input.setSelectionRange(4, 12); });
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(page.locator('[data-md-source]')).toHaveValue('one **selected** word');
});

test('enhanced Markdown syntax remains readable in dark appearance', async ({ page }) => {
  await open(page); await page.locator('[data-md-source]').fill('# Heading\n\n[Link](https://example.com) and **bold** text.');
  await page.locator('[data-theme]').selectOption('dark'); await page.getByRole('button', { name: 'Enable enhanced editing', exact: true }).click();
  await expect(page.locator('[data-md-editor] .cm-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click();
  const result = await new AxeBuilder({ page }).include('[data-md-editor]').withTags(['wcag2aa']).analyze();
  expect(result.violations).toEqual([]);
});

test('clearing removes a clipboard-denial fallback as well as the editor source', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }));
  await open(page); await page.locator('[data-md-source]').fill('PRIVATE_MANUAL_COPY');
  await page.getByRole('button', { name: 'Copy source', exact: true }).click(); await expect(page.locator('[data-manual-value]')).toHaveValue('PRIVATE_MANUAL_COPY');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Clear document', exact: true }).click();
  await expect(page.locator('[data-manual-copy]')).toBeHidden(); await expect(page.locator('[data-manual-value]')).toHaveValue('');
});
