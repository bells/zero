import type {ZeroBridge} from '@zero/sdk';
import {parseArchiveJson, type PaperWallpaper} from './archive.js';

export const ARCHIVE_URL = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=10&mkt=zh-CN';
const MAX_BYTES = 512 * 1024;
const MAX_BASE64 = 4 * Math.ceil(MAX_BYTES / 3);

export class PaperRequestError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = 'PaperRequestError';
  }
}

function checkCancellation(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PaperRequestError('request.cancelled', false);
}

function decodeMetadata(body: string, contentType: string | null): string {
  const media = contentType?.split(';')[0]?.trim().toLowerCase();
  if (media !== 'application/json' && media !== 'text/json') {
    throw new PaperRequestError('bing.response_invalid', true);
  }
  if (body.length > MAX_BASE64) throw new PaperRequestError('bing.response_limit', true);
  if (body.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)) {
    throw new PaperRequestError('bing.response_invalid', true);
  }
  try {
    const binary = atob(body);
    if (binary.length > MAX_BYTES) throw new PaperRequestError('bing.response_limit', true);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch (cause: unknown) {
    if (cause instanceof PaperRequestError) throw cause;
    throw new PaperRequestError('bing.response_invalid', true);
  }
}

export async function fetchArchive(bridge: ZeroBridge, now: number, signal?: AbortSignal): Promise<PaperWallpaper[]> {
  checkCancellation(signal);
  const response = await bridge.request('network.fetch', {url: ARCHIVE_URL, method: 'GET'}, signal ? {signal} : undefined)
    .catch(() => {throw new PaperRequestError(signal?.aborted ? 'request.cancelled' : 'network.failed', !signal?.aborted);});
  checkCancellation(signal);
  if (!response.ok) {
    const code = /^[a-z][a-zA-Z0-9._-]{0,127}$/.test(response.error.code) ? response.error.code : 'network.failed';
    throw new PaperRequestError(code, response.error.retryable);
  }
  if (response.value.status !== 200) throw new PaperRequestError('bing.http', true);
  const metadata = decodeMetadata(response.value.bodyBase64, response.value.contentType);
  const archive = await parseArchiveJson(metadata, now);
  checkCancellation(signal);
  if (!archive.ok) throw new PaperRequestError(archive.error.code, archive.error.retryable);
  return archive.items;
}
