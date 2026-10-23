import { unified } from 'unified';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import type { Root, RootContent, Element } from 'hast';
import type { Nodes, Image, ImageReference } from 'mdast';
import type { MarkdownAssets, MarkdownDocument, MarkdownLocale, MarkdownImage } from './markdown-contracts.ts';
import { assertMarkdownOutput, markdownPolicy, safeMarkdownUrl, resolveMarkdownFragment } from './markdown-policy.ts';
import { markdownStyle } from './markdown-style.ts';

const highlighter = createLowlight({ javascript, typescript, json, css, xml, bash, python, rust });
const languageAliases: Record<string, string> = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', html: 'xml', sh: 'bash', shell: 'bash', py: 'python', rs: 'rust' };
const schema: SanitizeOptions = {
  ...defaultSchema,
  clobberPrefix: '',
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'dataSourceLine'],
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
    span: [['className', 'markdown-image-placeholder', /^hljs-[\w-]+$/], 'dataMarkdownImage'],
    code: [['className', /^language-[\w-]+$/, 'hljs']],
    img: ['src', 'alt'],
    input: [...(defaultSchema.attributes?.input ?? []), 'ariaLabel'],
  },
  protocols: { ...defaultSchema.protocols, src: ['data'] },
};

/** Assets are supplied only by the bounded image adapter; recheck their portable form at the HTML boundary. */
function localImage(value: string | undefined): string | null {
  if (!value || value.length > Math.ceil(markdownPolicy.maxImageBytes / 3) * 4 + 50) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) return null;
  let bytes: string;
  try { bytes = atob(match[2]); } catch { return null; }
  if (bytes.length > markdownPolicy.maxImageBytes) return null;
  const format = match[1];
  if (format === 'png' && bytes.startsWith('\x89PNG\r\n\x1a\n') && !bytes.includes('acTL')) return value;
  if (format === 'jpeg' && bytes.startsWith('\xff\xd8\xff')) return value;
  if (format === 'webp' && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' && !bytes.includes('ANIM')) return value;
  return null;
}

function textElement(tagName: string, properties: Element['properties'], value: string): Element {
  return { type: 'element', tagName, properties, children: [{ type: 'text', value }] };
}

export function renderMarkdownHtml(document: MarkdownDocument, assets: MarkdownAssets = {}): string {
  let imageIndex = 0;
  const definitions = new Set<string>();
  const headingsByLine = new Map(document.headings.map(heading => [heading.line, heading]));
  const headingIds = new Set(document.headings.map(heading => heading.id));
  const imageNodes = new WeakMap<object, { image: MarkdownImage; index: number }>();
  const collectDefinitions = (node: Nodes): void => {
    if (node.type === 'definition') definitions.add(node.identifier.toUpperCase());
    if ('children' in node) node.children.forEach(collectDefinitions);
  };
  const collectImages = (node: Nodes): void => {
    if (node.type === 'image' || (node.type === 'imageReference' && definitions.has(node.identifier.toUpperCase()))) {
      const image = document.images[imageIndex++];
      if (image) imageNodes.set(node, { image, index: imageIndex });
    }
    if ('children' in node) node.children.forEach(collectImages);
  };
  collectDefinitions(document.tree);
  collectImages(document.tree);
  const imageElement = (node: Image | ImageReference): Element => {
    const entry = imageNodes.get(node);
    const image = entry?.image;
    const alt = node.alt ?? '';
    const data = image && entry.index <= markdownPolicy.maxImages ? localImage(assets[image.id]) : null;
    return data
      ? { type: 'element', tagName: 'img', properties: { src: data, alt }, children: [] }
      : textElement('span', { className: ['markdown-image-placeholder'], dataMarkdownImage: image?.id ?? '' }, `[${alt || 'Image'}]`);
  };
  const processor = unified().use(remarkRehype, {
    allowDangerousHtml: false,
    handlers: {
      image(state, node) {
        const element = imageElement(node);
        state.patch(node, element);
        return element;
      },
      imageReference(state, node) {
        if (!state.definitionById.get(node.identifier.toUpperCase())) return textElement('span', {}, node.alt ?? '');
        const element = imageElement(node);
        state.patch(node, element);
        return element;
      },
    },
  });
  const tree = processor.runSync(document.tree) as Root;
  const plainText = (node: Root | RootContent): string => node.type === 'text' ? node.value : 'children' in node ? node.children.map(plainText).join('') : '';
  const decorate = (node: Root | RootContent): void => {
    if (node.type !== 'element' && node.type !== 'root') return;
    if (node.type === 'element') {
      if (node.tagName === 'li') {
        const label = plainText(node).trim() || 'Task';
        const labelInputs = (child: RootContent): void => {
          if (child.type !== 'element') return;
          if (child.tagName === 'input' && child.properties.type === 'checkbox') child.properties.ariaLabel = label;
          if (child.tagName !== 'ul' && child.tagName !== 'ol') child.children.forEach(labelInputs);
        };
        node.children.forEach(labelInputs);
      }
      if (node.position) node.properties.dataSourceLine = node.position.start.line;
      if (/^h[1-6]$/.test(node.tagName) && node.position) {
        const heading = headingsByLine.get(node.position.start.line);
        if (heading) node.properties.id = heading.id;
      }
      if (node.tagName === 'a') {
        const destination = typeof node.properties.href === 'string' ? safeMarkdownUrl(node.properties.href) : null;
        if (destination) {
          node.properties.href = resolveMarkdownFragment(destination, headingIds);
          if (!destination.startsWith('#')) { node.properties.target = '_blank'; node.properties.rel = ['noopener', 'noreferrer']; }
        } else delete node.properties.href;
      }
      if (node.tagName === 'code') {
        const classes = Array.isArray(node.properties.className) ? node.properties.className.map(String) : [];
        const declared = classes.find(name => name.startsWith('language-'))?.slice(9).toLowerCase();
        const language = declared ? languageAliases[declared] ?? declared : '';
        const content = node.children.map(child => child.type === 'text' ? child.value : '').join('');
        if (language && highlighter.registered(language)) {
          node.children = highlighter.highlight(language, content).children.filter(child => child.type !== 'doctype');
          node.properties.className = [...classes, 'hljs'];
        }
      }
    }
    node.children.forEach(decorate);
  };
  decorate(tree);
  const sanitized = unified().use(rehypeSanitize, schema).runSync(tree);
  const html = unified().use(rehypeStringify).stringify(sanitized);
  assertMarkdownOutput(new TextEncoder().encode(html).byteLength);
  return html;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? ''));
}

export function buildMarkdownHtml(document: MarkdownDocument, locale: MarkdownLocale, assets: MarkdownAssets = {}): string {
  const content = renderMarkdownHtml(document, assets);
  const html = `<!doctype html>\n<html lang="${locale === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(document.title)}</title><style>body{margin:0;background:#fff;color:#181818}${markdownStyle}</style></head><body><main class="markdown-document">${content}</main></body></html>`;
  assertMarkdownOutput(new TextEncoder().encode(html).byteLength);
  return html;
}
