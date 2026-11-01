import type { PaperRuntimeSnapshot } from "./contracts";
import type { TranslationKey } from "./i18n";
interface Props { runtime: PaperRuntimeSnapshot | null; t: (key: TranslationKey) => string; detailed?: boolean }
export function PaperStatus({ runtime, t, detailed = false }: Props) {
  if (!runtime) return null;
  const time = (value: string | undefined) => value ? new Date(value).toLocaleString() : "—";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const unpublished = runtime.latestAvailableDate && runtime.latestAvailableDate < today;
  if (!detailed && !unpublished && !runtime.error) return null;
  return (
    <div className="paper-runtime-status" role="status" aria-live="polite">
      {detailed ? <p>{t(`paper.phase.${runtime.phase}`)}</p> : null}
      {detailed && runtime.lastCheckedAt ? <p>{t("paper.lastChecked")}: {time(runtime.lastCheckedAt)}</p> : null}
      {unpublished ? <p>{t("paper.unpublished")} · {runtime.latestAvailableDate}</p> : null}
      {detailed ? <dl>
        <dt>{t("paper.lastRefresh")}</dt><dd>{time(runtime.lastSuccessfulRefreshAt)}</dd>
        <dt>{t("paper.latestDate")}</dt><dd>{runtime.latestAvailableDate ?? "—"}</dd>
        <dt>{t("paper.lastApplied")}</dt><dd>{runtime.lastAppliedDate ?? "—"} · {time(runtime.lastAppliedAt)}</dd>
        <dt>{t("paper.nextCheck")}</dt><dd>{time(runtime.nextCheckAt)}</dd>
        {runtime.manualOverrideUntil ? <><dt>{t("paper.protectedUntil")}</dt><dd>{time(runtime.manualOverrideUntil)}</dd></> : null}
      </dl> : null}
      {runtime.error ? <p className="wallpaper-error">{runtime.error.message}</p> : null}
    </div>
  );
}
