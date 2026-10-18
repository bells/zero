import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../output/image-codecs/license-materials/', import.meta.url);
test('assembled license materials have traceable sources, all notices and independent replacement proof', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.publicReleaseApproved, false);
  assert.equal(manifest.sources.length, 10);
  assert.equal(manifest.packages.length, 8);
  assert.deepEqual(manifest.rust.map((entry) => [entry.codec, entry.crates.length]), [['png', 25], ['oxipng', 65]]);
  assert.equal(manifest.replacement.hostUnchanged, true);
  assert.equal(manifest.replacement.sha256, manifest.build.artifact.sha256);
  assert.equal(manifest.build.emscripten, '6.0.12');
  const materialPaths = new Set();
  const text = [];
  for (const material of manifest.materials) {
    assert.equal(materialPaths.has(material.path), false, 'Duplicate inventory path');
    materialPaths.add(material.path);
    assert.equal(material.path.startsWith('/'), false);
    assert.equal(material.path.split('/').includes('..'), false);
    const location = new URL(material.path, root);
    const bytes = await readFile(location);
    assert.equal(bytes.length, material.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), material.sha256);
    if (material.path.startsWith('notices/')) text.push(bytes.toString('utf8'));
    if (material.path.endsWith('.tar.gz')) execFileSync('/usr/bin/tar', ['-tzf', fileURLToPath(location)], { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
  }
  const notices = text.join('\n');
  for (const heading of ['GNU GENERAL PUBLIC LICENSE', 'GNU LESSER GENERAL PUBLIC LICENSE', 'Apache License', 'Unicode', 'LLVM']) assert.ok(notices.includes(heading), `Missing ${heading}`);
  const wasmSync = manifest.rust.flatMap((entry) => entry.crates).find((entry) => entry.name === 'wasm_sync');
  assert.equal(wasmSync.selectedLicense, 'Apache-2.0');
  assert.ok(materialPaths.has('application-source/image-codecs/rebuild-heic.mjs'));
  assert.ok(materialPaths.has('decoder/libheif-rebuilt.js'));
  const notice = await readFile(new URL('THIRD_PARTY_NOTICES.md', root), 'utf8');
  assert.match(notice, /work of the Independent JPEG Group/);
  assert.match(notice, /Reverse engineering for debugging such modifications is permitted/);
});
