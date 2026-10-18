import { mkdir, readFile, writeFile, readdir, rename, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const validPath = (path) => typeof path === 'string' && !isAbsolute(path) && !/[\\:]/.test(path) && !path.split('/').some((part) => !part || part === '.' || part === '..');
async function materialReader(materialsRoot, bundleRoot) {
  if (materialsRoot) return (path) => readFile(join(materialsRoot, path));
  const lock = JSON.parse(await readFile(join(bundleRoot, 'bundle.json'), 'utf8'));
  const bytes = await readFile(join(bundleRoot, 'materials.zip'));
  if (lock.schemaVersion !== 1 || bytes.length !== lock.bytes || digest(bytes) !== lock.sha256) throw new Error('Image materials bundle integrity failure');
  let total = 0;
  const names = new Set();
  const files = unzipSync(bytes, { filter: ({ name, originalSize }) => {
    total += originalSize;
    if (!validPath(name) || names.has(name) || names.size >= 4096 || total > 128 * 1024 * 1024) throw new Error('Invalid image materials bundle entry');
    names.add(name);
    return true;
  } });
  return async (path) => {
    if (!Object.hasOwn(files, path)) throw new Error(`Missing bundled material: ${path}`);
    return Buffer.from(files[path]);
  };
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else if (entry.isFile()) paths.push(path);
    else throw new Error('Symbolic links are not allowed in image materials');
  }
  return paths;
}
export async function prepareImageAssets({
  materialsRoot,
  bundleRoot = fileURLToPath(new URL('../vendor/image-codecs/', import.meta.url)),
  publicRoot = fileURLToPath(new URL('../public/', import.meta.url)),
  applicationRoot = fileURLToPath(new URL('../', import.meta.url)),
} = {}) {
  const readMaterial = await materialReader(materialsRoot, bundleRoot);
  const manifest = JSON.parse(await readMaterial('manifest.json'));
  if (!manifest.replacement?.hostUnchanged || manifest.replacement.sha256 !== manifest.build?.artifact?.sha256) throw new Error('Independent decoder replacement proof required');
  const staging = join(publicRoot, `.image-codecs-${process.pid}`), target = join(publicRoot, 'image-codecs'), previous = join(publicRoot, `.image-codecs-previous-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const records = [], seen = new Set();
  async function save(path, bytes) {
    const destination = join(staging, 'materials', path);
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes);
    records.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  try {
    for (const record of manifest.materials) {
      if (!validPath(record.path) || seen.has(record.path)) throw new Error('Invalid material path');
      seen.add(record.path);
      if (record.path.startsWith('browser-experiment/')) continue;
      const bytes = await readMaterial(record.path);
      if (digest(bytes) !== record.sha256 || bytes.length !== record.bytes) throw new Error(`Material integrity failure: ${record.path}`);
      await save(record.path, bytes);
    }
    for (const required of ['decoder/libheif-rebuilt.js', 'THIRD_PARTY_NOTICES.md', 'application-source/image-codecs/REBUILD.md']) if (!seen.has(required)) throw new Error(`Missing material: ${required}`);
    const decoder = await readFile(join(staging, 'materials/decoder/libheif-rebuilt.js'));
    if (digest(decoder) !== manifest.replacement.sha256) throw new Error('Decoder integrity failure');
    const noticeRecords = records.filter((entry) => entry.path.startsWith('notices/'));
    const notices = (await Promise.all(noticeRecords.map((entry) => readFile(join(staging, 'materials', entry.path), 'utf8')))).join('\n');
    if (!notices.includes('GNU GENERAL PUBLIC LICENSE') || !notices.includes('GNU LESSER GENERAL PUBLIC LICENSE')) throw new Error('Complete GPL/LGPL notices required');
    await writeFile(join(staging, 'libheif-rebuilt.js'), decoder);
    // Explicit allowlist: public application source and build recipes only, never env/profile/private data.
    for (const name of ['src', 'scripts', 'tsconfig.json', 'package.json', 'pnpm-lock.yaml', 'astro.config.mjs', 'public/social.svg', 'public/brand', 'public/licenses']) {
      const path = join(applicationRoot, name);
      if (!await exists(path)) continue;
      const files = ['src', 'scripts', 'public/brand', 'public/licenses'].includes(name) ? await walk(path) : [path];
      for (const file of files) await save(`application-source/website/${relative(applicationRoot, file)}`, await readFile(file));
    }
    await save('application-source/website/IMAGE_TOOLS_BUILD.md', Buffer.from(`# Rebuild the local image workbench\n\nUse Node 24 and pnpm 10.33.0. In this website directory run pnpm install --frozen-lockfile, then node scripts/prepare-social.mjs. Recreate public/image-codecs/ from this materials directory: copy its decoder/libheif-rebuilt.js into public/image-codecs/libheif-rebuilt.js and copy the complete materials directory into public/image-codecs/materials/. Then run pnpm exec astro build directly. This bypasses the repository material-bundle prebuild hook. No secret or environment file is needed for the default static build.\n\nTo replace the LGPL decoder, replace public/image-codecs/libheif-rebuilt.js with an interface-compatible module and rebuild, or replace dist/image-codecs/libheif-rebuilt.js in a static distribution. The host has no runtime hash veto. Native decoder rebuild instructions and complete sources accompany application-source/image-codecs/REBUILD.md. Optional integration tests depend on the original repository's synthetic fixtures; the static application build is independent. This is a local candidate, not release approval.\n`));
    const noticePath = 'THIRD_PARTY_NOTICES.md';
    const notice = await readFile(join(staging, 'materials', noticePath), 'utf8');
    if (!notice.includes('Independent JPEG Group')) throw new Error('IJG attribution required');
    const index = { ...manifest, publicReleaseApproved: false, distribution: 'local functional image tools; final device/resource acceptance pending', materials: records };
    await writeFile(join(staging, 'materials/manifest.json'), JSON.stringify(index, null, 2) + '\n');
    await rm(previous, { recursive: true, force: true });
    if (await exists(target)) await rename(target, previous);
    try { await rename(staging, target); } catch (error) { if (await exists(previous)) await rename(previous, target); throw error; }
    await rm(previous, { recursive: true, force: true });
    return { decoderBytes: decoder.length, materials: records.length, publicReleaseApproved: false };
  } finally { await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(JSON.stringify(await prepareImageAssets()));
