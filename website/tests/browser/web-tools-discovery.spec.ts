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
