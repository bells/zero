import { diffArrays, diffChars } from 'diff';
import { fail, type Result } from './contracts.ts';
import { diffLimits, type DiffValue, type DiffRow } from './text-diff-types.ts';
export type { DiffJobInput, DiffValue } from './text-diff-types.ts';
import { validateDiffSource } from './text-diff-input.ts';
export { validateDiffSource } from './text-diff-input.ts';
function tokens(text: string): string[] { return text.match(/[^\n]*\n|[^\n]+$/g) ?? []; }
export function compareText(before: string, after: string): Result<DiffValue> {
  const original = validateDiffSource(before);
  if (!original.ok) return original;
  const changed = validateDiffSource(after);
  if (!changed.ok) return changed;
  const deadline = Date.now() + 4800;
  const changes = diffArrays(tokens(original.value), tokens(changed.value), { timeout: 4500 });
  if (!changes) return fail('timeout');
  const result: DiffValue = { rows: [], blocks: [], added: 0, deleted: 0, identical: true, partialInline: false, finalNewlineChanged: original.value.endsWith('\n') !== changed.value.endsWith('\n') };
  let beforeLine = 0, afterLine = 0, bytes = 256, inlineUsed = 0;
  let blockStart: number | undefined;
  for (const change of changes) {
    const kind = change.added ? 'added' : change.removed ? 'deleted' : 'equal';
    if (kind === 'equal' && blockStart !== undefined) { result.blocks.push({ start: blockStart, end: result.rows.length }); blockStart = undefined; }
    if (kind !== 'equal' && blockStart === undefined) blockStart = result.rows.length;
    for (const token of change.value) {
      if (Date.now() > deadline) return fail('timeout');
      const text = token.endsWith('\n') ? token.slice(0, -1) : token;
      const row: DiffRow = { kind, beforeLine: kind === 'added' ? null : ++beforeLine, afterLine: kind === 'deleted' ? null : ++afterLine, text, segments: [{ text, changed: kind !== 'equal' }], noNewline: result.finalNewlineChanged && !token.endsWith('\n') };
      bytes += new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
      if (bytes > diffLimits.result) return fail('limit');
      result.rows.push(row);
      if (kind === 'added') result.added++;
      if (kind === 'deleted') result.deleted++;
    }
  }
  if (blockStart !== undefined) result.blocks.push({ start: blockStart, end: result.rows.length });
  for (const block of result.blocks) {
    const rows = result.rows.slice(block.start, block.end);
    const deleted = rows.filter(row => row.kind === 'deleted');
    const added = rows.filter(row => row.kind === 'added');
    for (let i = 0; i < Math.min(deleted.length, added.length); i++) {
      const left = deleted[i]!, right = added[i]!;
      const a = Array.from(left.text).length, b = Array.from(right.text).length;
      if (a > diffLimits.inlineLine || b > diffLimits.inlineLine || inlineUsed + a + b > diffLimits.inlineTotal) { result.partialInline = true; continue; }
      inlineUsed += a + b;
      const inline = diffChars(left.text, right.text, { timeout: Math.max(1, Math.min(100, deadline - Date.now())) });
      if (Date.now() > deadline) return fail('timeout');
      if (!inline) { result.partialInline = true; continue; }
      const leftSegments = inline.filter(part => !part.added).map(part => ({ text: part.value, changed: part.removed }));
      const rightSegments = inline.filter(part => !part.removed).map(part => ({ text: part.value, changed: part.added }));
      // Account for metadata before attaching a potentially fragmented inline result.
      bytes += new TextEncoder().encode(JSON.stringify([leftSegments, rightSegments])).byteLength;
      if (bytes > diffLimits.result) return fail('limit');
      left.segments = leftSegments; right.segments = rightSegments;
    }
  }
  result.identical = result.blocks.length === 0;
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > diffLimits.result) return fail('limit');
  return { ok: true, value: result };
}
