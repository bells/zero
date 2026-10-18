import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import { prepareImageAssets } from './prepare-image-codecs.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function packageImageMaterials({
  materialsRoot = fileURLToPath(new URL('../output/image-codecs/license-materials/', import.meta.url)),
  bundleRoot = fileURLToPath(new URL('../vendor/image-codecs/', import.meta.url)),
} = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'zero-package-image-codecs-'));
  try {
    // Reuse the distribution gate before making experimental materials a checkout input.
    await prepareImageAssets({ materialsRoot, publicRoot: join(temporary, 'public'), applicationRoot: join(temporary, 'application') });
    const sourceManifest = await readFile(join(materialsRoot, 'manifest.json'));
    const manifest = JSON.parse(sourceManifest);
    manifest.materials = manifest.materials.filter((record) => !record.path.startsWith('browser-experiment/'));
    const files = Object.create(null);
    for (const record of [...manifest.materials].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
      const bytes = await readFile(join(materialsRoot, record.path));
      if (bytes.length !== record.bytes || digest(bytes) !== record.sha256) throw new Error(`Material integrity failure: ${record.path}`);
      files[record.path] = bytes;
    }
    files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    const bytes = zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) });
    const lock = { schemaVersion: 1, bytes: bytes.length, sha256: digest(bytes), sourceManifestSha256: digest(sourceManifest), decoderSha256: manifest.replacement.sha256 };
    await mkdir(bundleRoot, { recursive: true });
    await writeFile(join(bundleRoot, 'materials.zip'), bytes);
    await writeFile(join(bundleRoot, 'bundle.json'), JSON.stringify(lock, null, 2) + '\n');
    return lock;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(JSON.stringify(await packageImageMaterials()));
