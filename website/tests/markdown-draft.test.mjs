import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownDraftStore, markdownDraftKey } from '../src/scripts/web-tools/markdown-draft.ts';
function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
test('draft storage requires opt-in, preserves other preferences and detects concurrent writers', () => {
  const local = storage(); local.setItem('theme', 'dark');
  const a = new MarkdownDraftStore(local); const b = new MarkdownDraftStore(local);
  assert.throws(() => a.save('private'), /disabled/);
  assert.equal(local.getItem(markdownDraftKey), null);
  a.enable(); b.enable(); a.save('你好');
  assert.equal(a.read().source, '你好');
  assert.throws(() => b.save('old document'), /conflict/);
  a.disable(); assert.equal(local.getItem(markdownDraftKey), null);
  assert.equal(local.getItem('theme'), 'dark');
  assert.throws(() => a.save('late save'), /disabled/);
});
test('malformed or oversized draft never becomes a document', () => {
  const local = storage(); const draft = new MarkdownDraftStore(local);
  for (const value of ['{', '{"version":2,"source":"x"}', JSON.stringify({version:1, source:'x'.repeat(1048577), token:'a'})]) {
    local.setItem(markdownDraftKey, value); assert.throws(() => draft.read());
  }
});
test('storage failures propagate without claiming a saved draft', () => {
  const local = { getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() {} };
  const draft = new MarkdownDraftStore(local); draft.enable(); assert.throws(() => draft.save('source'), /quota/);
});

test('drafts use the same source validation as file import before replacing current content', () => {
  const local = storage(); const draft = new MarkdownDraftStore(local);
  local.setItem(markdownDraftKey, JSON.stringify({version:1,source:'bad\u0000draft',token:'x'}));
  assert.throws(() => draft.read());
  draft.enable(); assert.throws(() => draft.save('bad\u0000draft'));
});
