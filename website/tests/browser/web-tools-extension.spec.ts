import {test,expect}from'@playwright/test';

test('both new workers compute below a preview base and localized search includes four tools',async({page})=>{
  await page.route('http://127.0.0.1:4321/zero-preview/**',async route=>{const path=new URL(route.request().url()).pathname.slice('/zero-preview/'.length);await route.fulfill({path:`output/fixtures/preview/${path}${path.endsWith('/')?'index.html':''}`});});
  await page.goto('/zero-preview/tools/');await page.locator('[data-open-search]').click();await expect(page.locator('[data-search-name]')).toHaveCount(4);
  await page.locator('[data-search-input]').fill('对比');await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/zero-preview\/tools\/diff\/$/);
  await page.locator('[data-diff-source="before"]').fill('before');await page.locator('[data-diff-source="after"]').fill('after');await page.locator('[data-diff-compare]').click();await expect(page.locator('[data-diff-result]')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex, nofollow');
  await page.getByRole('link',{name:'Switch to English',exact:true}).click();await expect(page).toHaveURL(/\/zero-preview\/en\/tools\/diff\/$/);
  await page.goto('/zero-preview/en/tools/timestamp/');await page.locator('[data-time-mode="batch"]').click();await page.locator('[data-batch-source]').fill('1700000000');await page.locator('[data-batch-run]').click();await expect(page.locator('[data-batch-rows]')).toContainText('2023-11-14T22:13:20.000Z');
});

test('comparison defaults to unified on a narrow fresh load and reading can time out and retry',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{const NativeReader=FileReader;window.FileReader=class extends NativeReader{readAsArrayBuffer(_blob:Blob){}};});
  await page.goto('/en/tools/diff/');await expect(page.locator('[data-diff-view]')).toHaveValue('unified');
  await page.locator('[data-diff-source="before"]').fill('retained');await page.locator('[data-diff-file="before"]').setInputFiles({name:'slow.txt',mimeType:'text/plain',buffer:Buffer.from('new')});
  await expect(page.locator('[data-diff-compare]')).toBeDisabled();await expect(page.locator('[data-status]')).toContainText(/5.second/,{timeout:7000});
  await expect(page.locator('[data-diff-source="before"]')).toHaveValue('retained');await expect(page.locator('[data-diff-compare]')).toBeEnabled();
  await page.locator('[data-diff-source="after"]').fill('changed');await page.locator('[data-diff-compare]').click();await expect(page.locator('[data-diff-result]')).toBeVisible();
});
