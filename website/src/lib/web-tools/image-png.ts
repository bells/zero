import { ImageTaskError } from './image-policy.ts';
export interface PngChunk { type: string; start: number; end: number }
export function pngChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = []; const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length || !Number.isSafeInteger(end)) throw new ImageTaskError('invalid');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); chunks.push({ type, start: offset, end }); offset = end;
    if (type === 'IEND') { if (offset !== bytes.length) throw new ImageTaskError('invalid'); return chunks; }
  }
  throw new ImageTaskError('invalid');
}
export function stripPngMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  // Keep pixel data and numeric rendering hints; arbitrary ICC profiles can contain identifying descriptions.
  const allowed = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM', 'sBIT']);
  const chunks = pngChunks(bytes).filter((chunk) => allowed.has(chunk.type));
  const result = new Uint8Array(8 + chunks.reduce((sum, chunk) => sum + chunk.end - chunk.start, 0)); result.set(bytes.subarray(0, 8));
  let offset = 8; for (const chunk of chunks) { result.set(bytes.subarray(chunk.start, chunk.end), offset); offset += chunk.end - chunk.start; } return result;
}

export function pngExifOrientation(bytes: Uint8Array): number {
  const exif = pngChunks(bytes).filter((chunk) => chunk.type === 'eXIf');
  if (exif.length > 1) throw new ImageTaskError('invalid');
  if (!exif.length) return 1;
  const chunk = exif[0]!, payload = bytes.subarray(chunk.start + 8, chunk.end - 4);
  if (payload.length < 8) throw new ImageTaskError('invalid');
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const little = payload[0] === 73 && payload[1] === 73;
  if (!little && !(payload[0] === 77 && payload[1] === 77)) throw new ImageTaskError('invalid');
  if (view.getUint16(2, little) !== 42) throw new ImageTaskError('invalid');
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > payload.length) throw new ImageTaskError('invalid');
  const count = view.getUint16(offset, little);
  if (offset + 2 + count * 12 + 4 > payload.length) throw new ImageTaskError('invalid');
  let orientation = 1, found = false;
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x112) continue;
    if (found || view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) throw new ImageTaskError('invalid');
    orientation = view.getUint16(entry + 8, little); found = true;
    if (orientation < 1 || orientation > 8) throw new ImageTaskError('invalid');
  }
  return orientation;
}
export interface ImagePixels<T extends Uint8ClampedArray | Uint16Array = Uint8ClampedArray<ArrayBuffer>> { width: number; height: number; data: T }
export function orientImagePixels(source: ImagePixels<Uint16Array>, orientation: number): ImagePixels<Uint16Array<ArrayBuffer>>;
export function orientImagePixels(source: ImagePixels, orientation: number): ImagePixels;
export function orientImagePixels(source: ImagePixels<Uint8ClampedArray | Uint16Array>, orientation: number): ImagePixels<Uint8ClampedArray | Uint16Array> {
  if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8 || source.data.length !== source.width * source.height * 4) throw new ImageTaskError('invalid');
  if (orientation === 1) return source;
  const width = orientation >= 5 ? source.height : source.width, height = orientation >= 5 ? source.width : source.height;
  const data = source.data instanceof Uint16Array ? new Uint16Array(source.data.length) : new Uint8ClampedArray(source.data.length);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    let dx = x, dy = y;
    if (orientation === 2) dx = source.width - 1 - x;
    if (orientation === 3) { dx = source.width - 1 - x; dy = source.height - 1 - y; }
    if (orientation === 4) dy = source.height - 1 - y;
    if (orientation === 5) { dx = y; dy = x; }
    if (orientation === 6) { dx = source.height - 1 - y; dy = x; }
    if (orientation === 7) { dx = source.height - 1 - y; dy = source.width - 1 - x; }
    if (orientation === 8) { dx = y; dy = source.width - 1 - x; }
    data.set(source.data.subarray((y * source.width + x) * 4, (y * source.width + x + 1) * 4), (dy * width + dx) * 4);
  }
  return { width, height, data };
}

export function png16EncoderPixels(source: ImagePixels<Uint16Array>): ImagePixels<Uint16Array<ArrayBuffer>> {
  // jSquash 3.1.1 forwards Uint16Array.buffer as raw bytes; its PNG writer requires network byte order.
  const data = new Uint16Array(source.data.length), view = new DataView(data.buffer);
  for (let index = 0; index < source.data.length; index++) view.setUint16(index * 2, source.data[index]!, false);
  return { width: source.width, height: source.height, data };
}
