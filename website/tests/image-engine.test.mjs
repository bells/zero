import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImageInput } from '../src/lib/web-tools/image-input.ts';
import { deflateSync, inflateSync } from 'node:zlib';
import { stripPngMetadata, pngExifOrientation, orientImagePixels, png16EncoderPixels, pngChunks } from '../src/lib/web-tools/image-png.ts';
import { defaultImageSettings, imagePolicy, assertImageDimensions } from '../src/lib/web-tools/image-policy.ts';
import { validateImageSettings } from '../src/lib/web-tools/image-settings.ts';
import { resizedImageDimensions, watermarkGeometry } from '../src/lib/web-tools/image-geometry.ts';
import { imageDownloadNames } from '../src/lib/web-tools/image-names.ts';
function chunk(type, data = new Uint8Array()) { const b = new Uint8Array(data.length + 12); new DataView(b.buffer).setUint32(0, data.length); b.set(new TextEncoder().encode(type), 4); b.set(data, 8); let crc = 0xffffffff; for (const value of b.subarray(4, b.length - 4)) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } new DataView(b.buffer).setUint32(b.length - 4, (crc ^ 0xffffffff) >>> 0); return b; }
function png(extra = [], width = 2, height = 3) { const ihdr = new Uint8Array(13); const view = new DataView(ihdr.buffer); view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6; return Uint8Array.from([137,80,78,71,13,10,26,10,...chunk('IHDR', ihdr),...extra.flatMap((c) => [...c]),...chunk('IDAT'),...chunk('IEND')]); }
test('signature probe rejects animation, disguised and truncated containers before decode', () => {
  assert.deepEqual(inspectImageInput(png()), { ok: true, value: { format: 'png', width: 2, height: 3 } });
  assert.equal(inspectImageInput(png([chunk('acTL')])).error.code, 'unsupported');
  assert.equal(inspectImageInput(png().subarray(0, 40)).error.code, 'invalid');
  assert.equal(inspectImageInput(new TextEncoder().encode('photo.jpg')).error.code, 'unsupported');
  assert.equal(inspectImageInput(png([], 8193, 1)).error.code, 'limit');
  assert.throws(() => assertImageDimensions(4032, 4032), { code: 'limit' });
  assert.equal(imagePolicy.maxPixels, 12_200_000);
});
test('PNG metadata removal preserves exact IDAT bytes and excludes textual/private chunks', () => {
  const plain = png(), privatePng = png([chunk('eXIf', new Uint8Array([1,2,3])), chunk('tEXt', new TextEncoder().encode('private GPS'))]);
  assert.deepEqual(stripPngMetadata(privatePng), plain);
});
test('settings reject nonfinite, blank, overlong, out-of-range and malformed parameters', () => {
  const settings = defaultImageSettings('watermark'); assert.equal(validateImageSettings(settings).ok, true);
  for (const patch of [{ text: ' ' }, { text: '😀'.repeat(201) }, { opacity: NaN }, { rotation: 181 }, { color: 'red' }, { fontRatio: .001 }]) assert.equal(validateImageSettings({ ...settings, watermark: { ...settings.watermark, ...patch } }).ok, false);
  assert.equal(validateImageSettings(null).ok, false);
  assert.equal(validateImageSettings({ ...settings, output: { ...settings.output, maxLongEdge: Infinity } }).ok, false);
});
test('geometry never upscales, preserves aspect ratio and bounds tiled draws', () => {
  assert.deepEqual(resizedImageDimensions(100, 50, 200), { width: 100, height: 50 });
  assert.deepEqual(resizedImageDimensions(100, 50, 40), { width: 40, height: 20 });
  const w = defaultImageSettings('watermark').watermark;
  assert.deepEqual(watermarkGeometry(100, 100, w, 20, 10)[0], { x: 87, y: 92, rotation: 0 });
  const draws = watermarkGeometry(8192, 1, { ...w, mode: 'tile', spacingRatio: .05 }, 1, 1); assert.ok(draws.length <= 500); assert.ok(draws.every((d) => Number.isFinite(d.x + d.y)));
});
test('download entries remove paths, control/reserved names and resolve casefold collisions', () => {
  const names = imageDownloadNames(['../../A.jpg', 'a.PNG', 'CON.jpg', '\\folder\\x\u0000.png'], 'compress', ['jpeg','jpeg','png','webp']);
  assert.deepEqual(names, ['A-compress.jpg','a-compress-2.jpg','_CON-compress.png','x_-compress.webp']);
  assert.ok(names.every((n) => !/[\\/\u0000]/.test(n)));
});
test('tiled watermark covers valid narrow and rotated images with nonempty bounded grids', () => {
  const w = { ...defaultImageSettings('watermark').watermark, mode: 'tile', spacingRatio: .15 };
  for (const [width, height] of [[10,8192],[8192,10],[1,8192],[8192,1]]) for (const rotation of [0,45,90,179]) {
    const draws = watermarkGeometry(width,height,{...w,rotation},9,.5);
    assert.ok(draws.length > 0 && draws.length <= 500);
    assert.ok(draws.every(({x,y}) => x > 0 && x < width && y > 0 && y < height));
    assert.ok(draws.some(({x}) => x <= width / 2)); assert.ok(draws.some(({x}) => x >= width / 2));
    assert.ok(draws.some(({y}) => y <= height / 2)); assert.ok(draws.some(({y}) => y >= height / 2));
  }
});

function exifOrientation(value, little = true) {
  const bytes = new Uint8Array(26), v = new DataView(bytes.buffer);
  bytes.set(little ? [73,73] : [77,77]); v.setUint16(2,42,little); v.setUint32(4,8,little);
  v.setUint16(8,1,little); v.setUint16(10,0x112,little); v.setUint16(12,3,little); v.setUint32(14,1,little); v.setUint16(18,value,little); return bytes;
}
test('raw PNG alpha bytes survive EXIF orientation 1 and metadata removal exactly', () => {
  const rgba = new Uint8ClampedArray([213,17,91,0,17,231,72,1,44,81,194,127,205,27,11,254,1,2,3,255,99,44,77,0]);
  const rows = new Uint8Array(27); for(let y=0;y<3;y++) rows.set(rgba.subarray(y*8,y*8+8),y*9+1);
  const source = png([chunk('eXIf',exifOrientation(1)),chunk('tEXt',new TextEncoder().encode('GPS/private')),chunk('iCCP',Uint8Array.from([...new TextEncoder().encode('PRIVATE-ICC-DESCRIPTION'),0,0,...deflateSync(new TextEncoder().encode('private owner/device profile'))])),chunk('IDAT',deflateSync(rows))]);
  assert.equal(pngExifOrientation(source),1);
  const clean = stripPngMetadata(source), idat = pngChunks(clean).filter(c=>c.type==='IDAT').flatMap(c=>[...clean.subarray(c.start+8,c.end-4)]);
  assert.deepEqual(inflateSync(Uint8Array.from(idat)),Buffer.from(rows));
  assert.deepEqual(orientImagePixels({width:2,height:3,data:rgba},1).data,rgba);
  assert.ok(!new TextDecoder().decode(clean).includes('private')); assert.ok(!new TextDecoder().decode(clean).includes('PRIVATE-ICC-DESCRIPTION')); assert.ok(!pngChunks(clean).some(c=>c.type==='iCCP')); assert.ok(!pngChunks(clean).some(c=>c.type==='eXIf'));
});
test('all TIFF orientations map RGBA including hidden RGB without alpha rounding', () => {
  const rgba = new Uint8ClampedArray([213,17,91,0,17,231,72,1,44,81,194,127,205,27,11,254,1,2,3,255,99,44,77,0]);
  const source={width:2,height:3,data:rgba};
  const expected={2:[1,0,3,2,5,4],3:[5,4,3,2,1,0],4:[4,5,2,3,0,1],5:[0,2,4,1,3,5],6:[4,2,0,5,3,1],7:[5,3,1,4,2,0],8:[1,3,5,0,2,4]};
  for(const orientation of [2,3,4,5,6,7,8]) {
    for(const little of [true,false]) assert.equal(pngExifOrientation(png([chunk('eXIf',exifOrientation(orientation,little))])),orientation);
    const result=orientImagePixels(source,orientation); assert.equal(result.width,orientation>=5?3:2); assert.equal(result.height,orientation>=5?2:3);
    assert.deepEqual([...result.data],expected[orientation].flatMap(index=>[...rgba.subarray(index*4,index*4+4)]));
  }
  assert.throws(()=>pngExifOrientation(png([chunk('eXIf',exifOrientation(9))])),{code:'invalid'});
});
test('16-bit orientation preserves every ushort including low bits and alpha',()=>{
  const data=new Uint16Array([65534,257,4097,0,256,32769,8,1,12345,56789,65535,32768,9,10,11,65534,1000,2000,3000,65535,1,2,3,17]);
  const result=orientImagePixels({width:2,height:3,data},6);
  assert.ok(result.data instanceof Uint16Array);assert.deepEqual([result.width,result.height],[3,2]);
  assert.deepEqual([...result.data],[4,2,0,5,3,1].flatMap(index=>[...data.subarray(index*4,index*4+4)]));
  const back=orientImagePixels(result,8);assert.deepEqual(back.data,data);
});

test('PNG16 encoding adapter produces network-order bytes without mutating numeric samples',()=>{
  const source={width:1,height:1,data:new Uint16Array([1000,32769,65534,17])};
  const result=png16EncoderPixels(source);
  assert.deepEqual([...new Uint8Array(result.data.buffer)],[3,232,128,1,255,254,0,17]);
  assert.deepEqual([...source.data],[1000,32769,65534,17]);
});
