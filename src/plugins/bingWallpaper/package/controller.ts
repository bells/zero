import type {PaperWallpaper} from './archive.js';
import {updateSettings, type PaperAutomationState} from './automation.js';
import {applyPaper} from './applyWorkflow.js';
import {createSelectionSession, navigation, selectNewer, selectOlder} from './selection.js';
import {PaperError, checkActive, type PaperHostPort, type PaperPlatform, type PaperPreview} from './ports.js';
import {ARCHIVE_KEY, cacheArchive, mergeState, readArchiveCache, readSaved} from './storage.js';
export interface PaperViewState {
  items: readonly PaperWallpaper[];
  selected: PaperWallpaper | null;
  canSelectOlder: boolean;
  canSelectNewer: boolean;
  preview: PaperPreview | null;
  previewLoading: boolean;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  settingsLoaded: boolean;
  automation: PaperAutomationState | null;
  platform: PaperPlatform | null;
  busy: 'apply' | 'export' | 'settings' | 'recover' | null;
  scheduleStatus: 'off' | 'scheduled' | 'failed' | 'uncertain' | 'unsupported';
  nextAtMs: number | null;
  uncertain: boolean;
  error: PaperError | null;
  notice: 'applied' | 'saved' | null;
}
export interface PaperController {
  getSnapshot(): PaperViewState;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  refresh(): Promise<void>;
  refreshStatus(): Promise<void>;
  retry(): Promise<void>;
  selectOlder(): void;
  selectNewer(): void;
  latest(): void;
  apply(): Promise<void>;
  save(): Promise<void>;
  setAutoChangeDaily(enabled: boolean): Promise<void>;
  recover(): Promise<void>;
  dispose(): void;
}
export function createPaperController(host: PaperHostPort, options: {now?: () => number} = {}): PaperController {
  const now = options.now ?? Date.now;
  const session = createSelectionSession();
  const listeners = new Set<() => void>();
  const lifetime = new AbortController();
  let state: PaperViewState = {items: [], selected: null, canSelectOlder: false, canSelectNewer: false, preview: null,
    previewLoading: false, loading: true, refreshing: false, stale: false, settingsLoaded: false, automation: null,
    platform: null, busy: null, scheduleStatus: 'off', nextAtMs: null, uncertain: false, error: null, notice: null};
  let disposed = false, started = false, statusRevision = 0, refreshRevision = 0, previewRevision = 0;
  let archiveWritable = false;
  let refreshAbort: AbortController | null = null, previewAbort: AbortController | null = null;
  let foreground: Promise<void> = Promise.resolve();
  function publish(patch: Partial<PaperViewState>): void {
    if (disposed) return;
    state = {...state, ...patch};
    listeners.forEach(listener => listener());
  }
  function automationPatch(automation: PaperAutomationState): Partial<PaperViewState> {
    return {automation, settingsLoaded: true, uncertain: !!(automation.pendingIntent || automation.recoveryIntent)};
  }
  function release(preview: PaperPreview | null): void {
    if (preview) void host.releasePreview(preview.leaseId).catch(() => undefined);
  }
  function selectedPreview(): void {
    const revision = ++previewRevision;
    previewAbort?.abort(); previewAbort = new AbortController();
    const signal = previewAbort.signal;
    const selected = state.selected;
    release(state.preview); publish({preview: null, previewLoading: !!selected});
    if (!selected || disposed) return;
    void (async () => {
      let lease: PaperPreview | null = null;
      try {
        const asset = await host.cacheImage(selected.remoteUrl, signal);
        checkActive(signal);
        lease = await host.preview(asset.assetId);
        if (disposed || signal.aborted || revision !== previewRevision) {release(lease); return;}
        publish({preview: lease, previewLoading: false});
      } catch {
        release(lease);
        if (!disposed && revision === previewRevision && !signal.aborted) publish({previewLoading: false, error: new PaperError('paper.image', true)});
      }
    })();
  }
  function select(items: readonly PaperWallpaper[]): void {
    const selectedId = session.accept(items);
    const next = navigation(items, selectedId);
    const previous = state.selected;
    publish({items, ...next});
    if (previous?.id !== next.selected?.id || previous?.remoteUrl !== next.selected?.remoteUrl || !state.preview && !state.previewLoading) selectedPreview();
  }
  async function reconcileSchedule(explicitEnable = false): Promise<void> {
    const automation = state.automation;
    if (!automation || disposed) return;
    if (!state.platform?.supported && automation.settings.autoChangeDaily) {
      await host.cancelSchedule('paper-daily').catch(() => undefined);
      publish({scheduleStatus: 'unsupported', nextAtMs: null}); return;
    }
    if (state.uncertain && automation.settings.autoChangeDaily) {
      await host.cancelSchedule('paper-daily').catch(() => undefined);
      publish({scheduleStatus: 'uncertain', nextAtMs: null}); return;
    }
    try {
      if (!automation.settings.autoChangeDaily) {
        await host.cancelSchedule('paper-daily');
        publish({scheduleStatus: 'off', nextAtMs: null});
      } else {
        const nextAtMs = now() + 1000;
        await host.upsertSchedule({taskId: 'paper-daily', eventId: 'paper.daily', nextAtMs, payload: {explicitEnableAtMs: explicitEnable ? now() : null}});
        publish({scheduleStatus: 'scheduled', nextAtMs});
      }
    } catch {publish({scheduleStatus: 'failed', nextAtMs: null, error: new PaperError('paper.schedule', true)});}
  }
  async function refreshStatus(): Promise<void> {
    const revision = statusRevision;
    try {
      const {state: saved} = await readSaved(host);
      if (revision === statusRevision) publish(automationPatch(saved));
    } catch {if (revision === statusRevision) publish({settingsLoaded: false, error: new PaperError('paper.storage')});}
  }
  async function refresh(): Promise<void> {
    if (disposed) return;
    refreshAbort?.abort(); refreshAbort = new AbortController();
    const signal = refreshAbort.signal, revision = ++refreshRevision;
    publish({refreshing: true, notice: null});
    try {
      const fetched = await host.fetchArchive(signal);
      checkActive(signal);
      const checked = readArchiveCache({schemaVersion: 1, savedAt: now(), items: fetched}, now())!;
      if (revision !== refreshRevision || disposed) return;
      select(checked.items);
      publish({stale: false, ...(state.settingsLoaded && state.error?.code !== 'paper.schedule' ? {error: null} : {})});
      if (archiveWritable && state.settingsLoaded) await cacheArchive(host, checked.items, now()).catch(() => undefined);
    } catch (error) {
      if (disposed || signal.aborted || revision !== refreshRevision) return;
      publish({stale: state.items.length > 0, ...(state.error?.code === 'paper.storage' ? {} : {error: error instanceof PaperError ? error : new PaperError('paper.network', true)})});
    } finally {
      if (!disposed && revision === refreshRevision) publish({refreshing: false, loading: false});
    }
  }
  function queue(kind: NonNullable<PaperViewState['busy']>, operation: () => Promise<void>): Promise<void> {
    const run = foreground.then(async () => {
      if (disposed) return;
      publish({busy: kind, notice: null});
      try {await operation();}
      catch (error) {
        const safe = error instanceof PaperError ? error : new PaperError(kind === 'export' ? 'paper.image' : 'paper.apply', true);
        if (safe.code === 'paper.uncertain') {
          await refreshStatus(); publish({uncertain: true, scheduleStatus: state.automation?.settings.autoChangeDaily ? 'uncertain' : 'off'});
          await host.cancelSchedule('paper-daily').catch(() => undefined);
        }
        publish({error: safe});
      } finally {publish({busy: null});}
    });
    foreground = run.catch(() => undefined); return run;
  }
  const controller: PaperController = {
    getSnapshot: () => state,
    subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
    async start() {
      if (started || disposed) return;
      started = true; session.open();
      await refreshStatus();
      try {publish({platform: await host.platform()});} catch {publish({platform: {platform: 'unknown', supported: false}, error: new PaperError('paper.unsupported')});}
      try {
        const raw = await host.get(ARCHIVE_KEY);
        const cache = readArchiveCache(raw, now());
        archiveWritable = true;
        if (cache) {select(cache.items); publish({stale: true, loading: false});}
      } catch {if (!state.error) publish({error: new PaperError('paper.archive')});}
      await reconcileSchedule();
      await refresh();
    },
    refresh, refreshStatus,
    async retry() {await refreshStatus(); await reconcileSchedule(); await refresh();},
    selectOlder() {session.choose(selectOlder(state.items, state.selected?.id ?? null)); select(state.items);},
    selectNewer() {session.choose(selectNewer(state.items, state.selected?.id ?? null)); select(state.items);},
    latest() {session.latest(); select(state.items);},
    apply() {
      const item = state.selected;
      return queue('apply', async () => {
        if (!item || !state.settingsLoaded) throw new PaperError('paper.storage');
        if (!state.platform?.supported) throw new PaperError('paper.unsupported');
        const applied = await applyPaper(host, item, state.items, 'manual', now, lifetime.signal);
        statusRevision++; publish({...automationPatch(applied), notice: 'applied', error: null});
      });
    },
    save() {
      const item = state.selected;
      return queue('export', async () => {
        if (!item) return;
        const asset = await host.cacheImage(item.remoteUrl, lifetime.signal);
        checkActive(lifetime.signal);
        const result = await host.exportImage(asset.assetId, `Bing-${item.publicationDate}.jpg`, lifetime.signal);
        if (!result.cancelled) publish({notice: 'saved', error: null});
      });
    },
    setAutoChangeDaily(enabled) {
      return queue('settings', async () => {
        if (!state.settingsLoaded) throw new PaperError('paper.storage');
        if (enabled && !state.platform?.supported) throw new PaperError('paper.unsupported');
        let explicitEnable = false;
        const saved = await mergeState(host, current => {
          if (enabled && (current.pendingIntent || current.recoveryIntent)) throw new PaperError('paper.uncertain');
          const transition = updateSettings(current, {autoChangeDaily: enabled});
          explicitEnable = transition.explicitEnable;
          return transition.state;
        });
        statusRevision++; publish({...automationPatch(saved), error: null});
        await reconcileSchedule(explicitEnable);
      });
    },
    recover() {
      return queue('recover', async () => {
        const {state: before} = await readSaved(host);
        if (!before.pendingIntent && !before.recoveryIntent) {publish(automationPatch(before)); return;}
        await host.recoverWallpaper();
        const recovered = await mergeState(host, current => {
          if (JSON.stringify(current.pendingIntent) !== JSON.stringify(before.pendingIntent)
            || JSON.stringify(current.recoveryIntent) !== JSON.stringify(before.recoveryIntent)) throw new PaperError('paper.uncertain');
          return {...current, pendingIntent: null, recoveryIntent: null};
        });
        statusRevision++; publish({...automationPatch(recovered), error: null}); await reconcileSchedule();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true; lifetime.abort(); refreshAbort?.abort(); previewAbort?.abort();
      ++previewRevision; ++refreshRevision; release(state.preview); listeners.clear();
    },
  };
  return controller;
}
