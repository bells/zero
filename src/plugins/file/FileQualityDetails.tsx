import type { FileConversionQualityIssue } from "./contracts";

interface Props {
  issues?: readonly FileConversionQualityIssue[];
  t: (key: string, values?: Record<string, string | number>) => string;
}
const knownCodes = new Set(["fontMissing", "fontSubstituted", "fontInspectionIncomplete", "layoutReflowed", "tableSimplified", "nonEditableGraphic", "ocrUsed", "ocrLowConfidence", "ocrDownsampled"]);

export function FileQualityDetails({ issues, t }: Props) {
  if (!issues?.length) return null;
  return <details className="file-quality-details">
    <summary>{t("file.quality.details")}</summary>
    <ul>{issues.slice(0,100).map((issue,index) => <li key={`${issue.code}-${index}`}>
      <span>{t(`file.quality.issue.${knownCodes.has(issue.code) ? issue.code : "unknown"}`)}</span>
      {issue.pageNumbers?.length ? <span> · {t("file.quality.sourcePages")} {issue.pageNumbers.join(", ")}</span> : null}
      {issue.sectionIndexes?.length ? <span> · {t("file.quality.sourceSections")} {issue.sectionIndexes.map(index => index+1).join(", ")}</span> : null}
      {issue.fontFamilies?.length ? <span> · {issue.fontFamilies.join(", ")}</span> : null}
      <span> · {t("file.quality.occurrences", { count: issue.occurrences })}</span>
      {issue.truncated ? <span> · {t("file.quality.truncated")}</span> : null}
    </li>)}</ul>
  </details>;
}
