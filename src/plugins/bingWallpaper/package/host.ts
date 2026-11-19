import type {PluginMethod, PluginMethodMap, ZeroBridge} from '@zero/sdk';
import {fetchArchive, PaperRequestError} from './network.js';
import {PaperError, type PaperHostPort} from './ports.js';

type Failure = PaperError['code'];
function nativeFailure(code: string, kind: Failure, retryable: boolean): PaperError {
  if (code === 'request.cancelled' || code.startsWith('session.')) return new PaperError('paper.cancelled');
  if (['wallpaper.uncertain', 'wallpaper.prepared_conflict', 'wallpaper.owner_pending', 'wallpaper.slots_full'].includes(code)) {
    return new PaperError('paper.uncertain');
  }
  return new PaperError(kind, retryable);
}

export function createPaperHost(bridge: ZeroBridge): PaperHostPort {
  async function call<M extends PluginMethod>(method: M, payload: PluginMethodMap[M]['input'], kind: Failure,
    signal?: AbortSignal): Promise<PluginMethodMap[M]['output']> {
    if (signal?.aborted) throw new PaperError('paper.cancelled');
    const result = await bridge.request(method, payload, signal ? {signal} : undefined)
      .catch(() => {throw new PaperError(signal?.aborted ? 'paper.cancelled' : kind);});
    if (signal?.aborted) throw new PaperError('paper.cancelled');
    if (!result.ok) throw nativeFailure(result.error.code, kind, result.error.retryable);
    return result.value;
  }
  return {
    get: key => call('storage.get', {key}, 'paper.storage'),
    compareAndSet: (key, expectedValue, value) => call('storage.compareAndSet', {key, expectedValue, value}, 'paper.storage'),
    async fetchArchive(signal) {
      try { return await fetchArchive(bridge, Date.now(), signal); }
      catch (cause: unknown) {
        if (signal.aborted) throw new PaperError('paper.cancelled');
        if (cause instanceof PaperRequestError) throw nativeFailure(cause.code, 'paper.network', cause.retryable);
        throw new PaperError('paper.archive');
      }
    },
    cacheImage: (url, signal) => call('media.cacheImage', {url}, 'paper.image', signal),
    preview: assetId => call('media.preview', {assetId}, 'paper.image'),
    async releasePreview(leaseId) { await call('media.releasePreview', {leaseId}, 'paper.image'); },
    prepareWallpaper: assetId => call('wallpaper.prepare', {assetId, claimId: crypto.randomUUID()}, 'paper.apply'),
    async applyWallpaper(intentId) { return (await call('wallpaper.apply', {intentId}, 'paper.apply')).outcome; },
    async cancelPrepared(intentId) { await call('wallpaper.cancelPrepared', {intentId}, 'paper.apply'); },
    async recoverWallpaper() { await call('wallpaper.recover', {}, 'paper.uncertain'); },
    exportImage: (assetId, suggestedName, signal) => call('media.exportImage', {assetId, suggestedName}, 'paper.image', signal),
    platform: () => call('wallpaper.platform', {}, 'paper.unsupported'),
    upsertSchedule: input => call('schedule.upsert', input, 'paper.schedule'),
    async cancelSchedule(taskId) { return (await call('schedule.cancel', {taskId}, 'paper.schedule')).cancelled; },
  };
}
