import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';

for (const route of ['/', '/en/', '/download/', '/en/download/']) {
  test(`${route} is accessible, responsive and local`, async ({ page }) => {
    const failures: string[] = [];
    const external: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4321') && !request.url().startsWith('data:')) external.push(request.url()); });
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', route.startsWith('/en/') ? 'en' : 'zh-CN');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await mkdir('output/screenshots', { recursive: true });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `output/screenshots/${route.replaceAll('/', '-') || 'home'}-${width}.png`, fullPage: true });
      if (width === 1440 || width === 390) await page.screenshot({ path: `output/screenshots/${route.replaceAll('/', '-') || 'home'}-${width}-viewport.png` });
    }
    expect(failures).toEqual([]);
    expect(external).toEqual([]);
  });
}

test('language switching retains the tools anchor and download route', async ({ page }) => {
  await page.goto('/#tools');
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/#tools$/);
  await page.goto('/en/download/');
  await page.getByRole('link', { name: '切换为中文', exact: true }).click();
  await expect(page).toHaveURL(/\/download\/$/);
});

test('preview, tool selection and FAQ work with the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#content')).toBeFocused();
  const quick = page.getByRole('button', { name: '快速入口', exact: true });
  await quick.focus();
  await page.keyboard.press('Space');
  await expect(quick).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-preview]')).toHaveAttribute('data-mode', 'quick');
  await page.getByRole('link', { name: 'Awake 03', exact: true }).click();
  await expect(page.locator('[data-tool-row="zero.awake"]')).toHaveClass(/selected/);
  await page.locator('.faq-list summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.faq-list details').first()).toHaveAttribute('open', '');
});

test('download platform changes hide incompatible groups and never auto-download', async ({ page }) => {
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.goto('/download/');
  await expect(page.locator('[data-package-platform="macos"][data-package-profile="standard"]')).toBeVisible();
  await page.getByLabel('Windows', { exact: true }).check();
  await expect(page.locator('[data-package-platform="macos"]:visible')).toHaveCount(0);
  await expect(page.locator('[data-package-platform="windows"][data-package-profile="standard"]')).toBeVisible();
  await page.getByLabel('core / 无内置工具', { exact: true }).check();
  await expect(page.locator('[data-package-platform="windows"][data-package-profile="core"]')).toBeVisible();
  await expect(page.locator('a[href*="/releases/download/"]')).toHaveCount(0);
  await expect(page.locator('.package-group:visible')).toContainText('尚无公开安装包');
  expect(downloads).toBe(0);
});

test('without scripts both languages expose all package information and native details', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const route of ['/', '/en/']) {
    await page.goto(`http://127.0.0.1:4321${route}`);
    await expect(page.locator('.preview img')).toHaveCount(2);
    await expect(page.locator('#tools')).toBeVisible();
    await expect(page.locator('.hero-actions a').first()).toHaveAttribute('href', `${route}download/`);
  }
  for (const route of ['/download/', '/en/download/']) {
    await page.goto(`http://127.0.0.1:4321${route}`);
    await expect(page.locator('.package-group:visible')).toHaveCount(4);
    await expect(page.getByRole('link', { name: /GitHub Releases/ }).first()).toBeVisible();
  }
  await context.close();
});

test('reduced motion and 200 percent reflow keep controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 720, height: 500 });
  await page.goto('/en/');
  expect(await page.locator('.main-shot').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Quick access', exact: true }).click();
  await expect(page.locator('[data-preview]')).toHaveAttribute('data-mode', 'quick');
});

test('mobile navigation and touch targets remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByLabel('导航菜单').click();
  await page.getByRole('navigation', { name: '移动导航' }).getByRole('link', { name: '获取 Zero' }).click();
  await expect(page).toHaveURL(/\/download\/$/);
  const targets = await page.locator('button, summary, fieldset label').evaluateAll((elements) => elements.filter((element) => element.getClientRects().length > 0).map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  for (const target of targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
});

test('production metadata and missing pages provide usable routes', async ({ page }) => {
  await page.goto('/en/download/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.usezero.cn/en/download/');
  await expect(page.locator('link[hreflang="zh-CN"]')).toHaveAttribute('href', 'https://www.usezero.cn/download/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await page.goto('/404.html');
  await expect(page.getByRole('link', { name: '回到首页', exact: false })).toHaveAttribute('href', '/');
});

test('isolated public-package fixtures preserve architecture, trial and missing-platform states', async ({ page }) => {
  await page.route(/^http:\/\/127\.0\.0\.1:4321\/(en\/)?(download\/)?$/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({ contentType: 'text/html', body: await readFile(`output/fixtures/catalog${pathname}index.html`, 'utf8') });
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  for (const locale of ['', 'en/']) {
    await page.goto(`/${locale}`);
    await expect(page.locator('.hero-actions a').first()).toContainText(locale ? 'Download Zero' : '下载 Zero');
    await page.goto(`/${locale}download/`);
    const visible = page.locator('.package-group:visible');
    await expect(visible.locator('.package-entry')).toHaveCount(2);
    await expect(visible).toContainText('Apple Silicon');
    await expect(visible).toContainText('Intel');
    await expect(visible).toContainText('trial');
    await expect(visible.locator('a[href*="/releases/download/"]').first()).toHaveAttribute('href', /standard-aarch64\.dmg$/);
    await page.getByLabel('Windows', { exact: true }).check();
    await expect(visible.locator('.package-entry')).toHaveCount(0);
    await expect(visible.locator('a[href*="/releases/download/"]')).toHaveCount(0);
    await expect(visible.locator('.unavailable-state')).toBeVisible();
    await page.getByLabel(locale ? 'core / No bundled tools' : 'core / 无内置工具', { exact: true }).check();
    await expect(visible.locator('.package-entry')).toHaveCount(1);
    await expect(visible).toContainText('stable');
    await expect(visible.locator('a[href*="/releases/download/"]')).toHaveAttribute('href', /core-x86_64\.msi$/);
    await page.getByLabel('macOS', { exact: true }).check();
    await expect(visible.locator('a[href*="/releases/download/"]')).toHaveCount(0);
  }
  expect(downloads).toBe(0);
});

test('noindex preview under a base path loads resources and preserves language routes', async ({ page }) => {
  await page.route('http://127.0.0.1:4321/zero-preview/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.slice('/zero-preview/'.length);
    await route.fulfill({ path: `output/fixtures/preview/${pathname}${pathname.endsWith('/') || !pathname ? 'index.html' : ''}` });
  });
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => { if (!response.ok()) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto('/zero-preview/en/#tools');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.usezero.cn/zero-preview/en/');
  await page.getByRole('link', { name: '切换为中文', exact: true }).click();
  await expect(page).toHaveURL(/\/zero-preview\/#tools$/);
  await expect(page.locator('.preview img').first()).toBeVisible();
  await page.getByRole('button', { name: '快速入口', exact: true }).click();
  await expect(page.locator('[data-preview]')).toHaveAttribute('data-mode', 'quick');
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('link', { name: '获取 Zero' }).click();
  await expect(page).toHaveURL(/\/zero-preview\/download\/$/);
  expect(failures).toEqual([]);
});
