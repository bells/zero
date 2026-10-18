import { imagePhases } from './image-contracts.ts';
import type { ImageErrorCode, ImageInputFormat, ImageJobIdentity, ImageOutputMetadata, ImagePhase, ImageResult, ImageSettings, ImageWorkerMessage } from './image-contracts.ts';
export interface ImageSourceDescriptor { itemId: string; sourceBytes: number; format: ImageInputFormat | null }
type ItemState =
  | { status: 'queued' | 'cancelled'; attempt: number }
  | { status: ImagePhase; attempt: number; jobId: number }
  | { status: 'failed'; attempt: number; error: ImageErrorCode }
  | { status: 'success'; attempt: number; result: { identity: ImageJobIdentity; output: ImageOutputMetadata } };
export type ImageBatchItem = ImageSourceDescriptor & ItemState;
export interface ImageBatch {
  revision: number; settings: ImageSettings; items: readonly ImageBatchItem[];
  active: ImageJobIdentity | null; queue: readonly string[]; nextJobId: number; mode: 'idle' | 'running' | 'cancelled';
}
const validFormats: readonly (ImageInputFormat | null)[] = ['jpeg', 'png', 'webp', 'heic', 'heif', null];
function copySettings(settings: ImageSettings): ImageSettings {
  return settings.operation === 'watermark' ? { ...settings, output: { ...settings.output }, watermark: { ...settings.watermark } } : { ...settings, output: { ...settings.output } };
}
function source(item: ImageSourceDescriptor): ImageSourceDescriptor { return { itemId: item.itemId, sourceBytes: item.sourceBytes, format: item.format }; }
function queued(item: ImageBatchItem): ImageBatchItem { return { ...source(item), status: 'queued', attempt: item.attempt }; }
function good<T>(value: T): ImageResult<T> { return { ok: true, value }; }
function invalid<T>(): ImageResult<T> { return { ok: false, error: { code: 'invalid' } }; }
export function createImageBatch(settings: ImageSettings): ImageBatch {
  return { revision: 0, settings: copySettings(settings), items: [], active: null, queue: [], nextJobId: 1, mode: 'idle' };
}
export function replaceImageSources(state: ImageBatch, sources: readonly ImageSourceDescriptor[]): ImageResult<ImageBatch> {
  if (!Number.isSafeInteger(state.revision + 1) || new Set(sources.map((item) => item.itemId)).size !== sources.length) return invalid();
  if (sources.some((item) => !item.itemId || item.itemId.length > 128 || !Number.isSafeInteger(item.sourceBytes) || item.sourceBytes <= 0 || !validFormats.includes(item.format))) return invalid();
  return good({ ...state, revision: state.revision + 1, items: sources.map((item) => ({ ...source(item), status: 'queued', attempt: 0 })), queue: [], active: null, mode: 'idle' });
}
export function changeImageSettings(state: ImageBatch, settings: ImageSettings): ImageResult<ImageBatch> {
  const next = replaceImageSources(state, state.items);
  return next.ok ? good({ ...next.value, settings: copySettings(settings) }) : next;
}
export function clearImageBatch(state: ImageBatch): ImageResult<ImageBatch> { return replaceImageSources(state, []); }
export function startImageBatch(state: ImageBatch, selection: 'pending' | 'failed' = 'pending'): ImageResult<ImageBatch> {
  if (state.mode === 'running' || state.active) return invalid();
  const selected = state.items.filter((item) => selection === 'failed' ? item.status === 'failed' : item.status !== 'success');
  const queue = selected.map((item) => item.itemId);
  const ids = new Set(queue);
  return good({ ...state, items: state.items.map((item) => ids.has(item.itemId) ? queued(item) : item), queue, active: null, mode: queue.length ? 'running' : 'idle' });
}
export function nextImageJob(state: ImageBatch): ImageResult<{ state: ImageBatch; job: ImageJobIdentity | null }> {
  if (state.active) return invalid();
  const itemId = state.queue[0];
  if (state.mode !== 'running' || !itemId) return good({ state, job: null });
  if (!Number.isSafeInteger(state.nextJobId + 1)) return invalid();
  const item = state.items.find((entry) => entry.itemId === itemId);
  if (!item || item.status !== 'queued' || !Number.isSafeInteger(item.attempt + 1)) return invalid();
  const job = { jobId: state.nextJobId, batchRevision: state.revision, itemId };
  return good({ job, state: { ...state, nextJobId: state.nextJobId + 1, active: job, queue: state.queue.slice(1), items: state.items.map((entry) => entry.itemId === itemId ? { ...source(entry), status: 'probing', attempt: entry.attempt + 1, jobId: job.jobId } : entry) } });
}
export function cancelImageBatch(state: ImageBatch): ImageBatch {
  return { ...state, active: null, queue: [], mode: 'cancelled', items: state.items.map((item) => item.status === 'queued' || imagePhases.includes(item.status as ImagePhase) ? { ...source(item), status: 'cancelled', attempt: item.attempt } : item) };
}
export function acceptImageMessage(state: ImageBatch, message: ImageWorkerMessage): ImageBatch {
  const job = state.active;
  if (!job || message.jobId !== job.jobId || message.batchRevision !== job.batchRevision || message.batchRevision !== state.revision || message.itemId !== job.itemId) return state;
  const item = state.items.find((entry) => entry.itemId === job.itemId);
  if (!item || !imagePhases.includes(item.status as ImagePhase)) return state;
  let updated: ImageBatchItem;
  if (message.kind === 'progress') {
    if (imagePhases.indexOf(message.phase) < imagePhases.indexOf(item.status as ImagePhase)) return state;
    updated = { ...source(item), status: message.phase, attempt: item.attempt, jobId: job.jobId };
  } else if (message.kind === 'error') updated = { ...source(item), status: 'failed', attempt: item.attempt, error: message.code };
  else {
    const { format, mime, width, height, byteLength } = message.output;
    updated = { ...source(item), status: 'success', attempt: item.attempt, result: { identity: { ...job }, output: { format, mime, width, height, byteLength } } };
  }
  return { ...state, active: message.kind === 'progress' ? job : null, mode: message.kind === 'progress' || state.queue.length ? 'running' : 'idle', items: state.items.map((entry) => entry.itemId === item.itemId ? updated : entry) };
}
export function currentImageResults(state: ImageBatch): readonly (ImageSourceDescriptor & Extract<ItemState, { status: 'success' }>)[] {
  return state.items.filter((item): item is ImageSourceDescriptor & Extract<ItemState, { status: 'success' }> => item.status === 'success' && item.result.identity.batchRevision === state.revision);
}
