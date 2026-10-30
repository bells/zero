import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatEndTime, parseDuration } from "./caffeineSchedule";
import { CAFFEINE_DURATION_OPTIONS } from "./caffeineDuration";
import { useCaffeinePlugin } from "./useCaffeinePlugin";
import { createCaffeineTranslator, type TranslationKey } from "./i18n";
import type { BundledPluginPanelProps } from "../../core/pluginHost/pluginModule";
import "./caffeine.css";

interface CaffeinePanelProps {
  t: (key: TranslationKey) => string;
  language: string;
  editorRevision?: number;
  onEditorIntentConsumed?: () => void;
}

export function CaffeinePanel({ t, language, editorRevision, onEditorIntentConsumed }: CaffeinePanelProps) {
  const caffeine = useCaffeinePlugin();
  const currentDuration = caffeine.enabled ? caffeine.durationMinutes : caffeine.selectedDurationMinutes;
  const currentOption = CAFFEINE_DURATION_OPTIONS.find((option) => option.minutes === currentDuration);
  const lastEditorRevision = useRef<number | undefined>(undefined);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const customButton = useRef<HTMLButtonElement>(null);
  const editorWasOpen = useRef(false);

  useEffect(() => {
    if (editorRevision !== undefined && editorRevision !== lastEditorRevision.current) {
      lastEditorRevision.current = editorRevision;
      caffeine.openEditor();
      onEditorIntentConsumed?.();
    }
  }, [editorRevision, caffeine.openEditor, onEditorIntentConsumed]);

  useEffect(() => {
    if (caffeine.editorOpen) editorHeading.current?.focus();
    else if (editorWasOpen.current) customButton.current?.focus();
    editorWasOpen.current = caffeine.editorOpen;
  }, [caffeine.editorOpen]);

  const until = caffeine.snapshot.schedule?.kind === "until";
  const currentLabel = until && caffeine.snapshot.expires_at_ms !== null
    ? `${t("caffeine.until")} ${formatEndTime(caffeine.snapshot.expires_at_ms, language, caffeine.now)}`
    : currentOption ? t(currentOption.labelKey as TranslationKey) : `${currentDuration} ${t("caffeine.durationValue")}`;
  const remainingLabel = caffeine.finishing ? t("caffeine.duration.expired") : caffeine.remaining;
  const hasRemaining = caffeine.enabled && caffeine.remaining !== null;
  const editorBusy = caffeine.isBusy || caffeine.draftLoading;
  const totalMinutes = parseDuration(caffeine.hours, caffeine.minutes);
  const errorMessage = caffeine.actionError
    ? t(caffeine.actionError.code === "preferences_save_failed" ? "caffeine.save"
      : caffeine.actionError.code === "low_power_mode" ? "caffeine.lowPowerDenied"
      : caffeine.actionError.code === "hide_failed" ? "caffeine.error.hideFailed"
      : caffeine.actionError.code === "display_failed" ? "caffeine.error.displayFailed"
      : "caffeine.error.operationFailed")
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
        <div className={`awake-status${hasRemaining ? " has-remaining" : ""}`}>
          <dl className={caffeine.enabled ? "awake-dial active" : "awake-dial"}>
            <div className="awake-dial-core">
              <dt>{hasRemaining ? t("caffeine.message.remaining") : t("caffeine.elapsed")}</dt>
              <dd>{hasRemaining ? remainingLabel : caffeine.elapsed}</dd>
            </div>
          </dl>
          <dl className="awake-timing" aria-label={t("caffeine.metrics")}>
            <div className="awake-elapsed"><dt>{t("caffeine.elapsed")}</dt><dd>{caffeine.elapsed}</dd></div>
            <div><dt>{t(caffeine.enabled ? "caffeine.duration.current" : "caffeine.plan")}</dt><dd>{currentLabel}</dd></div>
            {hasRemaining && <div className="awake-remaining"><dt>{t("caffeine.message.remaining")}</dt><dd>{remainingLabel}</dd></div>}
          </dl>
        </div>
        <div className="awake-content">
          {!caffeine.editorOpen ? <>
            <fieldset className="awake-duration" disabled={caffeine.isLoading}>
              <legend>{t("caffeine.duration.title")}</legend>
              <div className="awake-presets">
                {CAFFEINE_DURATION_OPTIONS.map((option) => (
                  <button type="button" key={option.compactLabel}
                    className={!until && option.minutes === caffeine.selectedDurationMinutes ? "awake-preset selected" : "awake-preset"}
                    onClick={() => caffeine.selectDuration(option.minutes)}
                    aria-disabled={caffeine.isBusy}
                    aria-pressed={!until && option.minutes === caffeine.selectedDurationMinutes}>
                    {t(option.labelKey as TranslationKey)}
                  </button>
                ))}
              </div>
            </fieldset>
            <button ref={customButton} type="button" className="awake-custom-entry"
              onClick={() => { if (!caffeine.isBusy) caffeine.openEditor(); }} aria-disabled={caffeine.isBusy}>
              <span>{t("caffeine.custom")}</span><ChevronRight size={15} aria-hidden="true" />
            </button>
          </> : <section className="awake-custom-editor" id="awake-custom-editor" aria-labelledby="awake-custom-title">
            <div className="awake-editor-heading">
              <h3 id="awake-custom-title" ref={editorHeading} tabIndex={-1}>{t("caffeine.customTitle")}</h3>
              <button type="button" className="awake-back" aria-disabled={caffeine.isBusy} onClick={caffeine.cancelEditor}>
                <ChevronLeft size={14} aria-hidden="true" />{t("caffeine.back")}
              </button>
            </div>
            <fieldset className="awake-mode" disabled={editorBusy}>
              <legend className="awake-sr-only">{t("caffeine.planMode")}</legend>
              {(["duration", "until"] as const).map((mode) => <label key={mode}>
                <input type="radio" name="awake-plan-mode" value={mode} checked={caffeine.mode === mode}
                  onChange={() => caffeine.setMode(mode)} />
                <span>{t(mode === "duration" ? "caffeine.durationMode" : "caffeine.untilMode")}</span>
              </label>)}
            </fieldset>
            <fieldset className="awake-inputs" disabled={editorBusy}>
              <legend className="awake-sr-only">{t(caffeine.mode === "duration" ? "caffeine.duration.title" : "caffeine.time")}</legend>
              {caffeine.mode === "duration" ? <div className="awake-custom-fields">
                <label>{t("caffeine.hours")}<input type="number" inputMode="numeric" min="0" max="24" step="1"
                  value={caffeine.hours} aria-invalid={caffeine.draftError === "invalid"} aria-describedby="awake-preview"
                  onChange={(event) => caffeine.setHours(event.currentTarget.value)} /></label>
                <label>{t("caffeine.minutes")}<input type="number" inputMode="numeric" min="0" max="59" step="1"
                  value={caffeine.minutes} aria-invalid={caffeine.draftError === "invalid"} aria-describedby="awake-preview"
                  onChange={(event) => caffeine.setMinutes(event.currentTarget.value)} /></label>
              </div> : <label>{t("caffeine.time")}<input type="time" value={caffeine.time}
                aria-invalid={caffeine.draftError === "invalid" || caffeine.draftError === "expired"} aria-describedby="awake-preview"
                onChange={(event) => caffeine.setTimePreview(event.currentTarget.value)} /></label>}
            </fieldset>
            <p className="awake-preview" id="awake-preview">
              {caffeine.draftLoading ? t("caffeine.loading") : caffeine.mode === "duration"
                ? `${t("caffeine.total")} ${totalMinutes ?? "—"} ${t("caffeine.durationValue")}`
                : caffeine.preview !== null
                  ? `${t("caffeine.preview")} ${formatEndTime(caffeine.preview, language)} · ${Math.max(0, Math.ceil((caffeine.preview - Date.now()) / 60000))} ${t("caffeine.durationValue")}`
                  : t("caffeine.chooseTime")}
            </p>
            {caffeine.draftError && <p className="awake-error" role="alert">{t(`caffeine.${caffeine.draftError}`)}</p>}
            <div className="awake-custom-actions">
              {caffeine.enabled && <button type="button" className="awake-secondary awake-stop" aria-disabled={caffeine.isBusy}
                onClick={() => { if (!caffeine.isBusy) { caffeine.disable(); editorHeading.current?.focus(); } }}>
                {t("caffeine.disable")}
              </button>}
              <button type="button" className="awake-primary" aria-disabled={editorBusy} onClick={() => { void caffeine.applyCustom(); }}>
                {t(caffeine.enabled ? "caffeine.apply" : "caffeine.enable")}
              </button>
            </div>
          </section>}
          {!caffeine.editorOpen && <div className="awake-actions">
            <button type="button" className="awake-primary"
              onClick={caffeine.enabled ? caffeine.disable : caffeine.enable} disabled={caffeine.isLoading} aria-disabled={caffeine.isBusy}>
              {caffeine.isLoading ? t("caffeine.loading") : t(caffeine.enabled ? "caffeine.disable" : "caffeine.enable")}
            </button>
          </div>}
        </div>
      </div>
      <div className="awake-feedback">
        {caffeine.snapshot.last_stop_reason && <p className="awake-notice" role="status">{t(`caffeine.stop.${caffeine.snapshot.last_stop_reason}`)}</p>}
        {caffeine.snapshot.battery_threshold_overridden && <p className="awake-notice">{t("caffeine.override")}</p>}
        {caffeine.snapshot.protection_unavailable && <p className="awake-notice" role="status">{t("caffeine.protectionUnavailable")}</p>}
        {errorMessage && <div className="awake-error" role="alert">
          <span>{errorMessage}</span>
          <button type="button" className="awake-secondary" onClick={() => { void caffeine.refresh(); }}>{t("caffeine.retry")}</button>
        </div>}
      </div>
    </section>
  );
}

export function CaffeinePluginPanel({ language, editorRevision, onEditorIntentConsumed }: BundledPluginPanelProps) {
  return <CaffeinePanel language={language} editorRevision={editorRevision} onEditorIntentConsumed={onEditorIntentConsumed} t={createCaffeineTranslator(language)} />;
}
