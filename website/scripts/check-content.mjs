import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { catalog, copy } from '../src/content/site.ts';
import { webTools, webCopy, webToolSlugs } from '../src/content/web-tools.ts';
import { documents } from '../src/content/documentation.ts';

export function assertEquivalentKeys(left, right, label = 'copy') {
  if (Array.isArray(left)) {
    assert.ok(Array.isArray(right) && right.length === left.length, `${label}: array length mismatch`);
    left.forEach((value, index) => assertEquivalentKeys(value, right[index], `${label}.${index}`));
  } else if (left && typeof left === 'object') {
    assert.ok(right && typeof right === 'object', `${label}: object missing`);
    assert.deepEqual(Object.keys(right).sort(), Object.keys(left).sort(), `${label}: translation keys mismatch`);
    for (const key of Object.keys(left)) assertEquivalentKeys(left[key], right[key], `${label}.${key}`);
  } else {
    assert.equal(typeof right, typeof left, `${label}: type mismatch`);
    if (typeof right === 'string') assert.ok(right.trim().length > 0, `${label}: empty translation`);
  }
}
export async function checkContent() {
  assertEquivalentKeys(copy.zh, copy.en);
  assertEquivalentKeys(webCopy.zh, webCopy.en, 'webCopy');
  assertEquivalentKeys(webTools.zh, webTools.en, 'webTools');
  assert.deepEqual(webTools.zh.map((item) => item.slug), [...webToolSlugs]);
  assert.deepEqual(webTools.en.map((item) => item.slug), [...webToolSlugs]);
  for (const item of webTools.zh) assert.ok(!documents('zh').some((doc) => doc.page === `tools/${item.slug}`), 'web/desktop slug collision');
  assertEquivalentKeys(documents('zh'), documents('en'), 'documents');
  assert.deepEqual(documents('zh').map((item) => item.page), documents('en').map((item) => item.page));
  for (const locale of ['zh', 'en']) {
    for (const document of documents(locale)) {
      assert.equal(new Set(document.sections.map((section) => section.id)).size, document.sections.length, `${document.page}: duplicate section anchors`);
    }
  }
  assert.deepEqual(copy.zh.tools.items.map((tool) => tool.id), copy.en.tools.items.map((tool) => tool.id));
  for (const name of ['zero', 'zero-snap', 'zero-launch', 'zero-awake', 'zero-paper']) {
    const original = await readFile(new URL(`../../src/assets/icons/${name}.svg`, import.meta.url));
    const website = await readFile(new URL(`../public/brand/${name}.svg`, import.meta.url));
    assert.ok(original.equals(website), `${name}: brand copy drift`);
  }
  const assets = JSON.parse(await readFile(new URL('../src/content/assets.json', import.meta.url), 'utf8'));
  for (const asset of assets) {
    const data = await readFile(new URL(`../src/assets/${asset.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256, `${asset.file}: source image mismatch`);
    assert.ok(asset.capturedAt && asset.platform === 'macos' && asset.profile === 'full-debug' && asset.evidence);
  }
  console.log(`Content checked: zh/en, ${assets.length} documented native images, ${catalog.packages.length} public packages.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await checkContent();
