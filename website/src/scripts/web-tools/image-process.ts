import type { ImageJobRequest, ImageOutput, ImagePhase } from '../../lib/web-tools/image-contracts.ts';
import { assertImageDimensions, imagePolicy, ImageTaskError } from '../../lib/web-tools/image-policy.ts';
import { inspectImageInput } from '../../lib/web-tools/image-input.ts';
import { stripPngMetadata, pngExifOrientation, orientImagePixels, png16EncoderPixels } from '../../lib/web-tools/image-png.ts';
import { validateImageSettings } from '../../lib/web-tools/image-settings.ts';
import { resizedImageDimensions, watermarkGeometry } from '../../lib/web-tools/image-geometry.ts';
interface HeifImage { get_width(): number; get_height(): number; is_primary(): boolean; display(target: ImageData, callback: (pixels: ImageData | null) => void): void; free(): void }
interface HeifModule { HeifDecoder: new () => { decoder: number; decode(bytes: ArrayBuffer): HeifImage[] }; heif_context_free(context: number): void }
async function heifPixels(bytes: ArrayBuffer): Promise<ImageData> {
  const imported: unknown = await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}image-codecs/libheif-rebuilt.js`);
  if (typeof imported !== 'object' || imported === null || !('default' in imported) || typeof imported.default !== 'function') throw new ImageTaskError('decode');
  const build = imported.default as () => Promise<HeifModule>;
  const module = await build(), decoder = new module.HeifDecoder(); let images: HeifImage[] = [];
  try {
    images = decoder.decode(bytes);
    if (images.length !== 1 || !images[0]!.is_primary()) throw new ImageTaskError('unsupported');
    const image = images[0]!, width = image.get_width(), height = image.get_height(); assertImageDimensions(width, height);
    const target = new ImageData(width, height);
    const result = await new Promise<ImageData>((resolve, reject) => image.display(target, (pixels) => pixels ? resolve(pixels) : reject(new ImageTaskError('decode'))));
    if (result.width !== width || result.height !== height || result.data.byteLength !== width * height * 4) throw new ImageTaskError('decode'); return result;
  } finally { for (const image of images) image.free(); if (decoder.decoder) module.heif_context_free(decoder.decoder); }
}
function canvas(width: number, height: number): { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } {
  const value = new OffscreenCanvas(width, height), context = value.getContext('2d'); if (!context) throw new ImageTaskError('resource'); return { canvas: value, context };
}
export async function processImage(request: ImageJobRequest, progress: (phase: ImagePhase) => void): Promise<ImageOutput> {
  const validated = validateImageSettings(request.settings); if (!validated.ok) throw new ImageTaskError('invalid');
  const settings = validated.value; progress('probing');
  const inspection = inspectImageInput(new Uint8Array(request.bytes)); if (!inspection.ok) throw new ImageTaskError(inspection.error.code);
  const input = inspection.value, format = settings.output.format === 'preserve' ? input.format === 'heic' || input.format === 'heif' ? 'jpeg' : input.format : settings.output.format;
  progress('decoding'); let pixels: ImageData;
  const pngOriginal = input.format === 'png' && format === 'png' && settings.operation !== 'watermark' && (settings.output.maxLongEdge === null || settings.output.maxLongEdge >= Math.max(input.width, input.height));
  let exactPng: ArrayBuffer | null = null;
  if (input.format === 'png') {
    const sourceBytes = new Uint8Array(request.bytes), orientation = pngExifOrientation(sourceBytes);
    const cleanBytes = stripPngMetadata(sourceBytes).buffer;
    const { default: decode } = await import('@jsquash/png/decode.js');
    if (pngOriginal && sourceBytes[24] === 16) {
      const decoded = await decode(cleanBytes, { bitDepth: 16 });
      let oriented;
      try {
        assertImageDimensions(decoded.width, decoded.height);
        if (decoded.width !== input.width || decoded.height !== input.height) throw new ImageTaskError('decode');
        progress('transforming');
        // Identity optimization only needs dimensions; rotations return owned samples before WASM release.
        oriented = orientation === 1 ? { width: decoded.width, height: decoded.height, data: new Uint16Array() } : orientImagePixels({ width: decoded.width, height: decoded.height, data: decoded.data }, orientation);
      } finally { decoded.free(); }
      progress('encoding');
      let bytes: ArrayBuffer;
      try {
        const { default: optimise } = await import('@jsquash/oxipng/optimise.js');
        if (orientation === 1) bytes = await optimise(cleanBytes, { level: 2, optimiseAlpha: false, interlace: false });
        else { const { default: encode } = await import('@jsquash/png/encode.js'); bytes = await optimise(await encode(png16EncoderPixels(oriented), { bitDepth: 16 }), { level: 2, optimiseAlpha: false, interlace: false }); }
        bytes = stripPngMetadata(new Uint8Array(bytes)).buffer;
      } catch { throw new ImageTaskError('encode'); }
      if (bytes.byteLength > imagePolicy.maxResultBytes) throw new ImageTaskError('limit');
      const checked = inspectImageInput(new Uint8Array(bytes));
      if (!checked.ok || checked.value.format !== 'png' || checked.value.width !== oriented.width || checked.value.height !== oriented.height) throw new ImageTaskError('encode');
      return { bytes, format: 'png', mime: 'image/png', width: oriented.width, height: oriented.height, byteLength: bytes.byteLength };
    }
    const decoded = await decode(cleanBytes);
    assertImageDimensions(decoded.width, decoded.height);
    const oriented = orientImagePixels(decoded, orientation);
    pixels = new ImageData(oriented.data, oriented.width, oriented.height);
    if (pngOriginal && orientation === 1) exactPng = cleanBytes;
  } else if (input.format === 'heic' || input.format === 'heif') pixels = await heifPixels(request.bytes);
  else {
    let bitmap: ImageBitmap | null = null;
    try { bitmap = await createImageBitmap(new Blob([request.bytes]), { imageOrientation: 'from-image' }); assertImageDimensions(bitmap.width, bitmap.height); const surface = canvas(bitmap.width, bitmap.height); try { surface.context.drawImage(bitmap, 0, 0); pixels = surface.context.getImageData(0, 0, bitmap.width, bitmap.height); } finally { surface.canvas.width = 1; surface.canvas.height = 1; } }
    catch (error) { throw error instanceof ImageTaskError ? error : new ImageTaskError('decode'); } finally { bitmap?.close(); }
  }
  assertImageDimensions(pixels.width, pixels.height);
  if (!((pixels.width === input.width && pixels.height === input.height) || (pixels.width === input.height && pixels.height === input.width))) throw new ImageTaskError('decode');
  progress('transforming');
  const target = resizedImageDimensions(pixels.width, pixels.height, settings.output.maxLongEdge);
  if (target.width !== pixels.width || target.height !== pixels.height || settings.operation === 'watermark' || format === 'jpeg') {
    const source = canvas(pixels.width, pixels.height), output = canvas(target.width, target.height);
    try {
      source.context.putImageData(pixels, 0, 0); output.context.drawImage(source.canvas, 0, 0, target.width, target.height);
      if (settings.operation === 'watermark') {
        const w = settings.watermark, ctx = output.context, size = Math.min(target.width, target.height) * w.fontRatio;
        ctx.font = `${size}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = w.color; ctx.globalAlpha = w.opacity;
        const metrics = ctx.measureText(w.text); const margin = Math.min(target.width, target.height) * w.marginRatio;
        const angle = w.rotation * Math.PI / 180;
        const spanX = Math.abs(metrics.width * Math.cos(angle)) + Math.abs(size * Math.sin(angle));
        const spanY = Math.abs(metrics.width * Math.sin(angle)) + Math.abs(size * Math.cos(angle));
        const scale = Math.min(1, Math.max(1, target.width - margin * 2) / Math.max(1, spanX), Math.max(1, target.height - margin * 2) / Math.max(1, spanY));
        for (const draw of watermarkGeometry(target.width, target.height, w, metrics.width * scale, size * scale)) { ctx.save(); ctx.translate(draw.x, draw.y); ctx.rotate(draw.rotation); ctx.scale(scale, scale); ctx.fillText(w.text, 0, 0); ctx.restore(); }
        ctx.globalAlpha = 1;
      }
      if (format === 'jpeg') { output.context.globalCompositeOperation = 'destination-over'; output.context.fillStyle = settings.output.jpegBackground; output.context.fillRect(0, 0, target.width, target.height); }
      pixels = output.context.getImageData(0, 0, target.width, target.height);
    } finally { source.canvas.width = output.canvas.width = 1; source.canvas.height = output.canvas.height = 1; }
  }
  progress('encoding'); let bytes: ArrayBuffer;
  try {
    if (format === 'jpeg') { const { default: encode } = await import('@jsquash/jpeg/encode.js'); bytes = await encode(pixels, { quality: settings.output.quality }); }
    else if (format === 'webp') { const { default: encode } = await import('@jsquash/webp/encode.js'); bytes = await encode(pixels, { quality: settings.output.quality }); }
    else { const { default: optimise } = await import('@jsquash/oxipng/optimise.js'); if (exactPng) bytes = await optimise(exactPng, { level: 2, optimiseAlpha: false, interlace: false }); else { const { default: encode } = await import('@jsquash/png/encode.js'); bytes = await optimise(await encode(pixels), { level: 2, optimiseAlpha: false, interlace: false }); } bytes = stripPngMetadata(new Uint8Array(bytes)).buffer; }
  } catch { throw new ImageTaskError('encode'); }
  if (bytes.byteLength > imagePolicy.maxResultBytes) throw new ImageTaskError('limit');
  const checked = inspectImageInput(new Uint8Array(bytes));
  if (!checked.ok || checked.value.format !== format || checked.value.width !== pixels.width || checked.value.height !== pixels.height) throw new ImageTaskError('encode');
  return { bytes, format, mime: `image/${format}`, width: pixels.width, height: pixels.height, byteLength: bytes.byteLength };
}
