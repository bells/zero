export type ProbeRequest =
  | { operation: 'codecs'; fixture: string }
  | ({ operation: 'heic'; pixelLimit: number; exportJpeg?: boolean } & ({ fixture: string; bytes?: never } | { bytes: ArrayBuffer; fixture?: never }))
  | { operation: 'archive'; entryBytes: number; entries: number }
  | { operation: 'spin'; fixture: string };
export type ProbeResult =
  | { kind: 'codecs'; pngExact: boolean; zipExact: boolean; jpegSizes: number[]; webpSizes: number[]; formats: string[]; pngSizes: number[]; elapsedMs: number }
  | { kind: 'heic'; width: number; height: number; pixels: number; primary: boolean; imageCount: number; elapsedMs: number; rgbaBytes: number; samples: number[][]; jpeg?: Blob; zip?: Blob; decodeMs: number; encodeMs?: number; zipMs?: number }
  | { kind: 'archive'; inputBytes: number; zip: Blob; zipMs: number; verifyMs: number; roundTrip: boolean }
  | { kind: 'error'; code: string };
export type ProbeMessage = { kind: 'progress'; phase: 'primary-checked' } | { kind: 'result'; result: ProbeResult };
export interface HeifImage {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(target: ImageData, callback: (pixels: ImageData | null) => void): void;
  free(): void;
}
export interface HeifDecoder { decoder: number; decode(buffer: ArrayBuffer): HeifImage[] }
export interface HeifModule { HeifDecoder: new () => HeifDecoder; heif_context_free(context: number): void }
export interface ImageCodecProbe {
  cancel(): void;
  run(request: ProbeRequest, timeoutMs?: number): Promise<ProbeResult>;
  cancelDecode(fixture: string): Promise<{ terminated: boolean; lateResults: number; elapsedMs: number }>;
}
declare global { interface Window { imageCodecProbe: ImageCodecProbe } }
