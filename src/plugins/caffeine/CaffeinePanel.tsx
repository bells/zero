import { useCaffeinePlugin } from "./useCaffeinePlugin";
import type { TranslationKey } from "../preferences/i18n";

interface CaffeinePanelProps {
  t: (key: TranslationKey) => string;
}

export function CaffeinePanel({ t }: CaffeinePanelProps) {
  const caffeine = useCaffeinePlugin();
  const message = caffeine.error
    ? `${t("caffeine.message.error")}: ${caffeine.error}`
    : caffeine.enabled
      ? t("caffeine.message.active")
      : t("caffeine.message.inactive");

  return (
    <section className="plugin-panel caffeine-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("caffeine.eyebrow")}</span>
          <h2>{t("caffeine.title")}</h2>
        </div>
        <span className={caffeine.enabled ? "status-pill active" : "status-pill"}>
          {caffeine.enabled ? t("caffeine.active") : t("caffeine.inactive")}
        </span>
      </div>

      <div className="caffeine-dial" aria-hidden="true">
        <div className={caffeine.enabled ? "dial-core active" : "dial-core"}>
          <span>{caffeine.enabled ? caffeine.elapsed : "OFF"}</span>
        </div>
      </div>

      <div className="panel-copy">
        <strong>
          {caffeine.enabled ? t("caffeine.activeTitle") : t("caffeine.inactiveTitle")}
        </strong>
        <span>{message}</span>
      </div>

      <button
        type="button"
        className={caffeine.enabled ? "primary-action danger" : "primary-action"}
        onClick={caffeine.toggle}
        disabled={caffeine.isBusy}
        aria-pressed={caffeine.enabled}
      >
        <span className="button-icon">{caffeine.enabled ? "×" : "✓"}</span>
        {caffeine.enabled ? t("caffeine.disable") : t("caffeine.enable")}
      </button>
    </section>
  );
}
