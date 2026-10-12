import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { catalog, links } from '../src/content/site.ts';

export async function verifyCatalogAssets(entries, releaseData, request) {
  assert.ok(Array.isArray(releaseData), 'Invalid GitHub release response');
  const failures = [];
  for (const entry of entries) {
    try {
      const release = releaseData.find((value) => value.tag_name === `v${entry.version}` && !value.draft);
      assert.ok(release, `v${entry.version}: no matching public release`);
      assert.equal(Boolean(release.prerelease), entry.channel === 'trial', 'Release channel mismatch');
      const asset = release.assets?.find((value) => value.browser_download_url === entry.url);
      assert.ok(asset, `Missing asset: ${entry.url}`);
      assert.equal(asset.size, entry.bytes, 'Asset download size mismatch');
      if (asset.digest) assert.equal(asset.digest, `sha256:${entry.sha256}`, 'Asset checksum mismatch');
      else {
        const download = await request(entry.url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
        assert.ok(download.ok && download.body, `Checksum download HTTP ${download.status}`);
        const hash = createHash('sha256');
        let bytes = 0;
        for await (const chunk of download.body) { hash.update(chunk); bytes += chunk.byteLength; }
        assert.equal(bytes, entry.bytes, 'Downloaded asset size mismatch');
        assert.equal(hash.digest('hex'), entry.sha256, 'Downloaded asset checksum mismatch');
      }
      const response = await request(entry.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      assert.ok(response.ok, `Asset HTTP ${response.status}`);
    } catch (error) { failures.push(`${entry.url}: ${error instanceof Error ? error.message : 'Verification failed'}`); }
  }
  assert.equal(failures.length, 0, failures.join('\n'));
}
export async function verifyPublicLinks(request = fetch) {
  const response = await request(catalog.source, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Zero-website-link-check' }, signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `Release API HTTP ${response.status}`);
  const releases = await response.json();
  await verifyCatalogAssets(catalog.packages, releases, request);
  const checkedLinks = [];
  for (const url of [links.github, links.releases, links.trial, links.developer, links.issues]) {
    const result = await request(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    assert.ok(result.ok, `${url}: HTTP ${result.status}`);
    checkedLinks.push({ url, status: result.status });
  }
  const output = new URL('../output/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('link-check.json', output), JSON.stringify({ checkedAt: new Date().toISOString(), source: catalog.source, publicReleaseCount: releases.filter((release) => !release.draft).length, catalogPackages: catalog.packages.length, checkedLinks }, null, 2) + '\n');
  console.log(`Verified ${catalog.packages.length} public assets and ${Object.keys(links).length} project links.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyPublicLinks();
