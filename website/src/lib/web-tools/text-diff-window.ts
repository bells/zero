import { diffLimits, type DiffRow, type DiffSegment, type DiffValue } from './text-diff-types.ts';
export interface DiffCursor { row: number; offset: number }
export interface VisibleDiffLine extends DiffRow { type: 'line'; row: number; offset: number; continued: boolean }
export interface DiffFold { type: 'fold'; row: number; count: number }
export interface DiffWindow { cursor: DiffCursor; items: (VisibleDiffLine | DiffFold)[]; next?: DiffCursor; textRows: number; sourceBytes: number }
function contextIntervals(value: DiffValue): [number, number][] {
  if (!value.blocks.length) return [[0, Math.min(3, value.rows.length)]];
  const intervals: [number, number][] = [];
  for (const block of value.blocks) {
    const start = Math.max(0, block.start - 3), end = Math.min(value.rows.length, block.end + 3);
    const previous = intervals.at(-1);
    if (previous && previous[1] >= start) previous[1] = end;
    else intervals.push([start, end]);
  }
  return intervals;
}
function sliceLine(row: DiffRow, offset: number, maxBytes: number): { text: string; segments: DiffSegment[]; end: number; bytes: number } {
  let end = offset, bytes = 0;
  while (end < row.text.length) {
    const point = row.text.codePointAt(end)!;
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > maxBytes) break;
    bytes += size; end += point > 0xffff ? 2 : 1;
  }
  const segments: DiffSegment[] = [];
  let position = 0;
  for (const segment of row.segments) {
    const limit = position + segment.text.length;
    if (limit > offset && position < end) segments.push({ text: segment.text.slice(Math.max(0, offset - position), Math.min(segment.text.length, end - position)), changed: segment.changed });
    position = limit;
    if (position >= end) break;
  }
  return { text: row.text.slice(offset, end), segments, end, bytes };
}
export function diffWindow(value: DiffValue, cursor: DiffCursor, inspectEqual = false, targetRow?: number): DiffWindow {
  const result: DiffWindow = { cursor: { ...cursor }, items: [], textRows: 0, sourceBytes: 0 };
  const intervals = inspectEqual ? [[0, value.rows.length]] : contextIntervals(value);
  let rowIndex = cursor.row, offset = cursor.offset;
  while (rowIndex < value.rows.length) {
    const visible = intervals.find(([start, end]) => rowIndex >= start! && rowIndex < end!);
    if (!visible) {
      const nextStart = intervals.find(([start]) => start! > rowIndex)?.[0] ?? value.rows.length;
      result.items.push({ type: 'fold', row: rowIndex, count: nextStart - rowIndex });
      rowIndex = nextStart; offset = 0; continue;
    }
    const row = value.rows[rowIndex]!;
    // Equal lines are mounted in both panes; reserve the larger, side-by-side footprint in either view.
    const copies = row.kind === 'equal' ? 2 : 1;
    if (result.textRows + copies > diffLimits.mountedRows) break;
    const remaining = Math.floor((diffLimits.mountedBytes - result.sourceBytes) / copies);
    const part = sliceLine(row, offset, remaining);
    if (part.end === offset && row.text.length > offset) break;
    result.items.push({ ...row, type: 'line', row: rowIndex, offset, text: part.text, segments: part.segments, continued: offset > 0 || part.end < row.text.length, noNewline: row.noNewline && part.end === row.text.length });
    result.textRows += copies; result.sourceBytes += part.bytes * copies;
    if (part.end < row.text.length) { offset = part.end; break; }
    rowIndex++; offset = 0;
  }
  if (rowIndex < value.rows.length) result.next = { row: rowIndex, offset };
  // Context must not consume the entire mounted budget before the requested difference.
  if (targetRow !== undefined && !result.items.some(item => item.type === 'line' && item.row === targetRow)) {
    return diffWindow(value, { row: targetRow, offset: 0 }, inspectEqual);
  }
  return result;
}
