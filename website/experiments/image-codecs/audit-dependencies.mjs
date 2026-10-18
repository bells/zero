import { createRequire } from 'node:module';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const candidates = { 'image-meta': '0.3.0', 'heic-to': '1.6.6', '@jsquash/jpeg': '1.6.0', '@jsquash/webp': '1.5.0', '@jsquash/png': '3.1.1', '@jsquash/oxipng': '2.3.0', fflate: '0.8.3', 'wasm-feature-detect': '1.9.0' };
const output = new URL('../../output/image-codecs/', import.meta.url);
await mkdir(output, { recursive: true });
const packages = [];
async function walk(root, directory = root) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name === 'node_modules') continue;
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await walk(root, path));
    else if (item.isFile()) {
      const bytes = await readFile(path);
      files.push({ path: relative(root, path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
for (const [name, version] of Object.entries(candidates)) {
  // Some dependencies do not export package.json; walk from the resolved entry.
  const resolver = name === 'wasm-feature-detect' ? createRequire(require.resolve('@jsquash/webp')) : require;
  let root = dirname(resolver.resolve(name));
  let metadata;
  for (;;) {
    try { const value = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); if (value.name === name) { metadata = value; break; } } catch { /* Find the owning package. */ }
    const parent = dirname(root);
    if (parent === root) throw new Error(`Package root unavailable: ${name}`);
    root = parent;
  }
  if (metadata.version !== version) throw new Error(`Unexpected locked version: ${name}@${metadata.version}`);
  packages.push({ name, version, declaredLicense: metadata.license, repository: metadata.repository, files: await walk(root) });
}
const dist = fileURLToPath(new URL('dist/', output));
const artifacts = await walk(dist);
await writeFile(new URL('dependency-inventory.json', output), JSON.stringify({ releaseApproved: false, packages, experimentalArtifacts: artifacts }, null, 2) + '\n');
console.log(`Inventoried ${packages.length} fixed packages and ${artifacts.length} experiment artifacts. Inventory alone is not release approval; see source/license/replacement evidence.`);
