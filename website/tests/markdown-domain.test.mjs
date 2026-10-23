import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/lib/web-tools/markdown.ts';
import { buildMarkdownHtml, renderMarkdownHtml } from '../src/lib/web-tools/markdown-html.ts';
import { assertMarkdownSource, assertMarkdownOutput, importMarkdownFile, normalizeMarkdownSource, safeName, safeMarkdownUrl } from '../src/lib/web-tools/markdown-policy.ts';

test('one positioned AST preserves GFM semantics, unique headings and unknown fences', () => {
  const source = '# Hello *world*\n\n# Hello world\n\n| A | B |\n| - | - |\n| 中文 | ~~old~~ |\n\n- [x] done\n\n```javascript\nconst a = 1;\n```\n\n```unknown-language\n<script>literal</script>\n```';
  const document = parseMarkdown(source, 'en');
  assert.equal(document.tree.type, 'root');
  assert.equal(document.title, 'Hello world');
  assert.deepEqual(document.headings, [{id:'md-heading-hello-world',text:'Hello world',line:1},{id:'md-heading-hello-world-2',text:'Hello world',line:3}]);
  assert.match(document.html, /<table\b/);
  assert.match(document.html, /<del\b[^>]*>old<\/del>/);
  assert.match(document.html, /type="checkbox"[^>]*checked/);
  assert.match(document.html, /hljs-keyword/);
  assert.match(document.html, /&#x3C;script>literal&#x3C;\/script>/);
  assert.match(document.html, /data-source-line="1"/);
});

test('source HTML and active destinations cannot execute or request assets', () => {
  const document = parseMarkdown('<script>alert(1)</script>\n\n<iframe src="https://evil.test"></iframe>\n\n<div style="background:url(https://evil.test)">bad</div>\n\n[x](javascript:alert%281%29) [ok](https://example.test)\n\n![remote](https://images.test/a.png)\n\n![unsafe](data:image/svg+xml,bad)');
  assert.doesNotMatch(document.html, /<script|<iframe|<div|javascript:|<img|style=|src=/);
  assert.match(document.html, /href="https:\/\/example.test"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(document.html, /data-markdown-image="md-image-1"/);
  assert.deepEqual(document.images, [{id:'md-image-1',url:'https://images.test/a.png',alt:'remote'},{id:'md-image-2',url:'data:image/svg+xml,bad',alt:'unsafe'}]);
});

test('reference images and links share the same safety policy', () => {
  const document = parseMarkdown('![picture][asset]\n\n[read][safe]\n\n[asset]: https://images.test/p.png\n[safe]: javascript:bad');
  assert.deepEqual(document.images, [{id:'md-image-1',url:'https://images.test/p.png',alt:'picture'}]);
  assert.doesNotMatch(document.html, /<img|javascript:|href=/);
});

test('standalone HTML only embeds validated local assets and escapes its title', () => {
  const document = parseMarkdown('# A & B\n\n![remote](https://images.test/a.png)');
  const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ioAAAAASUVORK5CYII=';
  const html = buildMarkdownHtml(document, 'en', {'md-image-1':data});
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>A &amp; B<\/title>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /<img[^>]*src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /https:\/\/images.test|<script|<link/);
  for (const unsafe of ['https://images.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PHNjcmlwdD4=']) {
    assert.doesNotMatch(renderMarkdownHtml(document, {'md-image-1':unsafe}), /<img/);
  }
});

test('strict import normalizes BOM and line endings and rejects malformed or oversized input', () => {
  assert.equal(normalizeMarkdownSource('\ufeff# Hello\r\nNext\rEnd'), '# Hello\nNext\nEnd');
  assert.equal(importMarkdownFile(new TextEncoder().encode('\ufeff# Hello\r\n'), 'note.MD'), '# Hello\n');
  assert.throws(() => importMarkdownFile(new Uint8Array([0xff]), 'note.md'), {code:'invalid-utf8'});
  assert.throws(() => importMarkdownFile(new TextEncoder().encode('x'), 'document.pdf'), {code:'unsupported-file'});
  assert.throws(() => assertMarkdownSource('x'.repeat(1_048_577)), {code:'source-limit'});
  assert.throws(() => assertMarkdownSource('\n'.repeat(20_000)), {code:'source-limit'});
  assert.doesNotThrow(() => assertMarkdownSource('x'.repeat(1_048_576)));
  assert.doesNotThrow(() => assertMarkdownSource('\n'.repeat(19_999)));
  assert.throws(() => normalizeMarkdownSource('a\0b'), {code:'invalid-source'});
});

test('filenames cannot retain paths, control characters, extension tricks or reserved device names', () => {
  assert.equal(safeName('../report.pdf'), 'report');
  assert.equal(safeName('C:\\notes\\你好.md'), '你好');
  assert.equal(safeName('CON.txt'), 'document');
  assert.equal(safeName('\u0000/..'), 'document');
  assert.equal(safeName('  A: B?  '), 'A B');
});

test('statistics count source Unicode code points and locale word segments', () => {
  const document = parseMarkdown('hello 世界 😀', 'zh');
  assert.equal(document.characters, 10);
  assert.equal(document.words, 2);
  assert.equal(parseMarkdown('', 'en').words, 0);
});

test('duplicate reference definitions use the first destination consistently in consent and rendering', () => {
  const document = parseMarkdown('![first][asset]\n\n[asset]: https://first.test/a.png\n[asset]: https://last.test/b.png');
  assert.equal(document.images[0].url, 'https://first.test/a.png');
});

test('footnote layout cannot assign another image consent to an image moved during rendering', () => {
  const document = parseMarkdown('[^note]: ![note](https://note.test/n.png)\n\n![main](https://main.test/m.png)\n\nA note[^note]');
  assert.deepEqual(document.images.map(image => image.alt), ['note','main']);
  assert.match(document.html, /data-markdown-image="md-image-2"[^>]*>\[main\]/);
  assert.match(document.html, /data-markdown-image="md-image-1"[^>]*>\[note\]/);
});

test('document anchor links resolve to unique safe heading IDs and rendering preserves AST', () => {
  const document = parseMarkdown('# Hello world\n\n[Jump](#hello-world)\n\n# Hello world\n\n# Hello world-2');
  const original = structuredClone(document.tree);
  assert.match(document.html, /href="#md-heading-hello-world"/);
  assert.equal(new Set(document.headings.map(item => item.id)).size, 3);
  renderMarkdownHtml(document);
  assert.deepEqual(document.tree, original);
});

test('unsafe protocols and malformed local destinations are rejected before reuse in exports', () => {
  for (const url of ['javascript:alert(1)','data:text/html,x','file:///etc/passwd','//tracking.test/x','https://name:pass@example.test/x','https:\\evil.test/x',' java\nscript:alert(1)']) assert.equal(safeMarkdownUrl(url), null);
  assert.equal(safeMarkdownUrl('#section'), '#section');
  assert.equal(safeMarkdownUrl('mailto:hello@example.test'), 'mailto:hello@example.test');
  assert.equal(safeMarkdownUrl('mailto:hello@example.test', true), null);
  assert.throws(() => assertMarkdownOutput(33_554_433), {code:'output-limit'});
  assert.doesNotThrow(() => assertMarkdownOutput(33_554_432));
});

test('preview task checkboxes have an accessible label derived from their own task text', () => {
  const doc = parseMarkdown('- [x] 完成文档\n- [ ] Export PDF');
  assert.match(doc.html, /aria-label="完成文档"/);
  assert.match(doc.html, /aria-label="Export PDF"/);
});

test('Chinese and encoded heading fragments resolve to the same safe preview and HTML destinations', () => {
  const doc = parseMarkdown('# 中文标题\n\n[中文](#中文标题) [encoded](#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98)');
  assert.equal((doc.html.match(/href="#md-heading-中文标题"/g) ?? []).length, 2);
});
