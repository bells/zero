import { markdownPolicy, normalizeMarkdownSource } from '../../lib/web-tools/markdown-policy.ts';
export const markdownDraftKey = 'zero.markdown.draft.v1';
interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface MarkdownDraft { version: 1; source: string; token: string }
export class MarkdownDraftStore {
  private storage: DraftStorage;
  private enabled = false;
  private expected: string | null = null;
  constructor(storage: DraftStorage) { this.storage = storage; }
  read(): MarkdownDraft | null {
    const raw = this.storage.getItem(markdownDraftKey);
    if (!raw) return null;
    if (raw.length > 6 * markdownPolicy.maxSourceBytes + 1024) throw new Error('limit');
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('source' in data) || typeof data.source !== 'string' || !('token' in data) || typeof data.token !== 'string') throw new Error('draft');
    return { version: 1, source: normalizeMarkdownSource(data.source), token: data.token };
  }
  enable(): void { this.expected = this.storage.getItem(markdownDraftKey); this.enabled = true; }
  save(source: string): void {
    if (!this.enabled) throw new Error('disabled');
    if (this.storage.getItem(markdownDraftKey) !== this.expected) throw new Error('conflict');
    source = normalizeMarkdownSource(source);
    const raw = JSON.stringify({ version: 1, source, token: crypto.randomUUID() });
    this.storage.setItem(markdownDraftKey, raw); this.expected = raw;
  }
  disable(): void { this.enabled = false; this.storage.removeItem(markdownDraftKey); this.expected = null; }
}
