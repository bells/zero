import type { BatchJobInput } from './timestamp-batch.ts';
import type { DiffJobInput } from './text-diff-types.ts';
export const limits = { text: 1024 * 1024, output: 8 * 1024 * 1024, image: 5 * 1024 * 1024, encodedImage: 7 * 1024 * 1024, pixels: 16_000_000, depth: 128 } as const;
export type ErrorCode = 'limit' | 'depth' | 'json' | 'unwrap' | 'base64' | 'utf8' | 'url' | 'image' | 'unit' | 'date' | 'number' | 'timeout' | 'cancelled' | 'worker' | 'empty' | 'text-file';
export interface ToolError { code: ErrorCode; line?: number; column?: number; detail?: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: ToolError };
export type Operation = 'format' | 'compact' | 'validate' | 'unwrap' | 'base64-encode' | 'base64-decode' | 'url-encode' | 'url-decode' | 'image-encode' | 'image-decode';
export interface ProcessorJob { requestId: number; operation: Operation; input: string | Uint8Array; mime?: string }
export type Job = ProcessorJob | ((BatchJobInput | DiffJobInput) & { requestId: number });
export interface JobValue { text: string; bytes?: Uint8Array; mime?: string; width?: number; height?: number }
export interface JobResponse<Value = JobValue> { requestId: number; result: Result<Value> }
export function fail(code: ErrorCode, extra: Omit<ToolError, 'code'> = {}): Result<never> { return { ok: false, error: { code, ...extra } }; }
export function textFits(text: string, max: number = limits.text) { return text.length <= max && new TextEncoder().encode(text).byteLength <= max; }
