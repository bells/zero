import { imageMeta } from 'image-meta';
import type { ImageInputFormat, ImageResult } from './image-contracts.ts';
import { assertImageDimensions, imagePolicy, ImageTaskError } from './image-policy.ts';
import { pngChunks } from './image-png.ts';
const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
export function inspectImageInput(bytes: Uint8Array): ImageResult<{ format: ImageInputFormat; width: number; height: number }> {
  try {
    if (!bytes.length) throw new ImageTaskError('invalid');
    if (bytes.length > imagePolicy.maxSourceBytes) throw new ImageTaskError('limit');
    let format: ImageInputFormat;
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      format = 'jpeg'; let offset = 2;
      while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 255) throw new ImageTaskError('invalid');
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++]!; if (marker === 218 || marker === 217) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        if (offset + 2 > bytes.length) throw new ImageTaskError('invalid');
        const length = bytes[offset]! * 256 + bytes[offset + 1]!;
        if (length < 2 || offset + length > bytes.length) throw new ImageTaskError('invalid');
        if (marker === 226 && ascii(bytes, offset + 2, 4) === 'MPF\0') throw new ImageTaskError('unsupported');
        offset += length;
      }
    }
    else if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') { format = 'png'; if (pngChunks(bytes).some((c) => c.type === 'acTL')) throw new ImageTaskError('unsupported'); }
    else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      format = 'webp'; const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(4, true) + 8 !== bytes.length) throw new ImageTaskError('invalid');
      let p = 12; while (p + 8 <= bytes.length) { const type = ascii(bytes, p, 4), size = view.getUint32(p + 4, true); if (p + 8 + size > bytes.length) throw new ImageTaskError('invalid'); if (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && size > 0 && (bytes[p + 8]! & 2))) throw new ImageTaskError('unsupported'); p += 8 + size + (size % 2); } if (p !== bytes.length) throw new ImageTaskError('invalid');
    } else if (ascii(bytes, 4, 4) === 'ftyp') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), size = view.getUint32(0);
      if (size < 16 || size > bytes.length) throw new ImageTaskError('invalid');
      const brands = [ascii(bytes, 8, 4)]; for (let i = 16; i + 4 <= size; i += 4) brands.push(ascii(bytes, i, 4));
      if (brands.some((b) => ['hevc', 'hevx', 'msf1'].includes(b))) throw new ImageTaskError('unsupported');
      if (brands.some((b) => ['heic', 'heix'].includes(b))) format = 'heic'; else if (brands.includes('mif1')) format = 'heif'; else throw new ImageTaskError('unsupported');
    } else throw new ImageTaskError('unsupported');
    const meta = imageMeta(bytes);
    if (!meta.width || !meta.height || !['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(meta.type ?? '')) throw new ImageTaskError('invalid');
    assertImageDimensions(meta.width, meta.height);
    return { ok: true, value: { format, width: meta.width, height: meta.height } };
  } catch (error) { return { ok: false, error: { code: error instanceof ImageTaskError ? error.code : 'invalid' } }; }
}
