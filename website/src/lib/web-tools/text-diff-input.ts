import { fail, textFits, type Result } from './contracts.ts';
import { diffLimits } from './text-diff-types.ts';
export function normalizeDiffText(text: string): string { return text.replace(/\r\n?/g, '\n'); }
export function validateDiffSource(text: string): Result<string> {
  if (!textFits(text, diffLimits.bytes)) return fail('limit');
  if (text.includes('\0')) return fail('text-file');
  const normalized = normalizeDiffText(text);
  const lines = normalized === '' ? 0 : normalized.split('\n').length - Number(normalized.endsWith('\n'));
  return lines > diffLimits.lines ? fail('limit') : { ok: true, value: normalized };
}
