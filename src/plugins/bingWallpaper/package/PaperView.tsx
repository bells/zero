import type {PaperController, PaperViewState} from './controller.js';
import {errorMessageKey, paperTranslator, type PaperLocale} from './i18n.js';
import {displayTitle} from './selection.js';
export type PaperSurface = 'main' | 'tray';
interface Props {state: PaperViewState; controller: Pick<PaperController, 'refresh' | 'refreshStatus' | 'selectOlder' | 'selectNewer' | 'latest' | 'apply' | 'save' | 'setAutoChangeDaily' | 'recover' | 'retry'>; locale: PaperLocale; surface: PaperSurface}
export function PaperView({state, controller, locale, surface}: Props) {
  const t = paperTranslator(locale);
  const selected = state.selected, title = displayTitle(selected, t('fallback'));
  const busy = state.busy !== null;
  const applied = state.automation?.lastApplied;
  const time = (value: number) => new Intl.DateTimeFormat(locale, {dateStyle: 'short', timeStyle: 'short'}).format(value);
  return <main className="paper-package" data-surface={surface} lang={locale} aria-busy={state.loading}>
    <header className="paper-header"><h1>{t('title')}</h1><div className="paper-browse" role="group" aria-label={t('title')}>
      <button type="button" disabled={!state.canSelectOlder} onClick={controller.selectOlder}>{t('older')}</button>
      <button type="button" disabled={!state.canSelectNewer} onClick={controller.selectNewer}>{t('newer')}</button>
      <button type="button" disabled={!selected} onClick={controller.latest}>{t('latest')}</button>
      <button type="button" disabled={state.refreshing} aria-busy={state.refreshing} onClick={() => void controller.refresh()}>{t('refresh')}</button>
    </div></header>
    {selected ? <section className="paper-photo" aria-label={title}>
      <button type="button" className="paper-preview" aria-label={t('apply')} title={t('apply')}
        disabled={!state.preview || busy || !state.platform?.supported || !state.settingsLoaded || state.uncertain}
        onClick={() => void controller.apply()}>
        {state.preview ? <img src={state.preview.url} alt={title} /> : <span>{t(state.previewLoading ? 'previewLoading' : 'previewUnavailable')}</span>}
        {state.busy === 'apply' ? <span className="paper-preview-status">{t('applying')}</span> : null}
      </button>
      <div className="paper-caption"><div className="paper-date"><time dateTime={selected.publicationDate}>{selected.publicationDate}</time><span>{t('source')}</span></div>
        <h2>{title}</h2><p>{selected.attribution || t('fallback')}</p>
        <div className="paper-actions"><button type="button" disabled={busy} onClick={() => void controller.save()}>{t(state.busy === 'export' ? 'saving' : 'download')}</button>
          <button type="button" className="paper-primary" disabled={busy || !state.platform?.supported || !state.settingsLoaded || state.uncertain}
            onClick={() => void controller.apply()}>{t(state.busy === 'apply' ? 'applying' : 'apply')}</button></div>
      </div>
    </section> : <section className="paper-empty" role="status"><p>{t(state.loading ? 'loading' : 'empty')}</p>
      {!state.loading ? <button type="button" onClick={() => void controller.retry()}>{t('retry')}</button> : null}</section>}
    {state.refreshing || state.stale ? <p className="paper-refresh-state" role="status">{t(state.refreshing ? 'refreshing' : 'offline')}</p> : null}
    {state.notice ? <p className="paper-feedback" role="status">{t(state.notice === 'applied' ? 'applied' : 'saved')}</p> : null}
    {state.uncertain ? <div className="paper-warning" role="alert"><p>{t('uncertain')}</p><button type="button" disabled={busy} onClick={() => void controller.recover()}>{t('recover')}</button></div> : null}
    {state.error && state.error.code !== 'paper.uncertain' ? <div className="paper-error" role="alert"><p>{t(errorMessageKey(state.error.code))}</p>
      <button type="button" disabled={busy || state.refreshing} onClick={() => void controller.retry()}>{t('retry')}</button></div> : null}
    {state.platform?.supported === false ? <p className="paper-note">{t('unsupported')}</p> : null}
    <section className="paper-automation" aria-labelledby="paper-daily-heading"><div className="paper-toggle-row"><label id="paper-daily-heading" htmlFor="paper-daily">{t('daily')}</label>
      <input id="paper-daily" type="checkbox" role="switch" checked={state.automation?.settings.autoChangeDaily ?? false}
        disabled={busy || !state.settingsLoaded || !state.automation?.settings.autoChangeDaily && (!state.platform?.supported || state.uncertain)}
        onChange={event => void controller.setAutoChangeDaily(event.currentTarget.checked)} /></div>
      <p className="paper-note">{t('runningOnly')}</p>
      <p role="status">{t(state.scheduleStatus === 'failed' ? 'scheduleFailed' : state.scheduleStatus === 'scheduled' ? 'scheduled' : state.scheduleStatus === 'uncertain' ? 'uncertain' : state.scheduleStatus === 'unsupported' ? 'unsupported' : 'off')}</p>
      {surface === 'main' ? <><p className="paper-note">{t('manualProtection')}</p><dl className="paper-status-details">
        <dt>{t('lastApplied')}</dt><dd>{applied ? `${applied.publicationDate ?? '—'} · ${time(applied.appliedAt)}` : '—'}</dd>
        {state.nextAtMs !== null ? <><dt>{t('nextCheck')}</dt><dd>{time(state.nextAtMs)}</dd></> : null}
        {state.automation?.manualOverrideUntil ? <><dt>{t('protectedUntil')}</dt><dd>{time(state.automation.manualOverrideUntil)}</dd></> : null}
      </dl></> : null}
    </section>
  </main>;
}
