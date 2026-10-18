import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

const ui=(page:Page,name:string)=>page.locator(`[data-image-workspace] [data-image-${name}]`);
const sample=async(width=100,height=60)=>({name:'private-source.png',mimeType:'image/png',buffer:await sharp({create:{width,height,channels:4,background:'#193b59'}}).png().toBuffer()});
async function ready(page:Page,tool='image-watermark'){
 await page.goto(`/en/tools/${tool}/`);await expect(page.locator('[data-web-tools]')).toHaveAttribute('data-ready','true');
}
async function load(page:Page,width=100,height=60){await ui(page,'files').setInputFiles(await sample(width,height));await expect(ui(page,'item')).toHaveCount(1);}
async function previewSize(page:Page){return ui(page,'preview').locator('img').evaluate(image=>({width:(image as HTMLImageElement).naturalWidth,height:(image as HTMLImageElement).naturalHeight}));}
async function previewReady(page:Page){await expect(ui(page,'preview')).toBeVisible();await expect.poll(async()=>{const size=await previewSize(page);return size.width*size.height;}).toBeGreaterThan(0);}

test('explicit selected-source preview is bounded before processing and edits refresh only that thumbnail',async({page})=>{
 await ready(page);await expect(ui(page,'settings')).toHaveCSS('display','block');await load(page,1600,1000);await ui(page,'text').fill('Current settings');await ui(page,'format').selectOption('png');
 await expect(ui(page,'preview')).toBeHidden();await expect(ui(page,'download')).toHaveCount(0);
 await ui(page,'source-preview').click();await previewReady(page);const before=await ui(page,'preview').locator('img').getAttribute('src');const size=await previewSize(page);expect(size.width*size.height).toBeLessThanOrEqual(400000);expect(size.width).toBeLessThan(1600);
 await ui(page,'color').fill('#ff0000');await expect.poll(()=>ui(page,'preview').locator('img').getAttribute('src')).not.toBe(before);await previewReady(page);
 await expect(ui(page,'download')).toHaveCount(0);await expect(ui(page,'counts')).toContainText('0 successful');await expect(ui(page,'run')).toBeEnabled();await expect(ui(page,'preview')).toContainText('Current settings at thumbnail size');
});

test('rapid source and result previews cannot resurrect after clear or page lifecycle cleanup',async({page})=>{
 await ready(page,'image-converter');await load(page,1200,800);await ui(page,'source-preview').click();await ui(page,'clear').click();await expect(ui(page,'preview')).toBeHidden();await expect(ui(page,'item')).toHaveCount(0);
 await load(page);await ui(page,'run').click();await expect(ui(page,'download')).toHaveCount(1);await expect(ui(page,'cancel')).toBeDisabled();
 const button=page.getByRole('button',{name:'Preview result',exact:true});await button.click();await previewReady(page);const size=await previewSize(page);expect(size).toEqual({width:100,height:60});
 await button.evaluate(element=>{(element as HTMLButtonElement).click();(element as HTMLButtonElement).click();(element as HTMLButtonElement).click();});
 await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 await expect(ui(page,'item')).toHaveCount(0);await expect(ui(page,'preview')).toBeHidden();await expect(ui(page,'download')).toHaveCount(0);
 // Let the worker/script event queues drain; a late event must still leave an empty workspace.
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(ui(page,'preview')).toBeHidden();
});

test('editing parameters during a slow byte import preserves selected files and uses the current settings',async({page})=>{
 await page.addInitScript(()=>{
  const original=File.prototype.arrayBuffer;
  File.prototype.arrayBuffer=async function(){
   const state=window as Window & {__imageImportPending?:boolean;__releaseImageImport?:()=>void};
   if(!state.__imageImportPending){state.__imageImportPending=true;await new Promise<void>(resolve=>{state.__releaseImageImport=resolve;});}
   return original.call(this);
  };
 });
 await ready(page,'image-converter');await ui(page,'files').setInputFiles(await sample());
 await expect.poll(()=>page.evaluate(()=>(window as Window & {__imageImportPending?:boolean}).__imageImportPending)).toBe(true);
 await ui(page,'format').selectOption('png');await ui(page,'max-edge').fill('40');
 await page.evaluate(()=>(window as Window & {__releaseImageImport?:()=>void}).__releaseImageImport?.());
 await expect(ui(page,'item')).toHaveCount(1);await ui(page,'run').click();await expect(ui(page,'download')).toHaveCount(1);await expect(ui(page,'item')).toContainText('40 × 24');
});

for(const theme of ['light','dark'])test(`320px and 200% text size: ${theme} image controls stay within the viewport`,async({page})=>{
 await page.setViewportSize({width:320,height:900});await ready(page);await page.locator('[data-theme]').selectOption(theme);await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await load(page);await ui(page,'text').fill('中文 watermark 😀');await ui(page,'mode').selectOption('tile');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const sizes=await page.locator('[data-image-workspace] button:visible,[data-image-workspace] select:visible,[data-image-workspace] input:visible').evaluateAll(elements=>elements.map(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,right:element.getBoundingClientRect().right})));
 for(const size of sizes){expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44);expect(size.right).toBeLessThanOrEqual(321);}
 await expect(ui(page,'spacing-label')).toBeVisible();await expect(ui(page,'position-label')).toBeHidden();
});

test('file count and byte caps reject imports before a pixel worker starts; large dimensions fail without codec fetch',async({page})=>{
 const workerRequests:string[]=[];page.on('request',request=>{if(/image-worker|image-codecs/.test(request.url()))workerRequests.push(request.url());});
 await ready(page,'image-converter');const small=await sample();await ui(page,'files').setInputFiles(Array.from({length:11},(_,index)=>({...small,name:`${index}.png`})));
 await expect(ui(page,'status')).toContainText('Resource limit exceeded');await expect(ui(page,'item')).toHaveCount(0);expect(workerRequests).toEqual([]);
 await ui(page,'files').setInputFiles({name:'oversize.png',mimeType:'image/png',buffer:Buffer.alloc(16*1024*1024+1)});await expect(ui(page,'status')).toContainText('Resource limit exceeded');await expect(ui(page,'item')).toHaveCount(0);expect(workerRequests).toEqual([]);
 await ui(page,'files').setInputFiles(await sample(8000,6000));await expect(ui(page,'status')).toContainText('Resource limit exceeded');await expect(ui(page,'item')).toHaveCount(0);expect(workerRequests).toEqual([]);expect(workerRequests.filter(url=>url.includes('image-codecs'))).toEqual([]);await expect(ui(page,'zip')).toBeDisabled();
});

test('preserved PNG hides quality and selected source preview never creates batch download results',async({page})=>{
 await ready(page,'image-compressor');await load(page);await expect(ui(page,'quality-label')).toBeHidden();await ui(page,'format').selectOption('jpeg');await expect(ui(page,'quality-label')).toBeVisible();await ui(page,'format').selectOption('preserve');await expect(ui(page,'quality-label')).toBeHidden();
 await ui(page,'source-preview').click();await previewReady(page);await expect(ui(page,'download')).toHaveCount(0);await expect(ui(page,'zip')).toBeDisabled();
});

 test('overlimit replacement preserves an already successful batch and its existing download URL',async({page})=>{
 await ready(page,'image-compressor');await load(page);await ui(page,'run').click();await expect(ui(page,'download')).toHaveCount(1);await expect(ui(page,'cancel')).toBeDisabled();const url=await ui(page,'download').getAttribute('href');const source=await sample();
 for(const rejected of [Array.from({length:11},(_,index)=>({...source,name:`extra-${index}.png`})),[{name:'too-many-bytes.png',mimeType:'image/png',buffer:Buffer.alloc(16*1024*1024+1)}],[await sample(8000,6000)]]){
  await ui(page,'files').setInputFiles(rejected);await expect(ui(page,'status')).toContainText('Resource limit exceeded');await expect(ui(page,'download')).toHaveAttribute('href',url!);await expect(ui(page,'counts')).toContainText('1 successful');await expect(ui(page,'zip')).toBeEnabled();expect(await ui(page,'files').inputValue()).toBe('');
 }
 await expect.poll(()=>page.evaluate(async sourceURL=>{const response=await fetch(sourceURL!);return response.ok;},url)).toBe(true);
});

test('cancelling a slow second item retains the first success; new settings invalidate it',async({page})=>{
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker {
   constructor(url:string|URL,options?:WorkerOptions){
    super(url,options);const send=this.postMessage.bind(this);
    this.postMessage=((message:unknown,transfer?:Transferable[]|StructuredSerializeOptions)=>{
     // Hold only later batch jobs before they enter pixel processing; the first item uses the real worker.
     if(typeof message==='object'&&message!==null){const request=message as Record<string,unknown>;if(request.kind==='process'&&typeof request.jobId==='number'&&request.jobId>1)return;}
     if(Array.isArray(transfer))send(message,transfer);else send(message,transfer);
    }) as Worker['postMessage'];
   }
  };
 });
 await ready(page,'image-converter');const source=await sample();await ui(page,'files').setInputFiles([source,{...source,name:'second.png'}]);await expect(ui(page,'item')).toHaveCount(2);await ui(page,'run').click();await expect(ui(page,'download')).toHaveCount(1);await expect(ui(page,'cancel')).toBeEnabled();const originalURL=await ui(page,'download').getAttribute('href');
 await ui(page,'cancel').click();await expect(ui(page,'counts')).toContainText('1 successful');await expect(ui(page,'counts')).toContainText('1 cancelled');await expect(ui(page,'download')).toHaveAttribute('href',originalURL!);await expect(ui(page,'zip')).toBeEnabled();
 await ui(page,'max-edge').fill('30');await expect(ui(page,'download')).toHaveCount(0);await expect(ui(page,'zip')).toBeDisabled();await expect(ui(page,'item')).toHaveCount(2);
});

test('a pending replacement import disables old-batch dispatch and releases every worker after accepting new sources',async({page})=>{
 await page.addInitScript(()=>{
  type State=Window & {__holdImageRead?:boolean;__imageReadPending?:boolean;__releaseHeldRead?:()=>void;__imageWorkerPosts?:number;__liveImageWorkers?:number};
  const state=window as State,read=File.prototype.arrayBuffer,NativeWorker=window.Worker;
  File.prototype.arrayBuffer=async function(){if(state.__holdImageRead){state.__imageReadPending=true;await new Promise<void>(resolve=>{state.__releaseHeldRead=resolve;});}return read.call(this);};
  window.Worker=class extends NativeWorker {
   private tracked:boolean;
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.tracked=String(url).includes('image-worker');if(this.tracked)state.__liveImageWorkers=(state.__liveImageWorkers??0)+1;const send=this.postMessage.bind(this);this.postMessage=((message:unknown,transfer?:Transferable[]|StructuredSerializeOptions)=>{if(this.tracked)state.__imageWorkerPosts=(state.__imageWorkerPosts??0)+1;if(Array.isArray(transfer))send(message,transfer);else send(message,transfer);}) as Worker['postMessage'];}
   terminate(){if(this.tracked){state.__liveImageWorkers=(state.__liveImageWorkers??1)-1;this.tracked=false;}super.terminate();}
  };
 });
 await ready(page,'image-converter');await load(page);await ui(page,'run').click();await expect(ui(page,'download')).toHaveCount(1);await expect(ui(page,'cancel')).toBeDisabled();
 const before=await page.evaluate(()=>(window as Window & {__imageWorkerPosts?:number}).__imageWorkerPosts);
 await page.evaluate(()=>{(window as Window & {__holdImageRead?:boolean}).__holdImageRead=true;});await ui(page,'files').setInputFiles({...await sample(),name:'replacement.png'});
 await expect.poll(()=>page.evaluate(()=>(window as Window & {__imageReadPending?:boolean}).__imageReadPending)).toBe(true);
 await expect(ui(page,'run')).toBeDisabled();await expect(ui(page,'retry')).toBeDisabled();await expect(ui(page,'source-preview')).toBeDisabled();
 await ui(page,'run').evaluate(button=>(button as HTMLButtonElement).click());expect(await page.evaluate(()=>(window as Window & {__imageWorkerPosts?:number}).__imageWorkerPosts)).toBe(before);
 await ui(page,'max-edge').fill('30');await expect(ui(page,'run')).toBeDisabled();
 await page.evaluate(()=>{const state=window as Window & {__holdImageRead?:boolean;__releaseHeldRead?:()=>void};state.__holdImageRead=false;state.__releaseHeldRead?.();});await expect(ui(page,'item')).toContainText('replacement.png');await expect(ui(page,'run')).toBeEnabled();await ui(page,'run').click();await expect(ui(page,'download')).toHaveCount(1);await expect(ui(page,'cancel')).toBeDisabled();await expect(ui(page,'item')).toContainText('30 × 18');
 await expect.poll(()=>page.evaluate(()=>(window as Window & {__liveImageWorkers?:number}).__liveImageWorkers??0)).toBe(0);
});
