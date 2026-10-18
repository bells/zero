import type { ImageErrorCode, ImageResourcePolicy, ImageSettings } from './image-contracts.ts';
export const imagePolicy: ImageResourcePolicy = Object.freeze({ maxSourceBytes: 16 * 1024 ** 2, maxPixels: 12_200_000, maxEdge: 8192, maxBatchItems: 10, maxBatchSourceBytes: 64 * 1024 ** 2, maxResultBytes: 16 * 1024 ** 2, maxBatchResultBytes: 32 * 1024 ** 2, previewPixels: 400_000, timeoutMs: 60_000, maxZipBytes: 32 * 1024 ** 2, zipTimeoutMs: 10_000 });
export class ImageTaskError extends Error { readonly code: ImageErrorCode; constructor(code: ImageErrorCode) { super(code); this.name = 'ImageTaskError'; this.code = code; } }
export function defaultImageSettings(operation: 'convert' | 'watermark' | 'compress'): ImageSettings {
  const output = { format: 'preserve' as const, quality: 75, maxLongEdge: null, jpegBackground: '#ffffff' };
  return operation === 'watermark' ? { operation, output, watermark: { mode: 'single', position: 'bottom-right', text: '©', fontRatio: .05, opacity: .4, rotation: 0, marginRatio: .03, color: '#ffffff' } } : { operation, output };
}
export function assertImageDimensions(width: number, height: number): void {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0) || width > imagePolicy.maxEdge || height > imagePolicy.maxEdge || width * height > imagePolicy.maxPixels) throw new ImageTaskError('limit');
}
