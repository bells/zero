import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
const preparation = await import('./prepare-image-codecs.mjs').catch(() => ({}));
const packaging = await import('./package-image-codecs.mjs').catch(() => ({}));
const hash = (data) => createHash('sha256').update(data).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zero-image-assets-'));
  const materialsRoot = join(root, 'materials'), publicRoot = join(root, 'public'), applicationRoot = join(root, 'application');
  const files = { 'decoder/libheif-rebuilt.js': 'export default function build(){}', 'THIRD_PARTY_NOTICES.md': 'This software is based in part on the work of the Independent JPEG Group. Reverse engineering for debugging modifications is permitted.', 'application-source/image-codecs/REBUILD.md': '# Rebuild', 'notices/gpl.txt': 'GNU GENERAL PUBLIC LICENSE', 'notices/lgpl.txt': 'GNU LESSER GENERAL PUBLIC LICENSE', 'browser-experiment/private-experiment.html': 'Do not publish experiment' };
  for (const [name, text] of Object.entries(files)) { await mkdir(join(materialsRoot, name, '..'), { recursive: true }); await writeFile(join(materialsRoot, name), text); }
  const digest = hash(files['decoder/libheif-rebuilt.js']);
  const manifest = { replacement: { hostUnchanged: true, sha256: digest }, build: { artifact: { sha256: digest } }, materials: Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: hash(text) })) };
  await writeFile(join(materialsRoot, 'manifest.json'), JSON.stringify(manifest));
  await mkdir(join(applicationRoot, 'src'), { recursive: true });
  await writeFile(join(applicationRoot, 'src/host.ts'), 'export const host = true;');
  await writeFile(join(applicationRoot, '.env'), 'SECRET_MUST_NOT_BE_COPIED');
  await mkdir(join(applicationRoot, 'scripts'), { recursive: true });
  await writeFile(join(applicationRoot, 'scripts/prepare-social.mjs'), 'export const social = true;');
  await mkdir(join(applicationRoot, 'public/brand'), { recursive: true });
  await writeFile(join(applicationRoot, 'public/brand/zero.svg'), '<svg/>');
  return { root, materialsRoot, publicRoot, applicationRoot, manifest };
}
async function bundleFixture() {
  const options = await fixture();
  const bundleRoot = join(options.root, 'bundle');
  await mkdir(bundleRoot);
  const files = Object.create(null);
  for (const { path } of options.manifest.materials) files[path] = await readFile(join(options.materialsRoot, path));
  files['manifest.json'] = await readFile(join(options.materialsRoot, 'manifest.json'));
  const bytes = zipSync(files);
  await writeFile(join(bundleRoot, 'materials.zip'), bytes);
  await writeFile(join(bundleRoot, 'bundle.json'), JSON.stringify({ schemaVersion: 1, bytes: bytes.length, sha256: hash(bytes) }));
  return { ...options, materialsRoot: undefined, bundleRoot };
}
test('prepares the pinned bundle without a local experiment cache', async () => {
  const options = await bundleFixture();
  try {
    await preparation.prepareImageAssets(options);
    assert.equal(await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js'), 'utf8'), 'export default function build(){}');
    await assert.rejects(readFile(join(options.publicRoot, 'image-codecs/materials/browser-experiment/private-experiment.html')));
  } finally { await rm(options.root, { recursive: true, force: true }); }
});
test('a corrupt pinned bundle fails without replacing the last valid assets', async () => {
  const options = await bundleFixture();
  try {
    await preparation.prepareImageAssets(options);
    const original = await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js'));
    await writeFile(join(options.bundleRoot, 'materials.zip'), 'damaged archive');
    await assert.rejects(preparation.prepareImageAssets(options), /bundle integrity/i);
    assert.deepEqual(await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js')), original);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});
test('packages verified materials reproducibly and rejects altered inputs', async () => {
  assert.equal(typeof packaging.packageImageMaterials, 'function');
  const options = await fixture();
  const bundleRoot = join(options.root, 'bundle');
  try {
    await packaging.packageImageMaterials({ materialsRoot: options.materialsRoot, bundleRoot });
    const original = await readFile(join(bundleRoot, 'materials.zip'));
    await packaging.packageImageMaterials({ materialsRoot: options.materialsRoot, bundleRoot });
    assert.equal(hash(await readFile(join(bundleRoot, 'materials.zip'))), hash(original));
    await preparation.prepareImageAssets({ ...options, materialsRoot: undefined, bundleRoot });
    assert.equal(await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js'), 'utf8'), 'export default function build(){}');
    await writeFile(join(options.materialsRoot, 'decoder/libheif-rebuilt.js'), 'changed');
    await assert.rejects(packaging.packageImageMaterials({ materialsRoot: options.materialsRoot, bundleRoot }), /integrity/i);
    assert.equal(hash(await readFile(join(bundleRoot, 'materials.zip'))), hash(original));
  } finally { await rm(options.root, { recursive: true, force: true }); }
});
test('the checkout bundle supplies the real decoder, all source archives and notices', async () => {
  const options = await fixture();
  try {
    await preparation.prepareImageAssets({ publicRoot: options.publicRoot, applicationRoot: options.applicationRoot });
    const root = join(options.publicRoot, 'image-codecs/materials');
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.sources.length, 10);
    assert.equal(manifest.replacement.hostUnchanged, true);
    const decoder = await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js'));
    assert.equal(hash(decoder), manifest.build.artifact.sha256);
    assert.ok(decoder.length > 1_000_000);
    for (const record of manifest.materials) {
      const bytes = await readFile(join(root, record.path));
      assert.equal(bytes.length, record.bytes, record.path);
      assert.equal(hash(bytes), record.sha256, record.path);
    }
    for (const source of manifest.sources) assert.equal(hash(await readFile(join(root, `sources/${source.id}.tar.gz`))), source.sha256);
    assert.match(await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /Independent JPEG Group/);
    assert.ok(manifest.materials.some((record) => record.path === 'sources/png-rust-vendor.tar.gz'));
    assert.ok(manifest.materials.some((record) => record.path === 'sources/oxipng-rust-vendor.tar.gz'));
    assert.equal(manifest.materials.some((record) => record.path.startsWith('browser-experiment/')), false);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});
test('checkout HEIC browser fixtures retain synthetic provenance and verified bytes', async () => {
  const root = new URL('../tests/fixtures/image-codecs/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.personalData, false);
  assert.deepEqual(manifest.files.map((entry) => entry.name).sort(), ['heic-rotate-1.heic', 'synthetic-12mp.heic']);
  for (const record of manifest.files) {
    assert.equal(record.cameraOriginal, false);
    assert.match(record.source, /^synthetic:/);
    const bytes = await readFile(new URL(record.name, root));
    assert.equal(bytes.length, record.bytes);
    assert.equal(hash(bytes), record.sha256);
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  }
});
test('prepares verified replaceable decoder, legal/source materials and public host source only', async () => {
  assert.equal(typeof preparation.prepareImageAssets, 'function');
  const options = await fixture();
  try {
    await preparation.prepareImageAssets(options);
    assert.match(await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js'), 'utf8'), /export default/);
    assert.equal(await readFile(join(options.publicRoot, 'image-codecs/materials/application-source/website/src/host.ts'), 'utf8'), 'export const host = true;');
    assert.equal(await readFile(join(options.publicRoot, 'image-codecs/materials/application-source/website/public/brand/zero.svg'), 'utf8'), '<svg/>');
    assert.match(await readFile(join(options.publicRoot, 'image-codecs/materials/application-source/website/IMAGE_TOOLS_BUILD.md'), 'utf8'), /pnpm exec astro build/);
    await assert.rejects(readFile(join(options.publicRoot, 'image-codecs/materials/application-source/website/.env')));
    await assert.rejects(readFile(join(options.publicRoot, 'image-codecs/materials/browser-experiment/private-experiment.html')));
  } finally { await rm(options.root, { recursive: true, force: true }); }
});
test('changed decoder or path escape fails preparation and preserves the last valid asset set', async () => {
  assert.equal(typeof preparation.prepareImageAssets, 'function');
  const options = await fixture();
  try {
    await preparation.prepareImageAssets(options);
    const original = await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js'), 'utf8');
    await writeFile(join(options.materialsRoot, 'decoder/libheif-rebuilt.js'), 'tampered');
    await assert.rejects(preparation.prepareImageAssets(options), /integrity/i);
    assert.equal(await readFile(join(options.publicRoot, 'image-codecs/libheif-rebuilt.js'), 'utf8'), original);
    options.manifest.materials.push({ path: '../escape', bytes: 1, sha256: 'fake' });
    await writeFile(join(options.materialsRoot, 'manifest.json'), JSON.stringify(options.manifest));
    await assert.rejects(preparation.prepareImageAssets(options));
  } finally { await rm(options.root, { recursive: true, force: true }); }
});
