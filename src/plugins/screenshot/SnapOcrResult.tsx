import type { TranslationKey } from "./i18n";
import type { useSnapOcr } from "./useSnapOcr";

export function SnapOcrResult({ ocr, t }: { ocr: ReturnType<typeof useSnapOcr>; t: (key: TranslationKey) => string }) {
  if (!ocr.snapshot) return null;
  const { status, error, result } = ocr.snapshot;
  return <section className="snap-ocr-result" aria-label={t("ocr.result")}>
    <div className="panel-heading"><h3>{t("ocr.result")}</h3><button type="button" className="secondary-action" onClick={() => void ocr.clear()}>{t("ocr.clear")}</button></div>
    <p role="status">{status === "recognizing" ? t("ocr.recognizing") : status === "cancelled" ? t("ocr.cancelled") : error ? t(`ocr.error.${error}`) : !result?.lines.length ? t("ocr.empty") : t("ocr.review")}</p>
    {ocr.actionError ? <p role="alert">{t(`ocr.error.${ocr.actionError}`)}</p> : null}
    {status === "recognizing" ? <button type="button" className="secondary-action" onClick={() => void ocr.cancel()}>{t("ocr.cancel")}</button> : null}
    {result?.lines.length ? <>
      <textarea aria-label={t("ocr.result")} value={ocr.text} onChange={e => { ocr.setText(e.target.value); }} spellCheck={false} />
      <div className="button-row"><button type="button" className="primary-action" disabled={!ocr.text.trim()} onClick={() => void ocr.copy()}>{t("ocr.copy")}</button><span role="status">{ocr.copyState === "copied" ? t("ocr.copied") : ocr.copyState === "failed" ? t("ocr.copyFailed") : ""}</span></div>
    </> : null}
  </section>;
}
