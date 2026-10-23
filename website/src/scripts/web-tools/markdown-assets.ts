import { inspectImage } from '../../lib/web-tools/image';
import { markdownPolicy, safeMarkdownUrl } from '../../lib/web-tools/markdown-policy';
export interface MarkdownImageAsset { dataUrl: string; bytes: number; pixels: number }
export async function loadMarkdownImage(url: string, signal: AbortSignal, remaining: { bytes: number; pixels: number } = { bytes: markdownPolicy.maxTotalImageBytes, pixels: markdownPolicy.maxTotalImagePixels }): Promise<MarkdownImageAsset> {
  if (!safeMarkdownUrl(url, true)) throw new Error('unsafe-url');
  const controller = new AbortController();
  const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(cancel, markdownPolicy.requestTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', redirect: 'error' });
    if (!response.ok || !response.body) throw new Error('image-fetch');
    const byteLimit = Math.min(markdownPolicy.maxImageBytes, remaining.bytes);
    if (Number(response.headers.get('content-length')) > byteLimit) throw new Error('image-limit');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > byteLimit) throw new Error('image-limit'); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim();
    const image = inspectImage(bytes, mime);
    if (!image.ok) throw new Error(image.error.code === 'limit' ? 'image-limit' : 'image-type');
    const ascii = new TextDecoder('latin1').decode(bytes);
    if ((image.value.mime === 'image/png' && ascii.includes('acTL')) || (image.value.mime === 'image/webp' && ascii.includes('ANIM'))) throw new Error('image-type');
    const pixels = (image.value.width ?? 0) * (image.value.height ?? 0);
    if (!pixels || pixels > markdownPolicy.maxImagePixels || pixels > remaining.pixels) throw new Error('image-limit');
    const bitmap = await createImageBitmap(new Blob([bytes], { type: image.value.mime })).catch(() => { throw new Error('image-decode'); });
    try {
      if (bitmap.width * bitmap.height !== pixels) throw new Error('image-decode');
      if (controller.signal.aborted) throw new Error('cancelled');
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('image-decode'); context.drawImage(bitmap, 0, 0);
      const dataUrl = canvas.toDataURL(image.value.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png');
      canvas.width = 0; canvas.height = 0;
      if (dataUrl.length > byteLimit * 4 / 3 + 100) throw new Error('image-limit');
      return { dataUrl, bytes: Math.max(size, Math.ceil(dataUrl.length * 3 / 4)), pixels };
    } finally { bitmap.close(); }
  } catch (error) { if (controller.signal.aborted) throw new Error(signal.aborted ? 'cancelled' : 'image-fetch'); if (error instanceof Error && /^(?:image-|unsafe-url)/.test(error.message)) throw error; throw new Error('image-fetch'); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
