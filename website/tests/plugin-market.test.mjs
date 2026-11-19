import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aiIndex } from '../src/content/ai-index.ts';

test('official discovery links the bilingual plugin market', () => {
  const index = aiIndex();
  assert.ok(index.includes('https://www.usezero.cn/plugins/'));
  assert.ok(index.includes('https://www.usezero.cn/en/plugins/'));
});

test('each tool starts at 0.1.0 without fabricated released packages', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../market.json', import.meta.url), 'utf8'));
  assert.deepEqual(catalog.catalog.map(tool => tool.name).sort(), ['zero.snap','zero.awake','zero.paper','zero.launch','zero.file'].sort());
  for (const tool of catalog.catalog) {
    const folder = { 'zero.snap':'screenshot','zero.awake':'caffeine','zero.paper':'bingWallpaper','zero.launch':'quickLauncher','zero.file':'file' }[tool.name];
    const metadata = JSON.parse(await readFile(new URL(`../../src/plugins/${folder}/metadata.json`, import.meta.url), 'utf8'));
    assert.equal(metadata.version, '0.1.0', tool.name);
    assert.equal(tool.version, metadata.version);
    assert.ok(tool.unavailableReason.zh && tool.unavailableReason.en);
  }
});
