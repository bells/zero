import { mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// npm gitHead values of the fixed candidates, plus their documented native codec tags.
const sources = [
  ['heic-to-1.6.6', 'hoppergee/heic-to', '4045b8d7607e326c2b479cc424c7a60519b42dae'],
  ['libheif-1.23.6', 'strukturag/libheif', 'v1.23.6'],
  ['libde265-1.0.16', 'strukturag/libde265', 'v1.0.16'],
  ['jsquash-jpeg-1.6.0', 'jamsinclair/jSquash', '1f62015f53e28bd18b2d7c8a3ca3326577efc445'],
  ['jsquash-webp-1.5.0', 'jamsinclair/jSquash', '8bcd212da8c2be7c9c223e8f222eb3d9574a713b'],
  ['jsquash-png-3.1.1', 'jamsinclair/jSquash', 'b7fa9ac9ec02f224847ad23d19d115f9e296a368'],
  ['jsquash-oxipng-2.3.0', 'jamsinclair/jSquash', '68a7201e5b4d9703bf65670fb0284d16536dd145'],
  ['mozjpeg-3.3.1', 'mozilla/mozjpeg', 'v3.3.1'],
  ['libwebp-d2e245e', 'webmproject/libwebp', 'd2e245ea9e959a5a79e1db0ed2085206947e98f2'],
  ['wasm-sync-0.1.2', 'DouglasDwyer/wasm_sync', 'cc027b3b27c2e24e3cd5c7a6cc63306eff724af5'],
];
const output = new URL('../../output/image-codecs/sources/', import.meta.url);
await mkdir(output, { recursive: true });
const records = [];
let previous = [];
try { previous = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8')).downloaded; } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const [id, repository, ref] of sources) {
  const url = id === 'libde265-1.0.16' ? `https://github.com/${repository}/releases/download/${ref}/libde265-1.0.16.tar.gz` : `https://codeload.github.com/${repository}/tar.gz/${ref}`;
  const archive = new URL(`${id}.tar.gz`, output);
  const temporary = new URL(`${id}.tar.gz.part`, output);
  let bytes;
  try {
    try { bytes = await readFile(archive); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!bytes) {
      console.log(`${id}: downloading fixed source (10 minute bound, 256 MiB cap)`);
      const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      let received = 0;
      const bound = new Transform({ transform(chunk, _encoding, done) {
        received += chunk.length;
        done(received > 256 * 1024 * 1024 ? new Error('Source archive byte limit') : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(temporary, { flags: 'wx' }));
      // Only a complete gzip/tar can become a successful cache entry.
      execFileSync('/usr/bin/tar', ['-tzf', fileURLToPath(temporary)], { stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 });
      await rename(temporary, archive);
      bytes = await readFile(archive);
    }
    const old = previous.find((entry) => entry.id === id);
    if (old && (old.url !== url || old.sha256 !== createHash('sha256').update(bytes).digest('hex'))) throw new Error('Cached source integrity mismatch');
  } catch (cause) {
    await rm(temporary, { force: true });
    throw new Error(`Source retrieval incomplete: ${id}; no successful inventory entry written for ${url}`, { cause });
  }
  const members = execFileSync('/usr/bin/tar', ['-tzf', fileURLToPath(archive)], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n');
  const noticeMembers = members.filter((name) => /\/(?:COPYING(?:\.LESSER)?|LICEN[CS]E(?:[._-][^/]*)?|README\.ijg|PATENTS)$/.test(name));
  const notices = [];
  for (const member of noticeMembers) {
    // Read a named member to stdout, never extract arbitrary archive paths or run build scripts.
    const text = execFileSync('/usr/bin/tar', ['-xOzf', fileURLToPath(archive), member], { maxBuffer: 8 * 1024 * 1024 });
    const name = `${id}--${createHash('sha256').update(member).digest('hex').slice(0,12)}.txt`;
    await writeFile(new URL(name, output), text);
    notices.push({ member, file: name, bytes: text.length, sha256: createHash('sha256').update(text).digest('hex') });
  }
  const record = { id, repository, ref, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), notices };
  records.push(record);
  await writeFile(new URL('manifest.json', output), JSON.stringify({ releaseApproved: false, downloaded: records }, null, 2) + '\n');
  console.log(`${id}: archived source and ${notices.length} notice files; rebuild not verified`);
}
// Preserve an exact manifest rather than inferring source completeness from successful downloads.
const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
console.log(`${manifest.downloaded.length} source archives collected. Transitive source/rebuild/distribution review remains OPEN.`);
