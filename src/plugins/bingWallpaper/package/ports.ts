import type {PaperWallpaper} from './archive.js';
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export interface PaperAsset {assetId: string; byteLength: number; width: number; height: number; mimeType: string}
export interface PaperPreview {leaseId: string; url: string; byteLength: number; width: number; height: number; mimeType: string}
export interface PaperPlatform {platform: string; supported: boolean; detail?: string}
export interface PaperHostPort {
  get(key: string): Promise<JsonValue>;
  compareAndSet(key: string, expected: JsonValue, value: JsonValue): Promise<{swapped: boolean; currentValue: JsonValue}>;
  fetchArchive(signal: AbortSignal): Promise<PaperWallpaper[]>;
  cacheImage(url: string, signal: AbortSignal): Promise<PaperAsset>;
  preview(assetId: string): Promise<PaperPreview>;
  releasePreview(leaseId: string): Promise<void>;
  // The adapter creates an exclusive per-call workflow claim; a CAS loser must never cancel a peer token.
  prepareWallpaper(assetId: string): Promise<{intentId: string; generation: number}>;
  applyWallpaper(intentId: string): Promise<'applied' | 'alreadyApplied'>;
  cancelPrepared(intentId: string): Promise<void>;
  recoverWallpaper(): Promise<void>;
  exportImage(assetId: string, suggestedName: string, signal: AbortSignal): Promise<{cancelled: boolean; fileName: string | null}>;
  platform(): Promise<PaperPlatform>;
  upsertSchedule(input: {taskId: string; eventId: string; nextAtMs: number; payload: JsonValue}): Promise<{generation: number}>;
  cancelSchedule(taskId: string): Promise<boolean>;
}
export class PaperError extends Error {
  constructor(readonly code: 'paper.storage' | 'paper.archive' | 'paper.network' | 'paper.image' | 'paper.apply' | 'paper.uncertain' | 'paper.schedule' | 'paper.cancelled' | 'paper.unsupported', readonly retryable = false) {
    super(code); this.name = 'PaperError';
  }
}
export function checkActive(signal: AbortSignal): void { if (signal.aborted) throw new PaperError('paper.cancelled'); }
