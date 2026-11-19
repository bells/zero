import type {PaperWallpaper} from './archive.js';
import {decideApply, prepareApply, settleApply, type PaperApplyOrigin, type PaperAutomationState} from './automation.js';
import {PaperError, checkActive, type PaperHostPort} from './ports.js';
import {PREFERENCES_KEY, jsonValue, mergeState, readSaved} from './storage.js';
export async function applyPaper(host: PaperHostPort, item: PaperWallpaper, items: readonly PaperWallpaper[], origin: PaperApplyOrigin,
  now: () => number, signal: AbortSignal, explicitEnable = false): Promise<PaperAutomationState> {
  checkActive(signal);
  const asset = await host.cacheImage(item.remoteUrl, signal);
  checkActive(signal);
  const {raw, state} = await readSaved(host);
  if (state.pendingIntent !== null || state.recoveryIntent !== null) throw new PaperError('paper.uncertain');
  if (origin === 'automatic') {
    const decision = decideApply(state, {now: now(), toolEnabled: true, platformSupported: true, stale: false, hasError: false,
      items, explicitEnable, retryAttempt: 0});
    if (decision.kind !== 'apply' || decision.wallpaperId !== item.id) return state;
  }
  checkActive(signal);
  const token = await host.prepareWallpaper(asset.assetId);
  try {
    checkActive(signal);
    const pending = prepareApply(state, {operationId: token.intentId, item, origin}, now());
    const result = await host.compareAndSet(PREFERENCES_KEY, raw, jsonValue(pending));
    if (!result.swapped) throw new PaperError('paper.storage', true);
  } catch {
    await host.cancelPrepared(token.intentId).catch(() => undefined);
    throw new PaperError('paper.storage');
  }
  try {
    checkActive(signal);
    const {state: admitted} = await readSaved(host);
    if (admitted.pendingIntent?.operationId !== token.intentId || admitted.recoveryIntent !== null) throw new PaperError('paper.uncertain');
    if (origin === 'automatic' && (!admitted.settings.autoChangeDaily || admitted.manualOverrideUntil !== null && admitted.manualOverrideUntil > now())) {
      await host.cancelPrepared(token.intentId);
      return await mergeState(host, current => {
        if (current.pendingIntent?.operationId !== token.intentId) throw new PaperError('paper.uncertain');
        return settleApply(current, token.intentId, 'failed', now(), null);
      });
    }
    checkActive(signal);
    const receipt = await host.applyWallpaper(token.intentId);
    if (receipt !== 'applied' && receipt !== 'alreadyApplied') throw new PaperError('paper.uncertain');
    const latestDate = items[0]?.publicationDate ?? null;
    return await mergeState(host, current => {
      if (current.pendingIntent?.operationId !== token.intentId) throw new PaperError('paper.uncertain');
      return settleApply(current, token.intentId, 'applied', now(), latestDate);
    });
  } catch {
    // A missing native receipt or missing durable settlement is never replay permission.
    throw new PaperError('paper.uncertain');
  }
}
