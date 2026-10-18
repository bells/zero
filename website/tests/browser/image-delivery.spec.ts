import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const fixture = (name: string) => `tests/fixtures/image-codecs/${name}`;

test('production HEIC replacement module loads only on demand and produces a real JPEG', async ({ page }) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/en/tools/image-converter/');
  await page.locator('[data-image-files]').setInputFiles(fixture('synthetic-12mp.heic'));
  await expect(page.locator('[data-image-results] article')).toHaveCount(1);
  expect(requests.some(url => url.includes('libheif-rebuilt.js'))).toBe(false);
  await page.locator('[data-image-run]').click();
  await expect(page.locator('[data-image-download]')).toHaveCount(1, { timeout: 65_000 });
  const event = page.waitForEvent('download'); await page.locator('[data-image-download]').click();
  const saved = await event; const bytes = await readFile((await saved.path())!);
  const metadata = await sharp(bytes).metadata();
  expect([metadata.format, metadata.width, metadata.height]).toEqual(['jpeg', 4032, 3024]);
  expect(saved.suggestedFilename()).toBe('synthetic-12mp-convert.jpg');
  expect(requests.some(url => new URL(url).pathname === '/image-codecs/libheif-rebuilt.js')).toBe(true);
  expect(metadata.exif).toBeUndefined();
});

test('subpath production image worker and separate HEIC module resolve below the base', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('http://127.0.0.1:4321/zero-preview/**', async route => {
    const path = new URL(route.request().url()).pathname.slice('/zero-preview/'.length);
    await route.fulfill({ path: `output/fixtures/preview/${path}${path.endsWith('/') ? 'index.html' : ''}` });
  });
  await page.goto('/zero-preview/en/tools/image-converter/');
  await page.locator('[data-image-files]').setInputFiles(fixture('heic-rotate-1.heic'));
  await expect(page.locator('[data-image-results] article')).toHaveCount(1);
  await page.locator('[data-image-edge]').fill('80');
  await page.locator('[data-image-run]').click();
  await expect(page.locator('[data-image-download]')).toHaveCount(1, { timeout: 65_000 });
  const href = await page.locator('[data-image-download]').getAttribute('href');
  const bytes = await page.evaluate(async value => Array.from(new Uint8Array(await (await fetch(value!)).arrayBuffer())), href);
  const metadata = await sharp(Buffer.from(bytes)).metadata();
  expect([metadata.width, metadata.height]).toEqual([60, 80]);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('image files/settings never enter feedback URL or requests and failed feedback leaves outputs usable', async ({ page }) => {
  const marker = 'PRIVATE-IMAGE-FEEDBACK-623';
  const observed: string[] = [];
  page.on('request', request => observed.push(`${request.url()} ${request.postData() ?? ''}`));
  page.on('console', message => observed.push(message.text()));
  page.on('pageerror', error => observed.push(error.message));
  await page.route('http://127.0.0.1:4321/feedback-review/**', async route => {
    const path = new URL(route.request().url()).pathname.slice('/feedback-review/'.length);
    await route.fulfill({ path: `output/fixtures/feedback/${path}${path.endsWith('/') ? 'index.html' : ''}` });
  });
  const feedbackURLs: string[] = [];
  await page.route('http://127.0.0.1:4323/**', route => { feedbackURLs.push(route.request().url()); return route.abort(); });
  await page.goto('/feedback-review/en/tools/image-watermark/');
  const source = await sharp({create:{width:64,height:64,channels:4,background:'#224466'}}).png().toBuffer();
  await page.locator('[data-image-files]').setInputFiles({ name: `${marker}.png`, mimeType:'image/png', buffer:source });
  await expect(page.locator('[data-image-results] article')).toHaveCount(1);
  await page.locator('[data-image-text]').fill(marker);
  await page.locator('[data-image-run]').click();
  await expect(page.locator('[data-image-download]')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(observed.some(value => value.includes('127.0.0.1:4323'))).toBe(false);
  await page.locator('[data-feedback-open]').click();
  await expect.poll(() => feedbackURLs.length).toBe(1);
  const url = new URL(feedbackURLs[0]!);
  expect([...url.searchParams.keys()].sort()).toEqual(['locale', 'threadId']);
  expect(url.searchParams.get('threadId')).toBe('tools/image-watermark');
  expect(url.searchParams.get('locale')).toBe('en');
  await expect(page.locator('[data-image-download]')).toHaveCount(1);
  expect(observed.join('\n')).not.toContain(marker);
  expect(page.url()).not.toContain(marker);
  expect(await page.evaluate(() => JSON.stringify({local:localStorage,session:sessionStorage}))).not.toContain(marker);
});

test('ZIP cancel, timeout and worker failure preserve individual outputs and allow recovery', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('image-archive-worker')) return;
        const send = this.postMessage.bind(this);
        this.postMessage = ((message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => {
          const mode = (window as Window & { __zipMode?: string }).__zipMode;
          if (mode === 'hold') return;
          if (mode === 'fail') { queueMicrotask(() => this.dispatchEvent(new ErrorEvent('error'))); return; }
          if (Array.isArray(transfer)) send(message, transfer); else send(message, transfer);
        }) as Worker['postMessage'];
      }
    };
  });
  await page.goto('/en/tools/image-converter/');
  const source = await sharp({create:{width:64,height:64,channels:4,background:'#224466'}}).png().toBuffer();
  await page.locator('[data-image-files]').setInputFiles({name:'zip.png',mimeType:'image/png',buffer:source});
  await expect(page.locator('[data-image-results] article')).toHaveCount(1);
  await page.locator('[data-image-run]').click(); await expect(page.locator('[data-image-download]')).toHaveCount(1);
  const href = await page.locator('[data-image-download]').getAttribute('href');
  const mode = async (value: string) => page.evaluate(value => { (window as Window & {__zipMode?:string}).__zipMode=value; }, value);
  await mode('hold'); await page.locator('[data-image-zip]').click();
  await expect(page.locator('[data-image-status]')).toContainText('1 successful');
  await page.locator('[data-image-zip-cancel]').click(); await expect(page.locator('[data-image-status]')).toContainText('ZIP cancelled');
  await expect(page.locator('[data-image-download]')).toHaveAttribute('href',href!);
  await page.clock.install(); await page.locator('[data-image-zip]').click(); await page.clock.fastForward(10_001);
  await expect(page.locator('[data-image-status]')).toContainText('timed out'); await expect(page.locator('[data-image-zip]')).toBeEnabled();
  await mode('fail'); await page.locator('[data-image-zip]').click(); await expect(page.locator('[data-image-status]')).toContainText('ZIP archive failed');
  await expect(page.locator('[data-image-download]')).toHaveAttribute('href',href!);
  await mode('normal'); const event=page.waitForEvent('download'); await page.locator('[data-image-zip]').click();
  expect((await event).suggestedFilename()).toBe('zero-convert.zip'); await expect(page.locator('[data-image-status]')).toContainText('ZIP ready');
  await page.locator('[data-image-clear]').click();
  await page.locator('[data-image-files]').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('unsupported')});
  await expect(page.locator('[data-image-results] article')).toHaveCount(1); await page.locator('[data-image-run]').click();
  await expect(page.locator('[data-image-counts]')).toContainText('1 failed'); await expect(page.locator('[data-image-zip]')).toBeDisabled();
});

test('per-item timeout terminates held work and retry can produce a real result', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as Window & {__holdImage?:boolean}).__holdImage=true;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); const send=this.postMessage.bind(this);
        this.postMessage=((message:unknown, transfer?:Transferable[]|StructuredSerializeOptions)=>{
          if(String(url).includes('image-worker')&&(window as Window & {__holdImage?:boolean}).__holdImage){(window as Window & {__imageHeld?:boolean}).__imageHeld=true;return;}
          if(Array.isArray(transfer))send(message,transfer);else send(message,transfer);
        }) as Worker['postMessage'];
      }
    };
  });
  await page.goto('/en/tools/image-compressor/');
  const source=await sharp({create:{width:64,height:64,channels:4,background:'#224466'}}).png().toBuffer();
  await page.locator('[data-image-files]').setInputFiles({name:'timeout.png',mimeType:'image/png',buffer:source});
  await expect(page.locator('[data-image-results] article')).toHaveCount(1);
  await page.clock.install(); await page.locator('[data-image-run]').click();
  await expect.poll(()=>page.evaluate(()=>(window as Window & {__imageHeld?:boolean}).__imageHeld)).toBe(true);
  await page.clock.fastForward(60_001);
  await expect(page.locator('[data-image-results]')).toContainText('Processing timed out'); await expect(page.locator('[data-image-counts]')).toContainText('1 failed');
  await expect(page.locator('[data-image-download]')).toHaveCount(0);
  await page.evaluate(()=>{(window as Window & {__holdImage?:boolean}).__holdImage=false;});
  await page.locator('[data-image-retry]').click(); await expect(page.locator('[data-image-download]')).toHaveCount(1); await expect(page.locator('[data-image-counts]')).toContainText('1 successful');
});
