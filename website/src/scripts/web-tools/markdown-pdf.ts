import type { Content, ContentText, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import type { RootContent, PhrasingContent, Definition, Nodes } from 'mdast';
import type { MarkdownDocument, MarkdownImage, MarkdownHeading } from '../../lib/web-tools/markdown-contracts.ts';
import { MarkdownError, markdownPolicy, safeMarkdownUrl, assertMarkdownOutput, resolveMarkdownFragment } from '../../lib/web-tools/markdown-policy.ts';

const fontNames = ['NotoSansSC-Regular.ttf', 'NotoSansSC-Bold.ttf'] as const;
const pageWidth = 499.28;
type Coverage = (codePoint: number) => boolean;

/** Read the actual shipped font's Unicode cmap; never guess coverage from a language name. */
export function readFontCoverage(bytes: Uint8Array): Coverage {
  try {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tables = data.getUint16(4);
    let cmap = 0;
    for (let index = 0; index < tables; index++) {
      const offset = 12 + index * 16;
      if (data.getUint32(offset) === 0x636d6170) cmap = data.getUint32(offset + 8);
    }
    if (!cmap) throw new Error();
    let format4 = 0;
    let format12 = 0;
    for (let index = 0; index < data.getUint16(cmap + 2); index++) {
      const record = cmap + 4 + index * 8;
      const platform = data.getUint16(record);
      const encoding = data.getUint16(record + 2);
      if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
      const table = cmap + data.getUint32(record + 4);
      if (data.getUint16(table) === 12) format12 = table;
      if (data.getUint16(table) === 4) format4 = table;
    }
    if (format12) {
      const groups: [number, number, number][] = [];
      for (let index = 0; index < data.getUint32(format12 + 12); index++) {
        const offset = format12 + 16 + index * 12;
        groups.push([data.getUint32(offset), data.getUint32(offset + 4), data.getUint32(offset + 8)]);
      }
      return point => {
        let low = 0;
        let high = groups.length - 1;
        while (low <= high) {
          const middle = (low + high) >>> 1;
          const group = groups[middle]!;
          if (point < group[0]) high = middle - 1;
          else if (point > group[1]) low = middle + 1;
          else return group[2] + point - group[0] !== 0;
        }
        return false;
      };
    }
    if (!format4) throw new Error();
    const count = data.getUint16(format4 + 6) / 2;
    const end = format4 + 14;
    const start = end + count * 2 + 2;
    const delta = start + count * 2;
    const ranges = delta + count * 2;
    return point => {
      if (point > 0xffff) return false;
      for (let index = 0; index < count; index++) {
        if (point > data.getUint16(end + index * 2)) continue;
        if (point < data.getUint16(start + index * 2)) return false;
        const adjustment = data.getInt16(delta + index * 2);
        const range = data.getUint16(ranges + index * 2);
        const glyph = range ? data.getUint16(ranges + index * 2 + range + 2 * (point - data.getUint16(start + index * 2))) : point;
        return glyph !== 0 && ((glyph + adjustment) & 0xffff) !== 0;
      }
      return false;
    };
  } catch { throw new MarkdownError('font-fetch'); }
}

export function assertFontCoverage(text: string, covers: Coverage): void {
  for (const character of text) {
    const point = character.codePointAt(0)!;
    if (point === 9 || point === 10 || point === 13) continue;
    // pdfmake 0.3's break-all splits UTF-16 code units. Reject supplementary
    // characters explicitly rather than passing a supported glyph to a broken layout.
    if (point > 0xffff || !covers(point)) throw new MarkdownError('font-glyph');
  }
}

export function buildMarkdownPdfDefinition(document: MarkdownDocument, assets: Record<string, string>): TDocumentDefinitions {
  const definitions = new Map<string, Definition>();
  const visit = (node: Nodes, callback: (node: Nodes) => void): void => { callback(node); if ('children' in node) for (const child of node.children) visit(child, callback); };
  visit(document.tree, node => { if (node.type === 'definition' && !definitions.has(node.identifier.toLowerCase())) definitions.set(node.identifier.toLowerCase(), node); });
  let imageIndex = 0;
  let headingIndex = 0;
  const imageMetadata = new Map<Nodes, MarkdownImage>();
  const headingMetadata = new Map<Nodes, MarkdownHeading>();
  visit(document.tree, node => {
    if (node.type === 'heading') { const heading = document.headings[headingIndex++]; if (heading) headingMetadata.set(node, heading); }
    if (node.type === 'image' || (node.type === 'imageReference' && definitions.has(node.identifier.toLowerCase()))) { const image = document.images[imageIndex++]; if (image) imageMetadata.set(node, image); }
  });
  const headingIds = new Set(document.headings.map(heading => heading.id));
  const linkStyle = (value: string): Partial<ContentText> => {
    const destination = safeMarkdownUrl(value);
    if (!destination) return {};
    if (!destination.startsWith('#')) return { link: destination };
    const id = resolveMarkdownFragment(destination, headingIds).slice(1);
    return headingIds.has(id) ? { linkToDestination: id } : {};
  };
  const inline = (nodes: PhrasingContent[], style: Partial<ContentText> = {}, wrapping = false): ContentText[] => nodes.flatMap(node => {
    if (node.type === 'text' || node.type === 'inlineCode') return [{ text: node.value, ...style, ...(wrapping || node.type === 'inlineCode' ? { wordBreak: 'break-all' as const } : {}), ...(node.type === 'inlineCode' ? { background: '#eef1f4' } : {}) }];
    if (node.type === 'break') return [{ text: '\n', ...style }];
    if (node.type === 'html') return [];
    if (node.type === 'emphasis') return inline(node.children, { ...style, italics: true }, wrapping);
    if (node.type === 'strong') return inline(node.children, { ...style, bold: true }, wrapping);
    if (node.type === 'delete') return inline(node.children, { ...style, decoration: 'lineThrough' }, wrapping);
    if (node.type === 'link' || node.type === 'linkReference') {
      return inline(node.children, { ...style, ...linkStyle(node.type === 'link' ? node.url : definitions.get(node.identifier.toLowerCase())?.url ?? ''), color: '#205ca5', decoration: 'underline' }, wrapping);
    }
    if (node.type === 'image' || node.type === 'imageReference') {
      const image = imageMetadata.get(node);
      return [{ text: `[Image: ${image?.alt || node.alt || 'image'}]`, ...style, color: '#52606d' }];
    }
    return [];
  });
  const paragraphContent = (children: PhrasingContent[], width = pageWidth, marginBottom = 8): Content[] => {
    const result: Content[] = [];
    let run: ContentText[] = [];
    const flush = () => { if (run.length) { result.push({ text: run, margin: [0, 0, 0, marginBottom] }); run = []; } };
    const walk = (nodes: PhrasingContent[], style: Partial<ContentText> = {}): void => {
      for (const child of nodes) {
        if (child.type === 'image' || child.type === 'imageReference') {
          flush();
          const image = imageMetadata.get(child);
          const asset = image ? assets[image.id] : undefined;
          if (asset && !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(asset)) throw new MarkdownError('image-type');
          result.push(asset ? { image: asset, fit: [width, 500], ...(style.link ? { link: style.link } : {}), margin: [0, 4, 0, 10] } : { text: `[Image: ${image?.alt || child.alt || 'image'}]`, color: '#52606d', margin: [0, 4, 0, 10] });
        } else if (child.type === 'strong') walk(child.children, { ...style, bold: true });
        else if (child.type === 'emphasis') walk(child.children, { ...style, italics: true });
        else if (child.type === 'delete') walk(child.children, { ...style, decoration: 'lineThrough' });
        else if (child.type === 'link' || child.type === 'linkReference') {
          walk(child.children, { ...style, ...linkStyle(child.type === 'link' ? child.url : definitions.get(child.identifier.toLowerCase())?.url ?? ''), color: '#205ca5', decoration: 'underline' });
        } else run.push(...inline([child], style, true));
      }
    };
    walk(children);
    flush();
    return result;
  };
  const blocks = (nodes: RootContent[]): Content[] => nodes.flatMap((node): Content[] => {
    if (node.type === 'definition' || node.type === 'html') return [];
    if (node.type === 'heading') {
      const heading = headingMetadata.get(node);
      return [{ text: inline(node.children), ...(heading ? { id: heading.id } : {}), headlineLevel: node.depth, wordBreak: 'break-all', fontSize: [24, 20, 16, 14, 12, 11][node.depth - 1], bold: true, color: '#17232f', margin: [0, 12, 0, 7] }];
    }
    if (node.type === 'paragraph') {
      return paragraphContent(node.children);
    }
    if (node.type === 'code') return [{ text: node.value.replace(/\t/g, '    '), wordBreak: 'break-all', fontSize: 8.5, lineHeight: 1.25, color: '#24374b', background: '#f0f3f6', margin: [0, 5, 0, 10], preserveLeadingSpaces: true }];
    if (node.type === 'blockquote') return [{ stack: blocks(node.children), margin: [14, 3, 0, 9], color: '#52606d' }];
    if (node.type === 'list') {
      const items = node.children.map(item => {
        const children = item.children.map((child, index) => index === 0 && child.type === 'paragraph' && typeof item.checked === 'boolean' ? { ...child, children: [{ type: 'text' as const, value: item.checked ? '[x] ' : '[ ] ' }, ...child.children] } : child);
        return { stack: blocks(children) };
      });
      return [node.ordered ? { ol: items, start: node.start ?? 1, margin: [0, 2, 0, 8] } : { ul: items, margin: [0, 2, 0, 8] }];
    }
    if (node.type === 'table') {
      const columns = Math.max(...node.children.map(row => row.children.length));
      const cell = (children: PhrasingContent[], header: boolean): TableCell => ({ stack: paragraphContent(children, columns > 8 ? 120 : Math.max(1, (pageWidth - columns * 9) / columns), 0), fontSize: columns > 5 ? 8 : 9, ...(header ? { bold: true, fillColor: '#e9eef4' } : {}) });
      if (columns > 8) {
        // Reflow very wide rows into labelled pairs so all columns stay legible on A4.
        const headers = node.children[0]?.children ?? [];
        const rows = node.children.slice(1);
        if (!rows.length) rows.push({ type: 'tableRow', children: [] });
        return rows.map((row, index) => ({ table: { headerRows: 1, widths: [130, '*'], body: [[{ text: `Row ${index + 1}: column`, bold: true, fillColor: '#e9eef4' }, { text: 'Value', bold: true, fillColor: '#e9eef4' }], ...Array.from({ length: columns }, (_, column) => [cell(headers[column]?.children ?? [], false), cell(row.children[column]?.children ?? [], false)])] }, layout: 'lightHorizontalLines', margin: [0, 3, 0, 10] }));
      }
      const body = node.children.map((row, index) => Array.from({ length: columns }, (_, column) => cell(row.children[column]?.children ?? [], index === 0)));
      return [{ table: { headerRows: 1, widths: Array.from({ length: columns }, () => Math.max(1, (pageWidth - columns * 9) / columns)), body }, layout: 'lightHorizontalLines', margin: [0, 3, 0, 10] }];
    }
    if (node.type === 'thematicBreak') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: pageWidth, y2: 0, lineWidth: 0.6, lineColor: '#ccd4de' }], margin: [0, 10, 0, 12] }];
    return [];
  });
  return {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [48, 44, 48, 46],
    info: { title: document.title || 'Document', creator: 'Zero Markdown' },
    defaultStyle: { font: 'ZeroCJK', fontSize: 10.5, lineHeight: 1.35, color: '#202b37' },
    content: blocks(document.tree.children),
    footer: (current, total) => { if (total > markdownPolicy.maxPdfPages) throw new MarkdownError('pdf-pages'); return { text: `${current} / ${total}`, alignment: 'center', fontSize: 8, color: '#657180', margin: [0, 14, 0, 0] }; },
    pageBreakBefore: (node, queries) => {
      if (node.pages > markdownPolicy.maxPdfPages) throw new MarkdownError('pdf-pages');
      return Boolean(node.headlineLevel && queries.getFollowingNodesOnPage().length === 0 && queries.getPreviousNodesOnPage().length > 0);
    },
  };
}

async function loadFont(url: URL): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), markdownPolicy.requestTimeoutMs);
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal });
    if (!response.ok || !response.body) throw new MarkdownError('font-fetch');
    if (Number(response.headers.get('content-length')) > markdownPolicy.maxFontBytes) throw new MarkdownError('font-limit');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > markdownPolicy.maxFontBytes) { await reader.cancel(); throw new MarkdownError('font-limit'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } catch (error) { if (error instanceof MarkdownError) throw error; throw new MarkdownError('font-fetch'); }
  finally { clearTimeout(timer); }
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

function visibleText(value: unknown): string {
  if (Array.isArray(value)) return value.map(visibleText).join('');
  if (typeof value !== 'object' || value === null) return '';
  const object = value as Record<string, unknown>;
  return Object.entries(object).map(([key, child]) => key === 'text' && typeof child === 'string' ? child : visibleText(child)).join('');
}

export async function generateMarkdownPdf(document: MarkdownDocument, assets: Record<string, string>, fontBaseUrl: string, onProgress?: (phase: string) => void): Promise<Uint8Array> {
  onProgress?.('loading');
  const base = new URL(fontBaseUrl, globalThis.location?.href);
  if (globalThis.location && base.origin !== globalThis.location.origin) throw new MarkdownError('font-fetch');
  const fonts = await Promise.all(fontNames.map(name => loadFont(new URL(name, base))));
  const definition = buildMarkdownPdfDefinition(document, assets);
  const text = visibleText(definition.content) + document.title + '0123456789 /';
  for (const font of fonts) assertFontCoverage(text, readFontCoverage(font));
  const module = await import('pdfmake/build/pdfmake.js');
  const pdfmake = module.default;
  pdfmake.addVirtualFileSystem(Object.fromEntries(fontNames.map((name, index) => [name, base64(fonts[index]!)])));
  pdfmake.addFonts({ ZeroCJK: { normal: fontNames[0], bold: fontNames[1], italics: fontNames[0], bolditalics: fontNames[1] } });
  onProgress?.('layout');
  try {
    const pdf = pdfmake.createPdf(definition);
    onProgress?.('encoding');
    const bytes = new Uint8Array(await pdf.getBuffer());
    assertMarkdownOutput(bytes.byteLength);
    return bytes;
  } catch (error) { if (error instanceof MarkdownError) throw error; throw new MarkdownError('pdf-failed'); }
}
