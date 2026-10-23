/// <reference lib="webworker" />
import { parseMarkdown } from '../../lib/web-tools/markdown.ts';
import { buildMarkdownHtml, renderMarkdownHtml } from '../../lib/web-tools/markdown-html.ts';
import { MarkdownError, markdownPolicy } from '../../lib/web-tools/markdown-policy.ts';

const context = self as unknown as DedicatedWorkerGlobalScope;
function readAssets(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MarkdownError('image-type');
  const entries = Object.entries(value);
  if (entries.length > markdownPolicy.maxImages) throw new MarkdownError('image-limit');
  const assets: Record<string, string> = {};
  let totalBytes = 0;
  for (const [key, data] of entries) {
    if (!/^md-image-[1-9]\d*$/.test(key) || typeof data !== 'string') throw new MarkdownError('image-type');
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!match?.[1] || match[1].length % 4 !== 0) throw new MarkdownError('image-type');
    const bytes = match[1].length / 4 * 3 - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0);
    totalBytes += bytes;
    if (bytes > markdownPolicy.maxImageBytes || totalBytes > markdownPolicy.maxTotalImageBytes) throw new MarkdownError('image-limit');
    assets[key] = data;
  }
  return assets;
}

context.onmessage = async (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!request || typeof request !== 'object' || !('id' in request) || typeof request.id !== 'number' || !Number.isSafeInteger(request.id)
    || !('source' in request) || typeof request.source !== 'string' || !('kind' in request)
    || (request.kind !== 'parse' && request.kind !== 'pdf' && request.kind !== 'html')) return;
  const id = request.id;
  try {
    const locale = 'locale' in request && request.locale === 'en' ? 'en' : 'zh';
    const assets = readAssets('assets' in request ? request.assets : {});
    const doc = parseMarkdown(request.source, locale);
    if (request.kind === 'parse') {
      if (Object.keys(assets).length) doc.html = renderMarkdownHtml(doc, assets);
      context.postMessage({ id, kind: 'document', doc });
    } else if (request.kind === 'html') {
      context.postMessage({ id, kind: 'html', html: buildMarkdownHtml(doc, locale, assets) });
    } else {
      if (!('fontBaseUrl' in request) || typeof request.fontBaseUrl !== 'string') throw new MarkdownError('worker-failed');
      context.postMessage({ id, kind: 'progress', phase: 'font' });
      const { generateMarkdownPdf } = await import('./markdown-pdf.ts');
      const bytes = await generateMarkdownPdf(doc, assets, request.fontBaseUrl, phase => context.postMessage({ id, kind: 'progress', phase }));
      const output = new Uint8Array(bytes);
      context.postMessage({ id, kind: 'pdf', bytes: output }, [output.buffer]);
    }
  } catch (error) {
    context.postMessage({ id, kind: 'error', code: error instanceof MarkdownError ? error.code
      : error instanceof Error && /^[a-z-]{1,40}$/.test(error.message) ? error.message : 'worker-failed' });
  }
};
