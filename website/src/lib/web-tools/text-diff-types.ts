export interface DiffJobInput { operation: 'text-diff'; before: string; after: string }
export interface DiffSegment { text: string; changed: boolean }
export interface DiffRow {
  kind: 'equal' | 'added' | 'deleted';
  beforeLine: number | null;
  afterLine: number | null;
  text: string;
  segments: DiffSegment[];
  noNewline: boolean;
}
export interface DiffBlock { start: number; end: number }
export interface DiffValue {
  rows: DiffRow[];
  blocks: DiffBlock[];
  added: number;
  deleted: number;
  identical: boolean;
  partialInline: boolean;
  finalNewlineChanged: boolean;
}
export const diffLimits = { bytes: 1024 * 1024, combined: 2 * 1024 * 1024, lines: 20_000, result: 8 * 1024 * 1024, inlineLine: 4096, inlineTotal: 100_000, mountedRows: 400, mountedBytes: 200 * 1024 } as const;
