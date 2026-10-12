import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { catalogSchema, packageSchema, packagesFor } from '../src/content/catalog.ts';
import { assertEquivalentKeys } from '../scripts/check-content.mjs';
import { verifyCatalogAssets } from '../scripts/verify-links.mjs';

const fixture = {
  version: '0.1.0', releasedAt: '2026-10-11', verifiedAt: '2026-10-11', channel: 'trial', visibility: 'published', profile: 'standard',
  tools: ['zero.awake', 'zero.paper', 'zero.snap', 'zero.launch'], platform: 'macos', architecture: 'aarch64', format: 'dmg',
  url: 'https://github.com/bells/zero/releases/download/v0.1.0/Zero-standard-aarch64.dmg', sha256: 'a'.repeat(64), bytes: 1000000, signing: 'ad-hoc', source: 'https://github.com/bells/zero/releases/tag/v0.1.0',
};
const catalogFor = (packages) => catalogSchema.parse({ verifiedAt: '2026-10-11', source: 'https://api.github.com/repos/bells/zero/releases', state: packages.length ? 'published' : 'unavailable', packages });
test('core has no tools; standard contains exactly the four trial tools', () => {
  assert.ok(packageSchema.safeParse(fixture).success);
  assert.ok(packageSchema.safeParse({ ...fixture, profile: 'core', tools: [] }).success);
  for (const tools of [[], [...fixture.tools, 'zero.file'], [...fixture.tools.slice(1), 'zero.paper']]) assert.equal(packageSchema.safeParse({ ...fixture, tools }).success, false);
});
test('draft, missing checksum, foreign host, wrong version and incompatible platform are rejected', () => {
  const bad = [ { visibility: 'draft' }, { sha256: '' }, { url: 'https://evil.example/zero.dmg' }, { url: fixture.url.replace('v0.1.0', 'v0.2.0') }, { platform: 'windows' }, { url: `${fixture.url}?token=secret` } ];
  for (const change of bad) assert.equal(packageSchema.safeParse({ ...fixture, ...change }).success, false);
});
test('package selection cannot retain an installer from a different platform or profile', () => {
  const catalog = catalogFor([fixture]);
  assert.equal(packagesFor(catalog, 'macos', 'standard').length, 1);
  assert.equal(packagesFor(catalog, 'windows', 'standard').length, 0);
  assert.equal(packagesFor(catalog, 'macos', 'core').length, 0);
  assert.equal(packagesFor(catalogFor([]), 'macos', 'standard').length, 0);
});
test('state mismatch, duplicate packages and missing translations fail validation', () => {
  assert.throws(() => catalogFor([fixture, fixture]));
  assert.equal(catalogSchema.safeParse({ ...catalogFor([]), state: 'published' }).success, false);
  assert.throws(() => assertEquivalentKeys({ nav: { title: '工具' } }, { nav: {} }));
  assert.throws(() => assertEquivalentKeys({ nav: '工具' }, { nav: '' }));
});
test('online verification rejects drafts, missing assets, stale sizes and broken links', async () => {
  const release = { tag_name: 'v0.1.0', draft: false, prerelease: true, assets: [{ browser_download_url: fixture.url, size: fixture.bytes, digest: `sha256:${fixture.sha256}` }] };
  await verifyCatalogAssets([fixture], [release], async () => ({ ok: true }));
  await assert.rejects(verifyCatalogAssets([fixture], [{ ...release, draft: true }], async () => ({ ok: true })), /no matching public release/);
  await assert.rejects(verifyCatalogAssets([fixture], [{ ...release, assets: [] }], async () => ({ ok: true })), /Missing asset/);
  await assert.rejects(verifyCatalogAssets([fixture], [{ ...release, assets: [{ ...release.assets[0], size: 2 }] }], async () => ({ ok: true })), /size mismatch/);
  await assert.rejects(verifyCatalogAssets([fixture], [release], async () => ({ ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(verifyCatalogAssets([fixture], [{ ...release, tag_name: 'v0.2.0' }], async () => ({ ok: true })), /no matching public release/);
  await assert.rejects(verifyCatalogAssets([fixture], [{ ...release, assets: [{ ...release.assets[0], digest: `sha256:${'b'.repeat(64)}` }] }], async () => ({ ok: true })), /checksum mismatch/);
});

test('assets without an API digest are downloaded and hashed before acceptance', async () => {
  const body = Buffer.from('fixture installer, never published');
  const entry = { ...fixture, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
  const release = { tag_name: 'v0.1.0', draft: false, prerelease: true, assets: [{ browser_download_url: entry.url, size: entry.bytes }] };
  await verifyCatalogAssets([entry], [release], async () => new Response(body));
  await assert.rejects(verifyCatalogAssets([{ ...entry, sha256: 'b'.repeat(64) }], [release], async () => new Response(body)), /checksum mismatch/);
});
