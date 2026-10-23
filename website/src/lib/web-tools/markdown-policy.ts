import type { MarkdownErrorCode } from './markdown-contracts.ts';

export const markdownPolicy = Object.freeze({
  maxSourceBytes: 1024 ** 2, maxLines: 20_000, parseTimeoutMs: 5_000,
  maxImages: 10, maxImageBytes: 5 * 1024 ** 2, maxImagePixels: 16_000_000,
  maxTotalImageBytes: 20 * 1024 ** 2, maxTotalImagePixels: 20_000_000,
  requestTimeoutMs: 15_000, maxFontBytes: 32 * 1024 ** 2,
  maxOutputBytes: 32 * 1024 ** 2, maxPdfPages: 500, pdfTimeoutMs: 60_000,
});

export class MarkdownError extends Error {
  readonly code: MarkdownErrorCode;
  constructor(code: MarkdownErrorCode) { super(code); this.name = 'MarkdownError'; this.code = code; }
}

export function assertMarkdownSource(source: string): void {
  if (new TextEncoder().encode(source).byteLength > markdownPolicy.maxSourceBytes) throw new MarkdownError('source-limit');
  let lines = 1;
  for (const character of source) {
    if (character === '\n' && ++lines > markdownPolicy.maxLines) throw new MarkdownError('source-limit');
  }
  if (source.includes('\0')) throw new MarkdownError('invalid-source');
}

export function normalizeMarkdownSource(source: string): string {
  const normalized = source.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  assertMarkdownSource(normalized);
  return normalized;
}

export function importMarkdownFile(bytes: Uint8Array, name: string): string {
  if (!/\.(?:md|markdown|txt)$/i.test(name)) throw new MarkdownError('unsupported-file');
  if (bytes.byteLength > markdownPolicy.maxSourceBytes) throw new MarkdownError('source-limit');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new MarkdownError('invalid-utf8'); }
  return normalizeMarkdownSource(source);
}

export function safeName(name: string): string {
  const basename = name.split(/[\\/]/).at(-1) ?? '';
  const result = basename.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\.(?:md|markdown|txt|html?|pdf|exe|com|bat|cmd|sh|js|svg|png|jpe?g|webp)$/i, '')
    .replace(/[<>:"|?*]/g, '').replace(/^\.+|[. ]+$/g, '').trim().slice(0, 100).trim();
  return !result || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result) ? 'document' : result;
}

export function safeMarkdownUrl(value: string, image = false): string | null {
  const clean = value.trim();
  if (!clean || /[\u0000-\u0020\u007f]/.test(clean) || clean.startsWith('//') || clean.includes('\\')) return null;
  if (!image && clean.startsWith('#')) return clean;
  try {
    const url = new URL(clean);
    if (url.username || url.password) return null;
    return ['http:', 'https:'].includes(url.protocol) || (!image && url.protocol === 'mailto:') ? clean : null;
  } catch { return null; }
}

export function assertMarkdownOutput(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > markdownPolicy.maxOutputBytes) throw new MarkdownError('output-limit');
}

export function resolveMarkdownFragment(value: string, headingIds: ReadonlySet<string>): string {
  if (!value.startsWith('#')) return value;
  let decoded: string;
  try { decoded = decodeURIComponent(value.slice(1)); } catch { return value; }
  if (headingIds.has(decoded)) return `#${decoded}`;
  const prefixed = `md-heading-${decoded}`;
  return headingIds.has(prefixed) ? `#${prefixed}` : value;
}
