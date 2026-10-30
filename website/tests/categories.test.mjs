import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory, webCategories } from '../src/lib/web-tools/categories.ts';
import { webTools, webToolSlugs, webCopy } from '../src/content/web-tools.ts';
import { aiIndex } from '../src/content/ai-index.ts';
import { isThread, parseCreate } from '../../feedback/shared/contracts.ts';
test('category allowlist never carries user content or unknown categories', () => {
  for (const value of [null, '', 'all', 'IMAGE', 'image&search=private', 'private']) assert.equal(parseCategory(value), 'all');
  for (const value of webCategories) assert.equal(parseCategory(value), value);
});
test('nine stable bilingual tools share category membership and feedback threads', () => {
  assert.equal(webToolSlugs.length, 9);
  for (const locale of ['zh', 'en']) {
    assert.deepEqual(webTools[locale].map(tool => tool.slug), [...webToolSlugs]);
    assert.equal(webTools[locale].filter(tool => tool.category === 'development').length, 5);
    assert.equal(webTools[locale].filter(tool => tool.category === 'image').length, 3);
    assert.deepEqual(webTools[locale].filter(tool => tool.category === 'text').map(tool => tool.slug), ['markdown']);
    for (const tool of webTools[locale]) {
      const thread = `tools/${tool.slug}`;
      assert.equal(isThread(thread), true);
      assert.equal(isThread(`${locale}/${thread}`), false);
      assert.ok(tool.guide.steps.length && tool.guide.examples.length);
      assert.equal(parseCreate({ threadId: thread, content: 'Synthetic feedback', idempotencyKey: 'synthetic-attempt-00001' })?.threadId, thread);
    }
  }
  assert.equal(isThread('tools/image-unknown'), false);
});

test('Text category accepts only its stable navigation value', () => {
  assert.equal(parseCategory('text'), 'text');
  for (const value of ['TEXT', 'text&source=private', 'text?draft=private', 'markdown']) assert.equal(parseCategory(value), 'all');
});

test('Markdown feedback uses one language-independent identity and rejects document context', () => {
  assert.equal(isThread('tools/markdown'), true);
  for (const thread of ['en/tools/markdown', 'zh/tools/markdown', 'tools/markdown?title=private']) assert.equal(isThread(thread), false);
  const request = { threadId: 'tools/markdown', content: 'Synthetic feedback', idempotencyKey: 'synthetic-attempt-00001' };
  assert.equal(parseCreate(request)?.threadId, 'tools/markdown');
  for (const field of ['source', 'title', 'filename', 'selection', 'imageUrl', 'draft', 'exportState']) assert.equal(parseCreate({ ...request, [field]: 'private' }), null);
});

test('AI full index keeps Markdown privacy exceptions separate from temporary tool content', () => {
  const full = aiIndex(true);
  for (const locale of ['zh', 'en']) {
    for (const tool of webTools[locale]) {
      const section = full.split(`### ${tool.guide.searchTitle}\n`)[1]?.split('\n### ')[0];
      assert.ok(section, `${locale}/${tool.slug}: index section missing`);
      const privacy = tool.slug === 'markdown' ? webCopy[locale].markdownPrivacy : webCopy[locale].privacy;
      assert.ok(section.includes(privacy), `${locale}/${tool.slug}: inaccurate privacy guidance`);
      if (tool.slug === 'markdown') assert.ok(!section.includes(webCopy[locale].privacy));
    }
  }
});
