import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMarkdownPdfDefinition, generateMarkdownPdf, assertFontCoverage, readFontCoverage } from '../src/scripts/web-tools/markdown-pdf.ts';

const text = value => ({ type: 'text', value });
const paragraph = value => ({ type: 'paragraph', children: [text(value)] });
const document = children => ({ tree: { type: 'root', children }, title: '中文 PDF', html: '', headings: [], images: [], characters: 0, words: 0 });

test('PDF maps semantic text, task state, strike and safe links without rendering raw HTML', () => {
  const doc = document([
    { type: 'heading', depth: 1, children: [text('中文标题')] },
    { type: 'paragraph', children: [{ type: 'delete', children: [text('removed')] }, { type: 'link', url: 'https://example.com', children: [text('link')] }] },
    { type: 'html', value: '<script>alert(1)</script>' },
    { type: 'list', ordered: false, children: [{ type: 'listItem', checked: true, children: [paragraph('done')] }] },
  ]);
  const definition = buildMarkdownPdfDefinition(doc, {});
  const encoded = JSON.stringify(definition).replaceAll('\u200b', '');
  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.pageOrientation, 'portrait');
  assert.match(encoded, /中文标题/);
  assert.match(encoded, /lineThrough/);
  assert.match(encoded, /https:\/\/example.com/);
  assert.match(encoded, /\[x\]/);
  assert.doesNotMatch(encoded, /alert\(1\)/);
});

test('wide tables retain every cell, fixed widths and repeating header; long code wraps across pages', () => {
  const cells = Array.from({ length: 18 }, (_, index) => ({ type: 'tableCell', children: [text(`column-${index}`)] }));
  const definition = buildMarkdownPdfDefinition(document([
    { type: 'table', children: [{ type: 'tableRow', children: cells }, { type: 'tableRow', children: cells }] },
    { type: 'code', value: 'x'.repeat(2000) + '\nlast line' },
  ]), {});
  const encoded = JSON.stringify(definition).replaceAll('\u200b', '');
  assert.match(encoded, /column-17/);
  assert.match(encoded, /"headerRows":1/);
  assert.match(encoded, /last line/);
  assert.doesNotMatch(encoded, /"noWrap":true|"dontBreakRows":true|"unbreakable":true/);
  assert.match(encoded, /"wordBreak":"break-all"/);
  assert.doesNotMatch(encoded, /\u200b/);
  assert.ok(encoded.includes('x'.repeat(20)));
});

test('PDF image content uses only validated local assets and unresolved images stay visible', () => {
  const doc = document([{ type: 'paragraph', children: [{ type: 'image', url: 'https://private.example/image.png', alt: 'photo' }] }]);
  doc.images = [{ id: 'md-image-1', url: 'https://private.example/image.png', alt: 'photo' }];
  assert.match(JSON.stringify(buildMarkdownPdfDefinition(doc, {})), /photo/);
  assert.doesNotMatch(JSON.stringify(buildMarkdownPdfDefinition(doc, {})), /private\.example/);
  assert.throws(() => buildMarkdownPdfDefinition(doc, { 'md-image-1': 'https://private.example/image.png' }));
});

test('the shipped full CJK font has Chinese/Latin glyphs and rejects unsupported emoji explicitly', async () => {
  const bytes = await readFile(new URL('../public/markdown-fonts/NotoSansSC-Regular.ttf', import.meta.url));
  const coverage = readFontCoverage(bytes);
  assert.doesNotThrow(() => assertFontCoverage('中文，简体繁體 English 123 é —', coverage));
  assert.throws(() => assertFontCoverage('unsupported 🫠', coverage), error => error.code === 'font-glyph');
  assert.throws(() => readFontCoverage(new Uint8Array(12)), error => error.code === 'font-fetch');
});

test('semantic references use first definition, stable heading destinations and source image order', () => {
  const doc = document([
    { type: 'definition', identifier: 'link', url: 'https://example.com/first' },
    { type: 'definition', identifier: 'link', url: 'https://example.com/second' },
    { type: 'heading', depth: 1, children: [text('Title')] },
    { type: 'paragraph', children: [{ type: 'linkReference', identifier: 'link', referenceType: 'full', children: [text('Reference')] }, { type: 'link', url: '#title', children: [text('Jump')] }] },
    { type: 'footnoteDefinition', identifier: 'foot', children: [{ type: 'paragraph', children: [{ type: 'image', url: 'https://example.com/foot.png', alt: 'footnote image' }] }] },
    { type: 'paragraph', children: [{ type: 'image', url: 'https://example.com/main.png', alt: 'main image' }] },
  ]);
  doc.headings = [{ id: 'md-heading-title', text: 'Title', line: 1 }];
  doc.images = [{ id: 'md-image-1', url: 'https://example.com/foot.png', alt: 'footnote image' }, { id: 'md-image-2', url: 'https://example.com/main.png', alt: 'main image' }];
  const encoded = JSON.stringify(buildMarkdownPdfDefinition(doc, { 'md-image-2': 'data:image/png;base64,AAAA' }));
  assert.match(encoded, /example.com\/first/);
  assert.doesNotMatch(encoded, /example.com\/second/);
  assert.match(encoded, /"linkToDestination":"md-heading-title"/);
  assert.match(encoded, /data:image\/png;base64,AAAA/);
});

test('page limits fail instead of returning a truncated PDF', () => {
  const definition = buildMarkdownPdfDefinition(document([paragraph('text')]), {});
  assert.throws(() => definition.footer(1, 501), error => error.code === 'pdf-pages');
  assert.throws(() => definition.pageBreakBefore({ pages: 501 }, {}), error => error.code === 'pdf-pages');
});

test('browser PDF bundle generates real PDF bytes using only lazy self-hosted fonts', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([String(url), options]);
    const name = new URL(url).pathname.split('/').at(-1);
    return new Response(await readFile(new URL(`../public/markdown-fonts/${name}`, import.meta.url)));
  });
  const bytes = await generateMarkdownPdf(document([paragraph('中文 searchable English')]), {}, 'https://zero.example/markdown-fonts/');
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), '%PDF-');
  assert.ok(bytes.length > 1000);
  assert.equal(requests.length, 2);
  for (const [url, options] of requests) {
    assert.match(url, /^https:\/\/zero.example\/markdown-fonts\/NotoSansSC-(?:Regular|Bold)\.ttf$/);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
  }
});

test('font HTTP failures and oversized resources produce stable errors', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  await assert.rejects(generateMarkdownPdf(document([paragraph('text')]), {}, 'https://zero.example/markdown-fonts/'), error => error.code === 'font-fetch');
  fetch.mock.mockImplementation(async () => new Response('x', { headers: { 'content-length': String(32 * 1024 ** 2 + 1) } }));
  await assert.rejects(generateMarkdownPdf(document([paragraph('text')]), {}, 'https://zero.example/markdown-fonts/'), error => error.code === 'font-limit');
});

test('PDF preserves literal and encoded Chinese links to the safe heading destination', async () => {
  const { parseMarkdown } = await import('../src/lib/web-tools/markdown.ts');
  const doc = parseMarkdown('# 中文标题\n\n[中文](#中文标题) [encoded](#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98)');
  const encoded = JSON.stringify(buildMarkdownPdfDefinition(doc, {}));
  assert.equal((encoded.match(/"linkToDestination":"md-heading-中文标题"/g) ?? []).length, 2);
});

test('wide tables without data rows still preserve every header', () => {
  const headers = Array.from({length: 9}, (_, index) => ({type:'tableCell',children:[text(`header-${index}`)]}));
  const output = JSON.stringify(buildMarkdownPdfDefinition(document([{type:'table',children:[{type:'tableRow',children:headers}]}]), {}));
  assert.match(output, /header-8/);
});
