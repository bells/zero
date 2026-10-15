import { fail, limits, textFits, type Result, type ToolError } from './contracts.ts';
import { parseTimestamp, timestampRows, type Unit, type TimestampValue } from './timestamp.ts';
import { errorMessage } from './messages.ts';

export interface BatchJobInput {
  operation: 'timestamp-batch';
  source: string;
  unit: Unit;
  timezone: 'UTC' | 'UTC+08:00';
  referenceNow: number;
  locale: 'zh' | 'en';
}
export interface BatchRepresentations { seconds: string; milliseconds: string; beijing: string; utc: string; iso: string }
export type BatchRow = { line: number; source: string } & (
  { ok: true; interpretation: TimestampValue['interpretation']; value: BatchRepresentations } |
  { ok: false; error: ToolError & { message: string } }
);
export interface BatchValue {
  version: 1;
  unit: Unit;
  timezone: 'UTC' | 'UTC+08:00';
  referenceNow: number;
  counts: { success: number; failed: number; skipped: number };
  rows: BatchRow[];
}
export function serializeTimestampBatch(batch: BatchValue): Result<string> {
  const text = JSON.stringify(batch, null, 2);
  return textFits(text, limits.output) ? { ok: true, value: text } : fail('limit');
}
export function convertTimestampBatch(job: BatchJobInput): Result<BatchValue> {
  if (!textFits(job.source)) return fail('limit');
  const lines = job.source.split(/\r\n|\r|\n/);
  if (/[\r\n]$/.test(job.source)) lines.pop();
  if (lines.length > 1000) return fail('limit');
  if (lines.every((line) => !line.trim())) return fail('empty');
  const batch: BatchValue = { version: 1, unit: job.unit, timezone: job.timezone, referenceNow: job.referenceNow, counts: { success: 0, failed: 0, skipped: 0 }, rows: [] };
  let bytes = 512;
  for (const [index, source] of lines.entries()) {
    if (!source.trim()) { batch.counts.skipped++; continue; }
    const parsed = parseTimestamp(source, job.unit, job.timezone);
    let row: BatchRow;
    if (parsed.ok) {
      const [seconds, milliseconds, beijing, utc, iso] = timestampRows(parsed.value.milliseconds, job.referenceNow, job.locale);
      row = { line: index + 1, source, ok: true, interpretation: parsed.value.interpretation, value: { seconds, milliseconds, beijing, utc, iso } };
      batch.counts.success++;
    } else {
      row = { line: index + 1, source, ok: false, error: { ...parsed.error, message: errorMessage(parsed.error, job.locale) } };
      batch.counts.failed++;
    }
    bytes += new TextEncoder().encode(JSON.stringify(row, null, 2)).byteLength + 64;
    if (bytes > limits.output) return fail('limit');
    batch.rows.push(row);
  }
  return serializeTimestampBatch(batch).ok ? { ok: true, value: batch } : fail('limit');
}
