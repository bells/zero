import type { MarkdownDocument, MarkdownLocale } from '../../lib/web-tools/markdown-contracts.ts';
import { markdownPolicy } from '../../lib/web-tools/markdown-policy.ts';

type WorkerResult = { kind: 'document'; doc: MarkdownDocument } | { kind: 'pdf'; bytes: Uint8Array } | { kind: 'html'; html: string };
type JobKind = 'parse' | 'pdf' | 'html';
interface JobOptions { assets?: Record<string, string>; fontBaseUrl?: string; locale?: MarkdownLocale; progress?: (phase: string) => void }

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object'; }
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function boundedHtml(value: unknown): value is string {
  return typeof value === 'string' && value.length <= markdownPolicy.maxOutputBytes && new TextEncoder().encode(value).byteLength <= markdownPolicy.maxOutputBytes;
}
function markdownDocument(value: unknown): value is MarkdownDocument {
  if (!record(value) || !boundedHtml(value.html) || typeof value.title !== 'string' || value.title.length > markdownPolicy.maxSourceBytes
    || !count(value.characters) || value.characters > markdownPolicy.maxSourceBytes || !count(value.words) || value.words > value.characters
    || !record(value.tree) || value.tree.type !== 'root' || !Array.isArray(value.tree.children)
    || !value.tree.children.every(child => record(child) && typeof child.type === 'string')
    || !Array.isArray(value.headings) || !Array.isArray(value.images)) return false;
  return value.headings.every(heading => record(heading) && typeof heading.id === 'string' && heading.id.startsWith('md-heading-')
    && typeof heading.text === 'string' && count(heading.line) && heading.line > 0 && heading.line <= markdownPolicy.maxLines)
    && value.images.every(image => record(image) && typeof image.id === 'string' && /^md-image-[1-9]\d*$/.test(image.id)
      && typeof image.url === 'string' && typeof image.alt === 'string');
}

export class MarkdownSession {
  private worker?: Worker;
  private cancelJob?: () => void;
  private sequence = 0;

  cancel(): void { this.cancelJob?.(); }

  async parse(source: string, assets: Record<string, string> = {}): Promise<MarkdownDocument> {
    const result = await this.run('parse', source, { assets });
    if (result.kind !== 'document') throw new Error('worker-failed');
    return result.doc;
  }

  async html(source: string, assets: Record<string, string>, locale: MarkdownLocale): Promise<string> {
    const result = await this.run('html', source, { assets, locale });
    if (result.kind !== 'html') throw new Error('worker-failed');
    return result.html;
  }

  async pdf(source: string, assets: Record<string, string>, fontBaseUrl: string, progress: (phase: string) => void): Promise<Uint8Array> {
    const result = await this.run('pdf', source, { assets, fontBaseUrl, progress });
    if (result.kind !== 'pdf') throw new Error('worker-failed');
    return result.bytes;
  }

  private run(kind: JobKind, source: string, options: JobOptions = {}): Promise<WorkerResult> {
    this.cancel();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./markdown-worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      let settled = false;
      const finish = (result?: WorkerResult, error?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        if (this.worker === worker) { this.worker = undefined; this.cancelJob = undefined; }
        if (result) resolve(result); else reject(new Error(error ?? 'worker-failed'));
      };
      const timer = setTimeout(() => finish(undefined, kind === 'pdf' ? 'pdf-timeout' : 'parse-timeout'),
        kind === 'pdf' ? markdownPolicy.pdfTimeoutMs + markdownPolicy.requestTimeoutMs : markdownPolicy.parseTimeoutMs);
      this.cancelJob = () => finish(undefined, 'cancelled');
      worker.onerror = () => finish(undefined, 'worker-failed');
      worker.onmessageerror = () => finish(undefined, 'worker-failed');
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (settled) return;
        const value = event.data;
        if (!record(value) || value.id !== id) return;
        if (value.kind === 'progress' && typeof value.phase === 'string' && kind === 'pdf') { options.progress?.(value.phase); return; }
        if (value.kind === 'error') { finish(undefined, typeof value.code === 'string' && /^[a-z-]{1,40}$/.test(value.code) ? value.code : 'worker-failed'); return; }
        if (kind === 'pdf' && value.kind === 'pdf' && value.bytes instanceof Uint8Array && value.bytes.byteLength > 0 && value.bytes.byteLength <= markdownPolicy.maxOutputBytes) finish({ kind: 'pdf', bytes: value.bytes });
        else if (kind === 'parse' && value.kind === 'document' && markdownDocument(value.doc)) finish({ kind: 'document', doc: value.doc });
        else if (kind === 'html' && value.kind === 'html' && boundedHtml(value.html) && value.html.startsWith('<!doctype html>')) finish({ kind: 'html', html: value.html });
        else finish(undefined, 'worker-failed');
      };
      try { worker.postMessage({ id, kind, source, assets: options.assets ?? {}, fontBaseUrl: options.fontBaseUrl ?? '', locale: options.locale ?? 'zh' }); }
      catch { finish(undefined, 'worker-failed'); }
    });
  }
}
