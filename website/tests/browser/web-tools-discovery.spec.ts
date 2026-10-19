import { test, expect } from '@playwright/test';
import { webTools } from '../../src/content/web-tools';
import { guideCopy } from '../../src/content/web-tool-guides';

for (const locale of ['zh', 'en'] as const) {
  const prefix = locale === 'en' ? '/en' : '';
  test(`${locale} discovery guidance is static, readable and usable by a browser agent`, async ({ page, browser }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
    const plain = await context.newPage();
    for (const tool of webTools[locale]) {
      await plain.goto(`${prefix}/tools/${tool.slug}/`);
      await expect(plain).toHaveTitle(`${tool.guide.searchTitle} | Zero`);
      await expect(plain.locator('#steps + ol li')).toHaveText(tool.guide.steps);
      await expect(plain.locator('.wt-example')).toHaveCount(tool.guide.examples.length);
      await expect(plain.locator('.wt-example code')).toHaveText(tool.guide.examples.flatMap((example) => [example.input, example.output]));
      await expect(plain.locator('#agent-usage')).toHaveText(guideCopy[locale].agent);
      await expect(plain.locator('.wt-agent')).toContainText(tool.guide.agent.input);
      expect(await plain.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await context.close();
    await page.goto(`${prefix}/tools/`);
    await page.locator('.wt-directory-row').filter({ hasText: 'JSON' }).click();
    await page.getByLabel(locale === 'zh' ? '输入' : 'Input', { exact: true }).fill('{"ok":true}');
    await page.getByRole('button', { name: locale === 'zh' ? '格式化' : 'Format', exact: true }).click();
    await expect(page.getByLabel(locale === 'zh' ? '结果' : 'Result', { exact: true })).toHaveValue('{\n  "ok": true\n}');
    await page.locator('#examples').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/screenshots/discovery-${locale}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#examples').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/screenshots/discovery-${locale}-mobile.png` });
    expect(errors).toEqual([]);
  });
}

for (const locale of ['zh', 'en'] as const) {
  const prefix = locale === 'en' ? '/en' : '';
  test(`${locale} category-local query stays in memory and all-search covers seven tools`, async ({ page, browser }) => {
    const query = 'JSON_PRIVATE_DISCOVERY';
    await page.goto(`${prefix}/tools/?category=image&search=discarded`);
    await expect(page.locator('[data-category="image"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.wt-directory-row:visible')).toHaveCount(3);
    await page.locator('[data-directory-search]').fill('JSON');
    await expect(page.locator('[data-directory-empty]')).toBeVisible();
    await page.locator('[data-category-recover]').click();
    await expect(page.locator('[data-directory-search]')).toHaveValue('JSON');
    await expect(page.locator('.wt-directory-row:visible')).toHaveCount(1);
    await page.locator('[data-directory-search]').fill(query);
    await page.locator('[data-category="image"]').click();
    const language = await page.locator('[data-language]').getAttribute('href');
    expect(language).toMatch(/\?category=image$/);
    expect(language).not.toContain(query);
    expect(language).not.toContain('search=');
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).not.toContain('?');
    await page.keyboard.press('Control+k');
    await expect(page.locator('[data-search-name]:visible')).toHaveCount(7);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-directory-search]')).toHaveValue(query);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(query);
    await page.goto(`${prefix}/tools/?category=unknown`);
    await expect(page.locator('[data-category="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.wt-directory-row:visible')).toHaveCount(7);
    const plain = await browser.newContext({ javaScriptEnabled: false });
    const nojs = await plain.newPage();
    await nojs.goto(`${prefix}/tools/?category=image`);
    await expect(nojs.locator('.wt-directory-row')).toHaveCount(7);
    await expect(nojs.locator('[data-directory-search]')).toBeHidden();
    await plain.close();
  });
}

test('tool breadcrumbs and directory retain touch targets at 200% zoom', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 1000 });
  for (const route of ['/en/tools/', '/en/tools/timestamp/', '/tools/image-converter/']) {
    await page.goto(route);
    await page.evaluate(() => { document.body.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const target of await page.locator('[data-category], .wt-breadcrumb a').evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })))) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
  }
});
