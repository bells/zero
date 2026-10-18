/// <reference lib="webworker" />
import type { ImageJobIdentity, ImageJobRequest, ImageWorkerMessage } from '../../lib/web-tools/image-contracts.ts';
import { imagePolicy, ImageTaskError } from '../../lib/web-tools/image-policy.ts';
import { validateImageSettings } from '../../lib/web-tools/image-settings.ts';
import { processImage } from './image-process.ts';
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
let active = false;
self.onmessage = async ({ data }: MessageEvent<unknown>) => {
  if (!record(data) || !Number.isSafeInteger(data.jobId) || (data.jobId as number) < 1 || !Number.isSafeInteger(data.batchRevision) || (data.batchRevision as number) < 0 || typeof data.itemId !== 'string' || !data.itemId || data.itemId.length > 128) return;
  const id: ImageJobIdentity = { jobId: data.jobId as number, batchRevision: data.batchRevision as number, itemId: data.itemId };
  const post = (message: ImageWorkerMessage, transfer: Transferable[] = []) => self.postMessage(message, transfer);
  if (active) { post({ kind: 'error', ...id, code: 'worker' }); return; }
  active = true;
  try {
    if (data.kind !== 'process' || !(data.bytes instanceof ArrayBuffer) || !record(data.policy) || Object.entries(imagePolicy).some(([key, value]) => data.policy && (data.policy as Record<string, unknown>)[key] !== value) || !validateImageSettings(data.settings as ImageJobRequest['settings']).ok) throw new ImageTaskError('invalid');
    const request: ImageJobRequest = { kind: 'process', ...id, bytes: data.bytes, settings: data.settings as ImageJobRequest['settings'], policy: imagePolicy };
    const output = await processImage(request, (phase) => post({ kind: 'progress', ...id, phase })); post({ kind: 'result', ...id, output }, [output.bytes]);
  } catch (error) { post({ kind: 'error', ...id, code: error instanceof ImageTaskError ? error.code : 'decode' }); } finally { active = false; }
};
