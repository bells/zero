/// <reference lib="webworker" />
import type { HeifImage, HeifModule, ProbeMessage, ProbeRequest, ProbeResult } from './contracts.ts';
function post(message: ProbeMessage) { self.postMessage(message); }
const equal = (a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
async function fixture(name: string): Promise<ArrayBuffer> {
  if (!/^[a-z0-9.-]+$/.test(name)) throw new Error('invalid-fixture');
  const response = await fetch(`${import.meta.env.BASE_URL}${name}`);
  if (!response.ok) throw new Error('fixture-load');
  return response.arrayBuffer();
}
async function codecs(bytes: ArrayBuffer): Promise<ProbeResult> {
  const start = performance.now();
  const [{ default: jpeg }, { default: webp }, { default: pngDecode }, { default: optimise }, { zipSync, unzipSync }] = await Promise.all([
    import('@jsquash/jpeg/encode.js'), import('@jsquash/webp/encode.js'), import('@jsquash/png/decode.js'), import('@jsquash/oxipng/optimise.js'), import('fflate'),
  ]);
  const pixels = await pngDecode(bytes);
  const png = await optimise(bytes, { level: 2, optimiseAlpha: false, interlace: false });
  const after = await pngDecode(png);
  const jpegs: ArrayBuffer[] = [], webps: ArrayBuffer[] = [];
  for (const quality of [25, 90]) { jpegs.push(await jpeg(pixels, { quality })); webps.push(await webp(pixels, { quality })); }
  const encoded = [jpegs[1]!, webps[1]!, png];
  const formats = encoded.map((buffer) => {
    const b = new Uint8Array(buffer);
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpeg';
    if (new TextDecoder().decode(b.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(b.subarray(8, 12)) === 'WEBP') return 'webp';
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return 'png';
    throw new Error('invalid-output-signature');
  });
  // Independent browser decodes verify encoded bytes, rather than just their headers.
  for (let i = 0; i < encoded.length; i++) {
    const bitmap = await createImageBitmap(new Blob([encoded[i]!], { type: `image/${formats[i]}` }));
    if (bitmap.width !== pixels.width || bitmap.height !== pixels.height) throw new Error('output-dimensions');
    bitmap.close();
  }
  const entries = Object.fromEntries(encoded.map((buffer, i) => [`fixture.${formats[i]}`, new Uint8Array(buffer)]));
  const unzipped = unzipSync(zipSync(entries, { level: 0 }));
  return { kind: 'codecs', pngExact: equal(pixels.data, after.data), zipExact: Object.entries(entries).every(([key, value]) => Boolean(unzipped[key]) && equal(value, unzipped[key]!)),
    jpegSizes: jpegs.map((b) => b.byteLength), webpSizes: webps.map((b) => b.byteLength), formats, pngSizes: [bytes.byteLength, png.byteLength], elapsedMs: performance.now() - start };
}
async function archive(entryBytes: number, count: number): Promise<ProbeResult> {
  if (!Number.isSafeInteger(entryBytes) || !Number.isSafeInteger(count) || entryBytes < 1 || entryBytes > 16 * 1024 * 1024 || count < 1 || count > 4) return { kind: 'error', code: 'archive-experiment-limit' };
  const { zipSync, unzipSync } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (let index = 0; index < count; index++) {
    const bytes = new Uint8Array(entryBytes);
    let seed = index + 1;
    for (let i = 0; i < bytes.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; bytes[i] = seed & 255; }
    entries[`synthetic-${index + 1}.bin`] = bytes;
  }
  const start = performance.now();
  const zipped = zipSync(entries, { level: 0 });
  const zipMs = performance.now() - start;
  const verifyStart = performance.now();
  const extracted = unzipSync(zipped);
  const roundTrip = Object.entries(entries).every(([name, bytes]) => Boolean(extracted[name]) && equal(bytes, extracted[name]!));
  return { kind: 'archive', inputBytes: entryBytes * count, zip: new Blob([zipped], { type: 'application/zip' }), zipMs, verifyMs: performance.now() - verifyStart, roundTrip };
}
async function heic(bytes: ArrayBuffer, limit: number, exportJpeg = false): Promise<ProbeResult> {
  const start = performance.now();
  const { imageMeta } = await import('image-meta');
  const metadata = imageMeta(new Uint8Array(bytes));
  if (metadata.type !== 'heic' || !metadata.width || !metadata.height) return { kind: 'error', code: 'invalid-heic' };
  const probedPixels = metadata.width * metadata.height;
  if (!Number.isSafeInteger(probedPixels) || !Number.isSafeInteger(limit) || limit <= 0 || probedPixels > limit) return { kind: 'error', code: 'limit-before-codec' };
  const { default: build } = await import('@zero-experiment/libheif');
  const module: HeifModule = await build();
  const decoder = new module.HeifDecoder();
  let images: HeifImage[] = [];
  try {
    images = decoder.decode(bytes);
    // The candidate's high-level API takes images[0]; the experiment checks the primary flag.
    const primary = images.filter((image) => image.is_primary());
    if (primary.length !== 1 || images.length !== 1) return { kind: 'error', code: 'unsupported-primary-count' };
    const image = primary[0]!;
    const width = image.get_width(), height = image.get_height();
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || width <= 0 || height <= 0 || pixels > limit) return { kind: 'error', code: 'limit-before-rgba' };
    post({ kind: 'progress', phase: 'primary-checked' });
    const target = new ImageData(width, height);
    const decoded = await new Promise<ImageData>((resolve, reject) => image.display(target, (result) => result ? resolve(result) : reject(new Error('decode'))));
    if (decoded.width !== width || decoded.height !== height || decoded.data.byteLength !== pixels * 4) return { kind: 'error', code: 'decoded-dimensions' };
    const samples = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]].map(([x, y]) => {
      const sx = x! < 0.5 ? Math.floor(width / 4) : width - 1 - Math.floor(width / 4);
      const sy = y! < 0.5 ? Math.floor(height / 4) : height - 1 - Math.floor(height / 4);
      const offset = (sy * width + sx) * 4;
      return [...decoded.data.subarray(offset, offset + 4)];
    });
    const decodeMs = performance.now() - start;
    let exports: { jpeg?: Blob; zip?: Blob; encodeMs?: number; zipMs?: number } = {};
    if (exportJpeg) {
      const { default: encode } = await import('@jsquash/jpeg/encode.js');
      const encodeStart = performance.now();
      const jpegBytes = await encode(decoded, { quality: 75 });
      const encodeMs = performance.now() - encodeStart;
      if (jpegBytes.byteLength > 32 * 1024 * 1024) return { kind: 'error', code: 'experimental-result-limit' };
      const { zipSync, unzipSync } = await import('fflate');
      const zipStart = performance.now();
      const zipped = zipSync({ 'image-lab-result.jpg': new Uint8Array(jpegBytes) }, { level: 0 });
      if (!equal(unzipSync(zipped)['image-lab-result.jpg']!, new Uint8Array(jpegBytes))) throw new Error('zip');
      exports = { jpeg: new Blob([jpegBytes], { type: 'image/jpeg' }), zip: new Blob([zipped], { type: 'application/zip' }), encodeMs, zipMs: performance.now() - zipStart };
    }
    return { kind: 'heic', decodeMs, ...exports, width: decoded.width, height: decoded.height, pixels, primary: image.is_primary(), imageCount: images.length, rgbaBytes: target.data.byteLength, samples, elapsedMs: performance.now() - start };
  } finally {
    for (const image of images) image.free();
    if (decoder.decoder) module.heif_context_free(decoder.decoder);
  }
}
self.onmessage = async ({ data }: MessageEvent<ProbeRequest>) => {
  try {
    if (data.operation === 'archive') { post({ kind: 'result', result: await archive(data.entryBytes, data.entries) }); return; }
    if (data.operation === 'spin') { while (true) { /* Deterministic termination/timeout experiment. */ } }
    const bytes = data.operation === 'heic' && data.bytes ? data.bytes : await fixture(data.fixture!);
    if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('experimental-source-limit');
    const result = data.operation === 'codecs' ? await codecs(bytes) : await heic(bytes, data.pixelLimit, data.exportJpeg);
    post({ kind: 'result', result });
  } catch { post({ kind: 'result', result: { kind: 'error', code: 'codec' } }); }
};
