import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { deflateSync } from 'node:zlib';

const workspace = (page: Page) => page.locator('[data-image-workspace]');
const tool = (page: Page, name: string) => workspace(page).locator(`[data-image-${name}]`);
const output = (page: Page) => tool(page, 'download');
async function select(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await tool(page, 'files').setInputFiles(files);
  await expect(tool(page, 'results').locator('article')).toHaveCount(files.length);
}
async function run(page: Page, count = 1) {
  await tool(page, 'run').click();
  await expect(output(page)).toHaveCount(count, { timeout: 25_000 });
  await expect(tool(page, 'cancel')).toBeDisabled();
}
async function download(page: Page, locator = output(page).first()) {
  const event = page.waitForEvent('download'); await locator.click();
  const result = await event; const path = await result.path();
  if (!path) throw new Error('Download did not produce a local file');
  return { bytes: await readFile(path), name: result.suggestedFilename() };
}
function crcChunk(type: string, data: Uint8Array) {
  const value = Buffer.alloc(data.length + 12); value.writeUInt32BE(data.length); value.write(type, 4); value.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of value.subarray(4, value.length - 4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  value.writeUInt32BE((crc ^ 0xffffffff) >>> 0, value.length - 4); return value;
}
function pngExif(source: Buffer, orientation = 1) {
  const exif = Buffer.alloc(26); exif.write('II'); exif.writeUInt16LE(42,2); exif.writeUInt32LE(8,4); exif.writeUInt16LE(1,8); exif.writeUInt16LE(0x112,10); exif.writeUInt16LE(3,12); exif.writeUInt32LE(1,14); exif.writeUInt16LE(orientation,18);
  return Buffer.concat([source.subarray(0,33),crcChunk('eXIf',exif),crcChunk('tEXt',Buffer.from('Comment\0PRIVATE-IMAGE-MARKER')),crcChunk('iCCP',Buffer.concat([Buffer.from('PRIVATE-ICC-DESCRIPTION\0\0'),deflateSync(Buffer.from('private owner/device profile'))])),source.subarray(33)]);
}
async function alphaPng() {
  const raw = Buffer.from([213,17,91,0,17,231,72,1,44,81,194,127,205,27,11,254,1,2,3,255,99,44,77,0]);
  const bytes = await sharp(raw,{raw:{width:2,height:3,channels:4}}).png().toBuffer(); return { raw, bytes };
}
const file = (buffer: Buffer, name = 'synthetic.png') => ({name,mimeType:'image/png',buffer});

for (const locale of ['zh','en']) for (const name of ['image-converter','image-watermark','image-compressor']) {
  test(`${locale} ${name}: real local processing and correctly named output`, async ({page}) => {
    const requests: string[] = []; page.on('request', request => requests.push(request.url()));
    await page.goto(`${locale === 'en' ? '/en' : ''}/tools/${name}/`);
    expect(requests.filter(url => /image-codecs|mozjpeg|squoosh|webp.*wasm|oxipng/i.test(url))).toEqual([]);
    const sample = await sharp({create:{width:80,height:40,channels:4,background:'#224466'}}).png().toBuffer();
    await select(page,[file(sample,'PRIVATE-IMAGE-MARKER.png')]);
    if (name === 'image-watermark') { await tool(page,'text').fill('PRIVATE-WATERMARK'); await tool(page,'opacity').fill('100'); await tool(page,'rotation').fill('0'); }
    await tool(page,'format').selectOption(name === 'image-converter' ? 'webp' : 'png');
    await run(page);
    const saved = await download(page), meta = await sharp(saved.bytes).metadata();
    expect(meta.format).toBe(name === 'image-converter' ? 'webp' : 'png'); expect([meta.width,meta.height]).toEqual([80,40]);
    expect(saved.name).toMatch(new RegExp(`-${name === 'image-converter' ? 'convert' : name === 'image-watermark' ? 'watermark' : 'compress'}\\.${meta.format === 'webp' ? 'webp' : 'png'}$`));
    expect(meta.exif).toBeUndefined(); expect(meta.xmp).toBeUndefined();
    expect(requests.every(url => !url.includes('PRIVATE-IMAGE-MARKER') && !url.includes('PRIVATE-WATERMARK'))).toBe(true);
    expect(new URL(page.url()).search).toBe('');
    expect(requests.every(url => new URL(url).origin === new URL(page.url()).origin || url.startsWith('blob:'))).toBe(true);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key=>/image|watermark|file/i.test(key)))).toEqual([]);
    if (name === 'image-watermark') {
      const before = await sharp(sample).ensureAlpha().raw().toBuffer(), after = await sharp(saved.bytes).ensureAlpha().raw().toBuffer(); expect(after.equals(before)).toBe(false);
    }
    await tool(page,'edge').fill('30'); await expect(output(page)).toHaveCount(0); await expect(tool(page,'zip')).toBeDisabled();
  });
}

test('PNG alpha + EXIF identity stays pixel exact, strips capture metadata, and ZIP round-trips both collision-safe entries',async({page})=>{
  await page.goto('/en/tools/image-compressor/'); const sample=await alphaPng();
  await select(page,[file(pngExif(sample.bytes),'Alpha.png'),file(pngExif(sample.bytes),'alpha.PNG')]); await run(page,2);
  const single=await download(page); const decoded=await sharp(single.bytes).ensureAlpha().raw().toBuffer(); expect(decoded.equals(sample.raw)).toBe(true);
  const metadata=await sharp(single.bytes).metadata(); expect(metadata.exif).toBeUndefined(); expect(single.bytes.includes(Buffer.from('PRIVATE-IMAGE-MARKER'))).toBe(false); expect(single.bytes.includes(Buffer.from('PRIVATE-ICC-DESCRIPTION'))).toBe(false); expect(metadata.icc).toBeUndefined();
  const zipped=await download(page,tool(page,'zip')); expect(zipped.name).toMatch(/\.zip$/);
  const entries=unzipSync(zipped.bytes); expect(Object.keys(entries)).toEqual(['Alpha-compress.png','alpha-compress-2.png']);
  for(const bytes of Object.values(entries)){ expect((await sharp(bytes).ensureAlpha().raw().toBuffer()).equals(sample.raw)).toBe(true); }
});

test('JPEG EXIF orientation normalizes once and max edge never upscales',async({page})=>{
  const width=80,height=40,raw=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const rgb=y<20?(x<40?[255,0,0]:[0,255,0]):(x<40?[0,0,255]:[255,255,0]);raw.set(rgb,(y*width+x)*3);}
  const source=await sharp(raw,{raw:{width,height,channels:3}}).jpeg({quality:95}).withMetadata({orientation:6}).toBuffer();
  await page.goto('/en/tools/image-converter/'); await select(page,[{name:'orientation6.jpg',mimeType:'image/jpeg',buffer:source}]); await tool(page,'format').selectOption('png'); await tool(page,'edge').fill('200'); await run(page);
  const saved=await download(page),metadata=await sharp(saved.bytes).metadata(); expect([metadata.width,metadata.height]).toEqual([40,80]); expect(metadata.exif).toBeUndefined();
  const pixel=await sharp(saved.bytes).extract({left:10,top:20,width:1,height:1}).removeAlpha().raw().toBuffer(); expect(pixel[2]).toBeGreaterThan(200); expect(pixel[0]).toBeLessThan(30);
  await tool(page,'edge').fill('40'); await run(page); const resized=await sharp((await download(page)).bytes).metadata(); expect([resized.width,resized.height]).toEqual([20,40]);
});

test('JPEG quality changes actual encoding and chosen background flattens alpha',async({page})=>{
  await page.goto('/en/tools/image-converter/');
  const raw=Buffer.alloc(128*128*4);let seed=17; for(let i=0;i<raw.length;i+=4){seed=(seed*1664525+1013904223)>>>0;raw[i]=seed&255;raw[i+1]=(seed>>>8)&255;raw[i+2]=(seed>>>16)&255;raw[i+3]=i<128*4*32?0:255;}
  const source=await sharp(raw,{raw:{width:128,height:128,channels:4}}).png().toBuffer();
  await select(page,[file(source)]); await tool(page,'format').selectOption('jpeg'); await tool(page,'background').fill('#00ff00'); await tool(page,'quality').fill('20'); await run(page); const low=await download(page);
  const pixel=await sharp(low.bytes).extract({left:8,top:8,width:1,height:1}).raw().toBuffer(); expect(pixel[1]).toBeGreaterThan(200); expect(pixel[0]).toBeLessThan(40);
  await tool(page,'quality').fill('95'); await run(page); const high=await download(page); expect(high.bytes.length).toBeGreaterThan(low.bytes.length); expect((await sharp(high.bytes).metadata()).hasAlpha).toBe(false);
});

test('mixed failures retain successful results, retry only failures, cancel and rerun recover',async({page})=>{
  await page.goto('/en/tools/image-compressor/');const source=await sharp({create:{width:64,height:64,channels:4,background:'#224466'}}).png().toBuffer();
  await select(page,[file(source),file(Buffer.from('unsupported'),'bad.png')]); await run(page); await expect(tool(page,'counts')).toContainText('1 failed');
  const partialZip=await download(page,tool(page,'zip'));const partialEntries=unzipSync(partialZip.bytes);expect(Object.keys(partialEntries)).toHaveLength(1);
  const successfulEntry=Object.values(partialEntries)[0];if(!successfulEntry)throw new Error('Partial ZIP omitted the successful image');
  const partialMetadata=await sharp(successfulEntry).metadata();expect([partialMetadata.width,partialMetadata.height]).toEqual([64,64]);
  await expect(tool(page,'status')).toContainText('1 successful items');await expect(tool(page,'status')).toContainText('1 failed items excluded');
  await expect(tool(page,'counts')).toContainText('1 successful');await expect(tool(page,'counts')).toContainText('1 failed');
  const successful=await output(page).getAttribute('href');await tool(page,'retry').click();await expect(tool(page,'cancel')).toBeDisabled();await expect(tool(page,'counts')).toContainText('1 successful');await expect(tool(page,'counts')).toContainText('1 failed');expect(await output(page).getAttribute('href')).toBe(successful);
  await tool(page,'clear').click();await select(page,[file(source)]);
  await page.route('**/*image-worker*.js',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.continue().catch(()=>{});});
  await tool(page,'run').click();await tool(page,'cancel').click();await expect(tool(page,'counts')).toContainText('1 cancelled');await expect(output(page)).toHaveCount(0);
  await page.unroute('**/*image-worker*.js');await run(page);await expect(tool(page,'counts')).toContainText('1 successful');
});

test('PNG orientations 3, 6 and 8 preserve every RGBA byte while rotating exactly once',async({page})=>{
  const sample=await alphaPng();await page.goto('/en/tools/image-compressor/');
  await select(page,[3,6,8].map(orientation=>file(pngExif(sample.bytes,orientation),`orientation-${orientation}.png`)));await run(page,3);
  const expected=[[5,4,3,2,1,0],[4,2,0,5,3,1],[1,3,5,0,2,4]];
  for(const [index, positions] of expected.entries()){
    const saved=await download(page,output(page).nth(index)),metadata=await sharp(saved.bytes).metadata();
    expect([metadata.width,metadata.height]).toEqual(index===0?[2,3]:[3,2]);expect(metadata.exif).toBeUndefined();
    const pixels=await sharp(saved.bytes).ensureAlpha().raw().toBuffer();
    expect([...pixels]).toEqual(positions.flatMap(position=>[...sample.raw.subarray(position*4,position*4+4)]));
  }
});

test('16-bit PNG EXIF6 rotates without quantizing low sample bits or alpha',async({page})=>{
  const samples=[65534,257,4097,0,256,32769,8,1,12345,56789,65535,32768,9,10,11,65534,1000,2000,3000,65535,1,2,3,17];
  const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(3,4);header[8]=16;header[9]=6;
  const rows=Buffer.alloc(3*(1+2*4*2));
  for(const [index, sample] of samples.entries())rows.writeUInt16BE(sample,Math.floor(index/8)*17+1+(index%8)*2);
  const source=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),crcChunk('IHDR',header),crcChunk('IDAT',deflateSync(rows)),crcChunk('IEND',Buffer.alloc(0))]);
  await page.goto('/en/tools/image-compressor/');await select(page,[file(pngExif(source,6),'ushort-orientation6.png')]);await run(page);
  const saved=await download(page),metadata=await sharp(saved.bytes).metadata();expect([metadata.width,metadata.height]).toEqual([3,2]);expect(metadata.depth).toBe('ushort');expect(metadata.exif).toBeUndefined();
  const decoded=await sharp(saved.bytes).toColourspace('rgb16').raw({depth:'ushort'}).toBuffer();
  const expected=[4,2,0,5,3,1].flatMap(index=>samples.slice(index*4,index*4+4));
  const actual=Array.from({length:decoded.length/2},(_,index)=>decoded.readUInt16LE(index*2));expect(actual).toEqual(expected);
});

test('all nine anchors place actual opaque watermark pixels in their selected thirds',async({page})=>{
  await page.goto('/en/tools/image-watermark/');
  const source=await sharp({create:{width:240,height:160,channels:4,background:'#0000ff'}}).png().toBuffer();
  await select(page,[file(source)]);await tool(page,'format').selectOption('png');await tool(page,'text').fill('X');await tool(page,'opacity').fill('100');await tool(page,'rotation').fill('0');await tool(page,'font').fill('15');
  const anchors=[['top-left',0,0],['top-center',1,0],['top-right',2,0],['middle-left',0,1],['center',1,1],['middle-right',2,1],['bottom-left',0,2],['bottom-center',1,2],['bottom-right',2,2]] as const;
  for(const [anchor,column,row]of anchors){
    await tool(page,'position').selectOption(anchor);await expect(output(page)).toHaveCount(0);await run(page);
    const saved=await download(page),{data,info}=await sharp(saved.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let minX=info.width,minY=info.height,maxX=-1,maxY=-1,count=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const offset=(y*info.width+x)*4;if(data[offset]!>100&&data[offset+1]!>100){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
    expect(count,anchor).toBeGreaterThan(0);expect(minX,anchor).toBeGreaterThanOrEqual(column*80);expect(maxX,anchor).toBeLessThan((column+1)*80);expect(minY,anchor).toBeGreaterThanOrEqual(row*160/3);expect(maxY,anchor).toBeLessThan((row+1)*160/3);
  }
});

test('actual tiled watermarks render on extreme aspect ratios and mixed system text; empty text recovers',async({page})=>{
  await page.goto('/en/tools/image-watermark/');
  await tool(page,'format').selectOption('png');await tool(page,'mode').selectOption('tile');await tool(page,'rotation').fill('0');await tool(page,'opacity').fill('100');await tool(page,'font').fill('20');
  const cases=[{width:10,height:8192,text:'X'},{width:8192,height:10,text:'X'},{width:320,height:180,text:'中文 😀 watermark long text with several words'}];
  for(const [index,fixture]of cases.entries()){
    const source=await sharp({create:{width:fixture.width,height:fixture.height,channels:4,background:'#0000ff'}}).png().toBuffer();
    await select(page,[file(source,`tile-${index}.png`)]);await tool(page,'text').fill('');await tool(page,'run').click();await expect(tool(page,'status')).toContainText('Invalid image or settings');await expect(output(page)).toHaveCount(0);
    await tool(page,'text').fill(fixture.text);await run(page);const saved=await download(page),{data,info}=await sharp(saved.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    expect([info.width,info.height]).toEqual([fixture.width,fixture.height]);expect(data.length).toBe(fixture.width*fixture.height*4);
    let changed=0;for(let offset=0;offset<data.length;offset+=4)if(data[offset]!==0||data[offset+1]!==0||data[offset+2]!==255||data[offset+3]!==255)changed++;
    expect(changed,fixture.text).toBeGreaterThan(0);expect(changed).toBeLessThanOrEqual(fixture.width*fixture.height);
  }
});
