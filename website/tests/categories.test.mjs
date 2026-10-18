import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory, webCategories } from '../src/lib/web-tools/categories.ts';
import { webTools, webToolSlugs } from '../src/content/web-tools.ts';
import { isThread, parseCreate } from '../../feedback/shared/contracts.ts';
test('category allowlist never carries user content or unknown categories', () => {
  for (const value of [null, '', 'all', 'IMAGE', 'image&search=private', 'private']) assert.equal(parseCategory(value), 'all');
  for (const value of webCategories) assert.equal(parseCategory(value), value);
});
test('seven stable bilingual tools share category membership and feedback threads', () => {
  assert.equal(webToolSlugs.length, 7);
  for (const locale of ['zh', 'en']) {
    assert.deepEqual(webTools[locale].map(tool => tool.slug), [...webToolSlugs]);
    assert.equal(webTools[locale].filter(tool => tool.category === 'development').length, 4);
    assert.equal(webTools[locale].filter(tool => tool.category === 'image').length, 3);
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
