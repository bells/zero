import { CAFFEINE_DURATION_OPTIONS } from "./caffeineDuration";
import { useCaffeinePlugin } from "./useCaffeinePlugin";
import type { TranslationKey } from "./i18n";
import "./caffeine.css";

interface CaffeinePanelProps { t: (key: TranslationKey) => string; }

export function CaffeinePanel({ t }: CaffeinePanelProps) {
  const caffeine = useCaffeinePlugin();
  const currentDuration = caffeine.enabled ? caffeine.durationMinutes : caffeine.selectedDurationMinutes;
  const currentOption = CAFFEINE_DURATION_OPTIONS.find((option) => option.minutes === currentDuration) ?? CAFFEINE_DURATION_OPTIONS[0];
  const errorMessage = caffeine.actionError
    ? t(caffeine.actionError.code === "hide_failed" ? "caffeine.error.hideFailed"
      : caffeine.actionError.code === "display_failed" ? "caffeine.error.displayFailed" : "caffeine.error.operationFailed")
    : caffeine.error ? t("caffeine.error.operationFailed") : null;

  return (
    <section className="plugin-panel caffeine-panel" aria-busy={caffeine.isBusy}>
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
            <div><dt>{t("caffeine.duration.current")}</dt><dd>{t(currentOption.labelKey as TranslationKey)}</dd></div>
            {caffeine.enabled && caffeine.remaining !== null && (
              <div className="awake-remaining"><dt>{t("caffeine.message.remaining")}</dt><dd>{caffeine.remaining}</dd></div>
            )}
          </dl>
          <fieldset className="awake-duration" disabled={caffeine.isLoading}>
            <legend>{t("caffeine.duration.title")}</legend>
            <div className="awake-presets">
              {CAFFEINE_DURATION_OPTIONS.map((option) => (
                <button type="button" key={option.compactLabel}
                  className={option.minutes === caffeine.selectedDurationMinutes ? "awake-preset selected" : "awake-preset"}
                  onClick={() => caffeine.selectDuration(option.minutes)}
                  aria-disabled={caffeine.isBusy}
                  aria-pressed={option.minutes === caffeine.selectedDurationMinutes}>
                  {t(option.labelKey as TranslationKey)}
                </button>
              ))}
            </div>
          </fieldset>
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
