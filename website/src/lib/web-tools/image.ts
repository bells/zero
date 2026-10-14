import { imageMeta } from 'image-meta';
import { decodeBytes, encodeBytes } from './encoding.ts';
import { fail, limits, textFits, type JobValue, type Result } from './contracts.ts';
const mimes: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
export function inspectImage(bytes: Uint8Array, declared?: string): Result<Omit<JobValue, 'text'>> {
  if (!bytes.length || bytes.length > limits.image) return fail('limit');
  try {
    const meta = imageMeta(bytes);
    const mime = mimes[meta.type ?? ''];
    if (!mime || (declared && declared !== mime)) return fail('image');
    if (!Number.isSafeInteger(meta.width) || !Number.isSafeInteger(meta.height) || meta.width <= 0 || meta.height <= 0) return fail('image');
    if (meta.width * meta.height > limits.pixels) return fail('limit');
    return { ok: true, value: { bytes, mime, width: meta.width, height: meta.height } };
  } catch { return fail('image'); }
}
export function transformImage(input: string | Uint8Array, declared?: string): Result<JobValue> {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    if (!textFits(input, limits.encodedImage)) return fail('limit');
    let encoded = input.trim();
    if (encoded.startsWith('data:')) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]*)$/.exec(encoded);
      if (!match) return fail('image');
      declared = match[1]; encoded = match[2] ?? '';
    }
    const decoded = decodeBytes(encoded, limits.image);
    if (!decoded.ok) return decoded;
    bytes = decoded.value;
  } else bytes = input;
  const image = inspectImage(bytes, declared);
  if (!image.ok) return image;
  return { ok: true, value: { ...image.value, text: `data:${image.value.mime};base64,${encodeBytes(bytes)}` } };
}
