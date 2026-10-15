import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const ready = async (page: Page, route = '/en/tools/diff/') => { await page.goto(route); await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready', 'true'); };
const sources = (page: Page) => [page.locator('[data-diff-source="before"]'), page.locator('[data-diff-source="after"]')] as const;
const compare = async (page: Page) => { await page.locator('[data-diff-compare]').click(); await expect(page.locator('[data-diff-result]')).toBeVisible(); };
for (const locale of ['en', 'zh'] as const) test(`${locale} text comparison is readable, keyboard accessible and bounded at narrow widths`, async ({page}) => {
  await ready(page, `/${locale === 'en' ? 'en/' : ''}tools/diff/`);
  await page.locator('[data-diff-example]').click(); await compare(page);
  await expect(page.locator('[data-diff-newline]')).toBeVisible();
  await expect(page.locator('[data-diff-document]')).toContainText('<script>alert(1)</script>');
  for (const theme of ['light','dark']) {
    await page.locator('[data-theme]').selectOption(theme);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  }
  for (const width of [1440,720,320]) {
    await page.setViewportSize({width,height:900});
    if (width <= 720) await page.locator('[data-diff-view]').selectOption('unified');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.locator('[data-diff-clear]').click();
  await page.keyboard.type('original'); await sources(page)[1].fill('changed');
  await page.locator('[data-diff-compare]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-diff-result]')).toBeVisible();
  await expect(page.locator('[data-diff-previous]')).toBeDisabled(); await expect(page.locator('[data-diff-next]')).toBeDisabled();
});
test('strict file reads retain prior text on failure and edits invalidate comparison and filename', async ({page}) => {
  await ready(page); const [before,after] = sources(page);
  await before.fill('retained');
  for (const buffer of [Buffer.from([0xff]),Buffer.from('%PDF-1.7'),Buffer.from([0x50,0x4b,3,4]),Buffer.from('x\0y')]) {
    await page.locator('[data-diff-file="before"]').setInputFiles({name:'private-input.json',mimeType:'application/json',buffer});
    await expect(page.locator('[data-status]')).toContainText('Unsupported text file');
    await expect(before).toHaveValue('retained');
  }
  await page.locator('[data-diff-file="before"]').setInputFiles({name:'local.json',mimeType:'application/json',buffer:Buffer.from('\ufeff{"a":1}\n')});
  await expect(before).toHaveValue('{"a":1}\n'); await expect(page.locator('[data-diff-origin="before"]')).toHaveText('local.json');
  await expect(page.locator('[data-diff-result]')).toBeHidden(); await after.fill('{"a":2}'); await compare(page);
  await before.fill('edited'); await expect(page.locator('[data-diff-origin="before"]')).toBeEmpty(); await expect(page.locator('[data-diff-result]')).toBeHidden();
  await page.locator('[data-diff-file="before"]').setInputFiles([]); await expect(before).toHaveValue('edited');
});
test('distant differences, folded equal sections and very long lines remain fully navigable within DOM budgets', async ({page}) => {
  await ready(page); const [before,after] = sources(page);
  const input=Array.from({length:1000},(_,i)=>`line ${i}`).join('\n');
  await before.fill(input); await after.fill(input.replace('line 2\n','changed 2\n').replace('line 950\n','changed 950\n')); await compare(page);
  await expect(page.locator('[data-diff-position]')).toHaveText('Difference 1 of 2');
  await page.locator('[data-diff-next]').click(); await expect(page.locator('[data-diff-document]')).toContainText('changed 950'); await expect(page.locator('[data-diff-position]')).toHaveText('Difference 2 of 2'); await expect(page.locator('[data-diff-next]')).toBeDisabled();
  await expect(page.locator('[data-diff-previous]')).toBeEnabled(); await page.locator('[data-diff-view]').selectOption('unified');
  await before.fill('👋'.repeat(200000)); await after.fill('changed'); await compare(page);
  await expect(page.locator('[data-diff-inline]')).toBeVisible();
  let recovered='',pages=0;
  while(true) {
    const mounted=await page.locator('[data-diff-document]').evaluate(node=>({rows:node.querySelectorAll('[data-diff-text-row]').length,bytes:[...node.querySelectorAll('[data-diff-source-text]')].reduce((sum,item)=>sum+new TextEncoder().encode(item.textContent??'').byteLength,0),text:[...node.querySelectorAll('.diff-deleted [data-diff-source-text]')].map(item=>item.textContent).join('')}));
    expect(mounted.rows).toBeLessThanOrEqual(400); expect(mounted.bytes).toBeLessThanOrEqual(204800); recovered+=mounted.text; pages++; expect(pages).toBeLessThan(20);
    if(await page.locator('[data-diff-page-next]').isDisabled()) break;
    await page.locator('[data-diff-page-next]').click();
  }
  expect(recovered).toBe('👋'.repeat(200000)); expect(pages).toBeGreaterThan(1);
});
test('late reads and worker completions cannot restore edited or cleared state', async ({page}) => {
  await page.addInitScript(() => {
    const NativeReader=window.FileReader;
    class SlowReader extends NativeReader { override readAsArrayBuffer(blob: Blob) { setTimeout(()=>super.readAsArrayBuffer(blob),100); } }
    window.FileReader=SlowReader;
  });
  await ready(page); const [before,after] = sources(page);
  await before.fill('original');
  await page.locator('[data-diff-file="before"]').setInputFiles({name:'late.txt',mimeType:'text/plain',buffer:Buffer.from('late file')});
  await before.fill('edited'); await expect(before).toHaveValue('edited');
  await page.waitForTimeout(200); await expect(before).toHaveValue('edited'); await expect(page.locator('[data-diff-origin="before"]')).toBeEmpty();
  await after.fill('different'); await page.locator('[data-diff-compare]').click(); await page.locator('[data-diff-clear]').click();
  await expect(page.locator('[data-diff-result]')).toBeHidden(); await expect(before).toHaveValue(''); await expect(after).toHaveValue('');
});
test('synthetic private contents stay out of requests, storage, logs and URLs and release on clear', async ({page}) => {
  const marker='synthetic-diff-private-0ae1'; const requests:string[]=[],logs:string[]=[];
  page.on('request',request=>requests.push(request.url()+(request.postData()??''))); page.on('console',message=>logs.push(message.text()));
  await ready(page); const [before,after]=sources(page);
  await page.locator('[data-diff-file="before"]').setInputFiles({name:`${marker}.txt`,mimeType:'text/plain',buffer:Buffer.from(marker+'\nhttps://content.invalid/secret')});
  await expect(before).toHaveValue(marker+'\nhttps://content.invalid/secret'); await after.fill(`${marker}\n<script>window.pwned=true</script>`); await compare(page);
  expect(await page.evaluate(()=>('pwned' in window))).toBe(false);
  expect([...requests,...logs,page.url()].some(value=>value.includes(marker))).toBe(false);
  expect(requests.some(value=>value.includes('content.invalid'))).toBe(false);
  const storage=await page.evaluate(async()=>({local:{...localStorage},session:{...sessionStorage},dbs:(await indexedDB.databases()).map(db=>db.name)})); expect(storage).toEqual({local:{},session:{},dbs:[]});
  await page.locator('[data-diff-clear]').click(); await expect(before).toHaveValue(''); await expect(after).toHaveValue(''); await expect(page.locator('[data-diff-result]')).toBeHidden(); await expect(page.locator('[data-diff-origin="before"]')).toBeEmpty();
  await before.fill(marker); await after.fill(marker); await compare(page);
  const released=await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide'));return [...document.querySelectorAll<HTMLTextAreaElement>('[data-diff-source]')].map(input=>input.value);});expect(released).toEqual(['','']);await expect(page.locator('[data-diff-document]')).toBeEmpty();
});
test('initial display and difference navigation reveal targets after oversized context while context stays inspectable', async ({page}) => {
  await ready(page); const [before,after]=sources(page);
  const long='x'.repeat(300000);
  await before.fill([long,'one','two','old'].join('\n'));
  await after.fill([long,'one','two','new'].join('\n'));
  await compare(page);
  await expect(page.locator('[data-diff-document] .diff-deleted [data-diff-source-text]')).toHaveText('old');
  await expect(page.locator('[data-diff-page-previous]')).toBeEnabled();
  await page.locator('[data-diff-page-previous]').click();
  await expect(page.locator('[data-diff-document] .diff-equal [data-diff-source-text]').first()).toContainText('x'.repeat(100));
  const input=['first','one','two','three','four',long,'six','seven','second'].join('\n');
  await before.fill(input); await after.fill(input.replace('first','FIRST').replace('second','SECOND')); await compare(page);
  await page.locator('[data-diff-next]').click();
  await expect(page.locator('[data-diff-position]')).toHaveText('Difference 2 of 2');
  await expect(page.locator('[data-diff-document] .diff-deleted [data-diff-source-text]')).toHaveText('second');
  const mounted=await page.locator('[data-diff-document]').evaluate(node=>({rows:node.querySelectorAll('[data-diff-text-row]').length,bytes:[...node.querySelectorAll('[data-diff-source-text]')].reduce((sum,item)=>sum+new TextEncoder().encode(item.textContent??'').byteLength,0)}));
  expect(mounted.rows).toBeLessThanOrEqual(400); expect(mounted.bytes).toBeLessThanOrEqual(204800);
  await expect(page.locator('[data-diff-next]')).toBeDisabled();
  await expect(page.locator('[data-diff-page-previous]')).toBeEnabled();
  await page.locator('[data-diff-page-previous]').click();
  await expect(page.locator('[data-diff-document] .diff-equal [data-diff-source-text]').first()).toContainText('x'.repeat(100));
});
