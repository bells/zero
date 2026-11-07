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
  return <>
    <label className="file-provider-label" htmlFor={`file-provider-${direction}`}>{t("provider.select")}</label>
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
    {capability?.unavailability ? <small role="status">{t(fileErrorTranslationKey(capability.unavailability.code))}</small> : null}
    {capability?.providers.map((provider) => provider.availability.kind === "unavailable" && provider.id !== preferred ? <small key={provider.id}>
      {t(`provider.${provider.id}`)}: {t(fileErrorTranslationKey(provider.availability.error.code))}
    </small> : null)}
    {invalidSavedChoice ? <small role="status">{t("provider.invalidSavedChoice")}</small> : null}
  </>;
}
