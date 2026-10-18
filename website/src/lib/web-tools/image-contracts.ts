export type ImageInputFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'heif';
export type ImageOutputFormat = 'jpeg' | 'png' | 'webp';
export type ImageErrorCode = 'unsupported' | 'invalid' | 'limit' | 'timeout' | 'cancelled' | 'decode' | 'encode' | 'resource' | 'download' | 'worker' | 'archive';
export type ImageResult<T> = { ok: true; value: T } | { ok: false; error: { code: ImageErrorCode } };
export type ImagePhase = 'probing' | 'decoding' | 'transforming' | 'encoding';
export interface ImageOutputSettings {
  format: ImageOutputFormat | 'preserve'; quality: number; maxLongEdge: number | null; jpegBackground: string;
}
export type WatermarkPosition = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export interface WatermarkTextSettings { text: string; fontRatio: number; color: string; opacity: number; rotation: number; marginRatio: number }
export type WatermarkSettings = WatermarkTextSettings & ({ mode: 'single'; position: WatermarkPosition } | { mode: 'tile'; spacingRatio: number });
export type ImageSettings =
  | { operation: 'convert' | 'compress'; output: ImageOutputSettings }
  | { operation: 'watermark'; output: ImageOutputSettings; watermark: WatermarkSettings };
// Values are supplied only after resource experiments; this contract defines no production defaults.
export interface ImageResourcePolicy {
  maxSourceBytes: number; maxPixels: number; maxEdge: number; maxBatchItems: number;
  maxBatchSourceBytes: number; maxResultBytes: number; maxBatchResultBytes: number;
  previewPixels: number; timeoutMs: number; maxZipBytes: number; zipTimeoutMs: number;
}
export interface ImageJobIdentity { jobId: number; batchRevision: number; itemId: string }
export interface ImageJobRequest extends ImageJobIdentity {
  kind: 'process'; settings: ImageSettings; policy: ImageResourcePolicy; bytes: ArrayBuffer;
}
export interface ImageOutputMetadata { format: ImageOutputFormat; mime: string; width: number; height: number; byteLength: number }
export interface ImageOutput extends ImageOutputMetadata { bytes: ArrayBuffer }
export type ImageWorkerMessage =
  | (ImageJobIdentity & { kind: 'progress'; phase: ImagePhase })
  | (ImageJobIdentity & { kind: 'result'; output: ImageOutput })
  | (ImageJobIdentity & { kind: 'error'; code: ImageErrorCode });
export const imagePhases: readonly ImagePhase[] = ['probing', 'decoding', 'transforming', 'encoding'];
const errors: readonly ImageErrorCode[] = ['unsupported', 'invalid', 'limit', 'timeout', 'cancelled', 'decode', 'encode', 'resource', 'download', 'worker', 'archive'];
const mimeTypes: Record<ImageOutputFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function integer(value: unknown, minimum: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum; }
function identity(value: Record<string, unknown>): value is Record<string, unknown> & ImageJobIdentity {
  return integer(value.jobId, 1) && integer(value.batchRevision, 0) && typeof value.itemId === 'string' && value.itemId.length > 0 && value.itemId.length <= 128;
}
export function parseImageMessage(value: unknown): ImageWorkerMessage | null {
  if (!object(value) || !identity(value)) return null;
  const id: ImageJobIdentity = { jobId: value.jobId, batchRevision: value.batchRevision, itemId: value.itemId };
  if (value.kind === 'progress' && imagePhases.includes(value.phase as ImagePhase)) return { kind: 'progress', ...id, phase: value.phase as ImagePhase };
  if (value.kind === 'error' && errors.includes(value.code as ImageErrorCode)) return { kind: 'error', ...id, code: value.code as ImageErrorCode };
  if (value.kind !== 'result' || !object(value.output)) return null;
  const output = value.output;
  if (output.format !== 'jpeg' && output.format !== 'png' && output.format !== 'webp') return null;
  if (output.mime !== mimeTypes[output.format] || !integer(output.width, 1) || !integer(output.height, 1) || !Number.isSafeInteger(output.width * output.height)) return null;
  if (!(output.bytes instanceof ArrayBuffer) || !integer(output.byteLength, 1) || output.byteLength !== output.bytes.byteLength) return null;
  return { kind: 'result', ...id, output: { format: output.format, mime: output.mime, width: output.width, height: output.height, byteLength: output.byteLength, bytes: output.bytes } };
}
