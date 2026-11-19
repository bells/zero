import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const [prefix, title, pending] of [['', 'Zero 插件市场', '暂不可安装'], ['en/', 'Zero plugin market', 'Not available']] as const) {
  test(`plugin catalog ${prefix || 'zh'} shows honest release state and preserves language route`, async ({ page }) => {
    await page.goto(`/${prefix}plugins/`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('[data-plugin]')).toHaveCount(5);
    await expect(page.locator('[data-plugin="zero.file"]')).toContainText(prefix ? 'engine approval' : '引擎批准');
    await expect(page.locator('.plugin-market-status').first()).toHaveText(pending);
    await expect(page.locator('a[href*="/releases/download/"]')).toHaveCount(0);
    await expect(page.locator('[data-language]')).toHaveAttribute('href', prefix ? /\/plugins\/$/ : /\/en\/plugins\/$/);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
