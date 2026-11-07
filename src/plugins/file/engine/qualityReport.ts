import type { FileConversionQualityIssue, FileConversionQualityIssueCode } from "../contracts";

export const QUALITY_DETAIL_LIMIT = 100;
const KNOWN_CODES = new Set(["fontMissing", "fontSubstituted", "fontInspectionIncomplete", "layoutReflowed", "tableSimplified", "nonEditableGraphic", "ocrUsed", "ocrLowConfidence", "ocrDownsampled"]);

export function normalizeFontFamily(value: string): string | undefined {
  const family = value.trim().replace(/^[A-Z]{6}\+/, "");
  return family.length > 0 && family.length <= 128 && !/[\\/<>:\p{Cc}]/u.test(family) ? family : undefined;
}

export function qualityIssue(
  code: FileConversionQualityIssueCode,
  locations: Pick<FileConversionQualityIssue, "pageNumbers" | "sectionIndexes" | "fontFamilies"> = {},
): FileConversionQualityIssue {
  return { code, ...locations, occurrences: 1, truncated: false };
}

export function aggregateQualityIssues(issues: readonly FileConversionQualityIssue[]): FileConversionQualityIssue[] {
  const groups = new Map<string, FileConversionQualityIssue>();
  for (const issue of issues) {
    const code = KNOWN_CODES.has(issue.code) ? issue.code : "unknown";
    let target = groups.get(code);
    if (!target) {
      if (groups.size >= QUALITY_DETAIL_LIMIT) continue;
      target = { code, occurrences: 0, truncated: false };
      groups.set(code, target);
    }
    const count = Number.isSafeInteger(issue.occurrences) && issue.occurrences>0 ? issue.occurrences : 1;
    target.truncated ||= count !== issue.occurrences;
    target.occurrences = Math.min(Number.MAX_SAFE_INTEGER, target.occurrences + count);
    target.truncated ||= issue.truncated;
    for (const key of ["pageNumbers", "sectionIndexes"] as const) {
      if (!issue[key]) continue;
      const values = new Set(target[key]);
      for (const value of issue[key]) {
        if (!Number.isSafeInteger(value) || (value < (key === "pageNumbers" ? 1 : 0) || value > (key === "pageNumbers" ? 512 : 511))) { target.truncated = true; continue; }
        if (values.has(value)) continue;
        if (values.size < QUALITY_DETAIL_LIMIT) values.add(value);
        else target.truncated = true;
      }
      target[key] = [...values].sort((a,b) => a-b);
    }
    if (issue.fontFamilies) {
      const values = new Set(target.fontFamilies);
      for (const raw of issue.fontFamilies) {
        const value = normalizeFontFamily(raw);
        if (!value) { target.truncated = true; continue; }
        if (values.has(value)) continue;
        if (values.size < QUALITY_DETAIL_LIMIT) values.add(value);
        else target.truncated = true;
      }
      target.fontFamilies = [...values];
    }
  }
  return [...groups.values()];
}

export class QualityReportError extends Error {
  constructor(message: string, readonly qualityIssues: FileConversionQualityIssue[]) { super(message); }
}
