import type { FileConversionDirection, FileConversionDirectionCapability, FileConversionProviderId } from "./contracts";
import { fileErrorTranslationKey, type TranslationKey } from "./i18n.js";

interface Props {
  direction: FileConversionDirection;
  capability?: FileConversionDirectionCapability;
  invalidSavedChoice: boolean;
  disabled: boolean;
  onSelect(providerId: FileConversionProviderId): void;
  t(key: TranslationKey): string;
}

export function FileProviderControl({ direction, capability, invalidSavedChoice, disabled, onSelect, t }: Props) {
  const preferred = capability?.preferredProviderId ?? capability?.selectedProviderId;
  const unavailableAlternatives = capability?.providers.filter(
    (provider) => provider.availability.kind === "unavailable" && provider.id !== preferred,
  ) ?? [];
  return <>
    <label className="sr-only" htmlFor={`file-provider-${direction}`}>{t("provider.select")}</label>
    <select
      id={`file-provider-${direction}`}
      aria-label={`${t(direction === "pdfToDocx" ? "direction.pdfToDocx" : "direction.docxToPdf")} · ${t("provider.select")}`}
      value={preferred ?? ""}
      disabled={disabled || !capability?.providers.length}
      onChange={(event) => {
        const provider = capability?.providers.find((entry) => entry.id === event.target.value);
        if (provider?.availability.kind === "available") onSelect(provider.id);
      }}
    >
      {!preferred ? <option value="">{t("provider.unavailable")}</option> : null}
      {capability?.providers.map((provider) => <option key={provider.id} value={provider.id} disabled={provider.availability.kind !== "available"}>
        {t(`provider.${provider.id}`)}{provider.availability.kind !== "available" ? ` · ${t("provider.unavailable")}` : ""}
      </option>)}
    </select>
    {capability?.unavailability ? <p className="file-provider-warning" role="status">{t(fileErrorTranslationKey(capability.unavailability.code))}</p> : null}
    {invalidSavedChoice ? <p className="file-provider-warning" role="status">{t("provider.invalidSavedChoice")}</p> : null}
    {unavailableAlternatives.length > 0 ? (
      <details className="file-provider-diagnostics">
        <summary>{t("provider.otherEngines")}</summary>
        <ul>
          {unavailableAlternatives.map((provider) => (
            <li key={provider.id}>
              <b>{t(`provider.${provider.id}`)}</b>
              {provider.availability.kind === "unavailable"
                ? <p>{t(fileErrorTranslationKey(provider.availability.error.code))}</p>
                : null}
            </li>
          ))}
        </ul>
      </details>
    ) : null}
  </>;
}
