import { useEffect, useRef } from "react";
import { formatEndTime, parseDuration } from "./caffeineSchedule";
import { CAFFEINE_DURATION_OPTIONS } from "./caffeineDuration";
import { useCaffeinePlugin } from "./useCaffeinePlugin";
import { createCaffeineTranslator, type TranslationKey } from "./i18n";
import type { BundledPluginPanelProps } from "../../core/pluginHost/pluginModule";
import "./caffeine.css";

interface CaffeinePanelProps { t: (key: TranslationKey) => string; language: string; editorRevision?: number; onEditorIntentConsumed?:()=>void; }

export function CaffeinePanel({ t, language, editorRevision, onEditorIntentConsumed }: CaffeinePanelProps) {
  const caffeine = useCaffeinePlugin();
  const currentDuration = caffeine.enabled ? caffeine.durationMinutes : caffeine.selectedDurationMinutes;
  const currentOption = CAFFEINE_DURATION_OPTIONS.find((option) => option.minutes === currentDuration);
  const lastEditorRevision=useRef<number|undefined>(undefined);
  const editorHeading=useRef<HTMLHeadingElement>(null);
  const customButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(editorRevision!==undefined && editorRevision!==lastEditorRevision.current){lastEditorRevision.current=editorRevision;caffeine.openEditor();onEditorIntentConsumed?.();}},[editorRevision,caffeine.openEditor,onEditorIntentConsumed]);
  const editorWasOpen=useRef(false);
  useEffect(()=>{
    if(caffeine.editorOpen)editorHeading.current?.focus();
    else if(editorWasOpen.current)customButton.current?.focus();
    editorWasOpen.current=caffeine.editorOpen;
  },[caffeine.editorOpen]);
  const until=caffeine.snapshot.schedule?.kind==="until";
  const currentLabel=until && caffeine.snapshot.expires_at_ms!==null
    ? `${t("caffeine.until")} ${formatEndTime(caffeine.snapshot.expires_at_ms,language,caffeine.now)}`
    : currentOption ? t(currentOption.labelKey as TranslationKey) : `${currentDuration} ${t("caffeine.durationValue")}`;
  const errorMessage = caffeine.actionError
    ? t(caffeine.actionError.code === "preferences_save_failed" ? "caffeine.save" : caffeine.actionError.code === "low_power_mode" ? "caffeine.lowPowerDenied" : caffeine.actionError.code === "hide_failed" ? "caffeine.error.hideFailed"
      : caffeine.actionError.code === "display_failed" ? "caffeine.error.displayFailed" : "caffeine.error.operationFailed")
    : caffeine.error ? t("caffeine.error.operationFailed") : null;

  return (
    <section className={`plugin-panel caffeine-panel${caffeine.editorOpen ? " editor-open" : ""}`} aria-busy={caffeine.isBusy}>
      <div className="panel-heading">
        <h2>{t("caffeine.title")}</h2>
        <span className={caffeine.enabled ? "status-pill active" : "status-pill"}>
          {caffeine.isLoading ? t("caffeine.loading") : caffeine.enabled ? t("caffeine.active") : t("caffeine.inactive")}
        </span>
      </div>
      <div className="awake-body">
        <dl className={caffeine.enabled ? "awake-dial active" : "awake-dial"}>
          <div className="awake-dial-core">
            <dt>{t("caffeine.elapsed")}</dt>
            <dd>{caffeine.elapsed}</dd>
          </div>
        </dl>
        <div className="awake-content">
          <dl className="awake-timing" aria-label={t("caffeine.metrics")}>
            <div className="awake-elapsed"><dt>{t("caffeine.elapsed")}</dt><dd>{caffeine.elapsed}</dd></div>
            <div><dt>{t("caffeine.duration.current")}</dt><dd>{currentLabel}</dd></div>
            {caffeine.enabled && caffeine.remaining !== null && (
              <div className="awake-remaining"><dt>{t("caffeine.message.remaining")}</dt><dd>{caffeine.finishing?t("caffeine.duration.expired"):caffeine.remaining}</dd></div>
            )}
          </dl>
          <fieldset className="awake-duration" disabled={caffeine.isLoading}>
            <legend>{t("caffeine.duration.title")}</legend>
            <div className="awake-presets">
              {CAFFEINE_DURATION_OPTIONS.map((option) => (
                <button type="button" key={option.compactLabel}
                  className={(!until && option.minutes === caffeine.selectedDurationMinutes) ? "awake-preset selected" : "awake-preset"}
                  onClick={() => caffeine.selectDuration(option.minutes)}
                  aria-disabled={caffeine.isBusy}
                  aria-pressed={(!until && option.minutes === caffeine.selectedDurationMinutes)}>
                  {t(option.labelKey as TranslationKey)}
                </button>
              ))}
            </div>
          </fieldset>
          <button ref={customButton} type="button" className="awake-custom-entry" onClick={caffeine.openEditor} aria-expanded={caffeine.editorOpen} aria-controls="awake-custom-editor">{t("caffeine.custom")}</button>
          {caffeine.editorOpen && <section className="awake-custom-editor" id="awake-custom-editor" aria-labelledby="awake-custom-title">
            <h3 id="awake-custom-title" ref={editorHeading} tabIndex={-1}>{t("caffeine.custom")}</h3>
            <label>{t("caffeine.duration.title")}<select value={caffeine.mode} onChange={e=>!caffeine.isBusy&&!caffeine.draftLoading&&caffeine.setMode(e.currentTarget.value==="until"?"until":"duration")}>
              <option value="duration">{t("caffeine.durationMode")}</option><option value="until">{t("caffeine.untilMode")}</option>
            </select></label>
            {caffeine.mode==="duration" ? <div className="awake-custom-fields">
              <label>{t("caffeine.hours")}<input type="number" inputMode="numeric" min="0" max="24" step="1" value={caffeine.hours} onChange={e=>!caffeine.isBusy&&!caffeine.draftLoading&&caffeine.setHours(e.currentTarget.value)} /></label>
              <label>{t("caffeine.minutes")}<input type="number" inputMode="numeric" min="0" max="59" step="1" value={caffeine.minutes} onChange={e=>!caffeine.isBusy&&!caffeine.draftLoading&&caffeine.setMinutes(e.currentTarget.value)} /></label>
            </div> : <label>{t("caffeine.time")}<input type="time" value={caffeine.time} onChange={e=>!caffeine.isBusy&&!caffeine.draftLoading&&caffeine.setTimePreview(e.currentTarget.value)}/></label>}
            <p className="awake-preview">{caffeine.mode==="duration" ? `${parseDuration(caffeine.hours,caffeine.minutes)??"—"} ${t("caffeine.durationValue")}`
              : caffeine.preview!==null ? `${t("caffeine.preview")} ${formatEndTime(caffeine.preview,language)} · ${Math.max(0,Math.ceil((caffeine.preview-Date.now())/60000))} ${t("caffeine.durationValue")}` : "—"}</p>
            {caffeine.draftError && <p className="awake-error" role="alert">{t(`caffeine.${caffeine.draftError}`)}</p>}
            <div className="awake-custom-actions">
              <button type="button" aria-disabled={caffeine.isBusy} onClick={()=>{caffeine.cancelEditor();if(!caffeine.isBusy)customButton.current?.focus();}}>{t("caffeine.cancel")}</button>
              <button type="button" aria-disabled={caffeine.isBusy||caffeine.draftLoading} onClick={()=>{void caffeine.applyCustom();}}>{caffeine.enabled?t("caffeine.apply"):t("caffeine.start")}</button>
            </div>
          </section>}
          {caffeine.snapshot.last_stop_reason && <p className="awake-notice" role="status">{t(`caffeine.stop.${caffeine.snapshot.last_stop_reason}`)}</p>}
          {caffeine.snapshot.battery_threshold_overridden && <p className="awake-notice">{t("caffeine.override")}</p>}
          {caffeine.snapshot.protection_unavailable && <p className="awake-notice" role="status">{t("caffeine.protectionUnavailable")}</p>}
          {errorMessage && <div className="awake-error" role="alert">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => { void caffeine.refresh(); }}>{t("caffeine.retry")}</button>
          </div>}
        </div>
      </div>
      <div className="awake-actions">
        <button type="button" className={caffeine.enabled ? "primary-action danger" : "primary-action"}
          onClick={caffeine.enabled ? caffeine.disable : caffeine.enable}
          disabled={caffeine.isLoading} aria-disabled={caffeine.isBusy}>
          {caffeine.isLoading ? t("caffeine.loading") : caffeine.enabled ? t("caffeine.disable") : t("caffeine.enable")}
        </button>
      </div>
    </section>
  );
}

export function CaffeinePluginPanel({ language, editorRevision, onEditorIntentConsumed }: BundledPluginPanelProps) {
  return <CaffeinePanel language={language} editorRevision={editorRevision} onEditorIntentConsumed={onEditorIntentConsumed} t={createCaffeineTranslator(language)} />;
}
