import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, Nodes, Definition } from 'mdast';
import type { MarkdownDocument, MarkdownLocale } from './markdown-contracts.ts';
import { MarkdownError, normalizeMarkdownSource } from './markdown-policy.ts';
import { renderMarkdownHtml } from './markdown-html.ts';

function plainText(node: Nodes): string {
  if ('value' in node) return node.type === 'html' ? '' : node.value;
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
  return 'children' in node ? node.children.map(plainText).join('') : '';
}

export function parseMarkdown(source: string, locale: MarkdownLocale = 'zh'): MarkdownDocument {
  const normalized = normalizeMarkdownSource(source);
  try {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(normalized) as Root;
    const document: MarkdownDocument = { tree, html: '', title: 'document', headings: [], images: [], characters: 0, words: 0 };
    const definitions = new Map<string, Definition>();
    const collect = (node: Nodes): void => {
      if (node.type === 'definition' && !definitions.has(node.identifier.toUpperCase())) definitions.set(node.identifier.toUpperCase(), node);
      if ('children' in node) node.children.forEach(collect);
    };
    collect(tree);
    const ids = new Set<string>();
    const nextSuffix = new Map<string, number>();
    const walk = (node: Nodes): void => {
      if (node.type === 'heading') {
        const text = plainText(node);
        const base = 'md-heading-' + (text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section');
        let id = base;
        let suffix = nextSuffix.get(base) ?? 2;
        while (ids.has(id)) id = `${base}-${suffix++}`;
        nextSuffix.set(base, suffix);
        ids.add(id);
        document.headings.push({ id, text, line: node.position?.start.line ?? 1 });
      }
      if (node.type === 'image' || node.type === 'imageReference') {
        const url = node.type === 'image' ? node.url : definitions.get(node.identifier.toUpperCase())?.url;
        if (url !== undefined) document.images.push({ id: `md-image-${document.images.length + 1}`, url, alt: node.alt ?? '' });
      }
      if ('children' in node) node.children.forEach(walk);
    };
    walk(tree);
    document.title = document.headings[0]?.text || 'document';
    for (const _character of normalized) document.characters += 1;
    if (typeof Intl.Segmenter === 'function') {
      for (const segment of new Intl.Segmenter(locale, { granularity: 'word' }).segment(normalized)) {
        if (segment.isWordLike) document.words += 1;
      }
    } else {
      document.words = (normalized.match(/[\p{L}\p{N}]+/gu) ?? []).length;
    }
    document.html = renderMarkdownHtml(document);
    return document;
  } catch (error) {
    if (error instanceof MarkdownError) throw error;
    throw new MarkdownError('parse-failed');
  }
}
