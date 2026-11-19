import {decideApply} from './automation.js';
import {applyPaper} from './applyWorkflow.js';
import {marketDay, retryAt} from './policy.js';
import {PaperError, checkActive, type PaperHostPort} from './ports.js';
import {cacheArchive, readSaved} from './storage.js';
export interface PaperBackgroundContext {attempt: number; signal: AbortSignal; now?: number; explicitEnableAtMs?: number}
export interface PaperBackgroundResult {outcome: 'completed' | 'retry' | 'failed'; nextAtMs: number | null}
export async function runPaperBackground(host: PaperHostPort, context: PaperBackgroundContext): Promise<PaperBackgroundResult> {
  let now = context.now ?? Date.now();
  const explicitEnable = () => typeof context.explicitEnableAtMs === 'number' && Number.isFinite(context.explicitEnableAtMs)
    && context.explicitEnableAtMs <= now && now - context.explicitEnableAtMs < 60_000;
  if (!Number.isSafeInteger(context.attempt) || context.attempt < 1) return {outcome: 'failed', nextAtMs: null};
  const attempt = context.attempt - 1;
  try {marketDay(now);} catch {return {outcome: 'failed', nextAtMs: null};}
  try {
    checkActive(context.signal);
    const saved = await readSaved(host);
    if (!saved.state.settings.autoChangeDaily) return {outcome: 'completed', nextAtMs: null};
    if (saved.state.pendingIntent || saved.state.recoveryIntent) return {outcome: 'failed', nextAtMs: null};
    const platform = await host.platform();
    if (!platform.supported) return {outcome: 'failed', nextAtMs: null};
    const items = await host.fetchArchive(context.signal);
    checkActive(context.signal);
    await cacheArchive(host, items, now).catch(() => undefined);
    now = context.now ?? Date.now();
    const {state} = await readSaved(host);
    if (state.recoveryIntent) return {outcome: 'failed', nextAtMs: null};
    let decision = decideApply(state, {now, toolEnabled: true, platformSupported: true, stale: false, hasError: false,
      items, explicitEnable: explicitEnable(), retryAttempt: attempt});
    if (decision.kind === 'blockedUncertain') return {outcome: 'failed', nextAtMs: null};
    if (decision.kind === 'apply') {
      const wallpaperId = decision.wallpaperId;
      const item = items.find(item => item.id === wallpaperId);
      if (!item) return {outcome: 'failed', nextAtMs: null};
      const settled = await applyPaper(host, item, items, 'automatic', () => context.now ?? Date.now(), context.signal, explicitEnable());
      if (settled.recoveryIntent || settled.pendingIntent) return {outcome: 'failed', nextAtMs: null};
      decision = decideApply(settled, {now, toolEnabled: true, platformSupported: true, stale: false, hasError: false,
        items, explicitEnable: explicitEnable(), retryAttempt: attempt});
    }
    return {outcome: decision.kind === 'retryWaiting' || decision.kind === 'refreshError' ? 'retry' : 'completed', nextAtMs: decision.nextCheckAt};
  } catch (error) {
    now = context.now ?? Date.now();
    if (error instanceof PaperError && ['paper.storage','paper.uncertain','paper.cancelled'].includes(error.code)) return {outcome: 'failed', nextAtMs: null};
    if (typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === false) return {outcome: 'failed', nextAtMs: null};
    return {outcome: 'retry', nextAtMs: retryAt(now, attempt)};
  }
}
