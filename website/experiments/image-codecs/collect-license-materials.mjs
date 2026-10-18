import { mkdir, readFile, writeFile, cp, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../output/image-codecs/', import.meta.url));
const output = join(root, 'license-materials');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sources = JSON.parse(await readFile(join(root, 'sources/manifest.json'), 'utf8'));
const inventory = JSON.parse(await readFile(join(root, 'dependency-inventory.json'), 'utf8'));
const records = [];
async function copy(source, destination, expected) {
  const bytes = await readFile(source);
  if (expected && digest(bytes) !== expected) throw new Error(`Material integrity: ${destination}`);
  const target = join(output, destination);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  const record = { path: destination, bytes: bytes.length, sha256: digest(bytes) };
  records.push(record);
  return record;
}
for (const source of sources.downloaded) {
  await copy(join(root, `sources/${source.id}.tar.gz`), `sources/${source.id}.tar.gz`, source.sha256);
  for (const notice of source.notices) await copy(join(root, `sources/${notice.file}`), `notices/upstream/${notice.file}`, notice.sha256);
}
const emscripten = join(root, 'toolchain/emsdk-6.0.12/upstream/emscripten');
for (const notice of ['LICENSE', 'system/lib/compiler-rt/LICENSE.TXT', 'system/lib/libcxx/LICENSE.TXT', 'system/lib/libcxxabi/LICENSE.TXT', 'system/lib/libunwind/LICENSE.TXT', 'system/lib/libc/musl/COPYRIGHT', 'system/lib/llvm-libc/LICENSE.TXT', 'system/lib/mimalloc/LICENSE']) {
  await copy(join(emscripten, notice), `notices/emscripten-6.0.12/${notice}`);
}
const packages = [];
for (const pkg of inventory.packages) {
  const resolver = pkg.name === 'wasm-feature-detect' ? createRequire(require.resolve('@jsquash/webp')) : require;
  let directory = dirname(resolver.resolve(pkg.name));
  for (;;) {
    try { if (JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).name === pkg.name) break; } catch { /* Resolve owning package. */ }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Package missing: ${pkg.name}`);
    directory = parent;
  }
  const notices = pkg.files.filter((file) => /^(?:LICENSE|LICENCE|COPYING|NOTICE|COPYRIGHT|README\.ijg)/i.test(file.path.split('/').at(-1)));
  if (!notices.length) throw new Error(`No notice: ${pkg.name}`);
  for (const notice of notices) await copy(join(directory, notice.path), `notices/npm/${pkg.name}/${notice.path}`, notice.sha256);
  if (pkg.name === 'image-meta') await cp(directory, join(output, 'sources/image-meta-0.3.0'), { recursive: true });
  packages.push({ name: pkg.name, version: pkg.version, declaredLicense: pkg.declaredLicense, notices: notices.map((notice) => notice.path) });
}
const rust = [];
for (const codec of ['png', 'oxipng']) {
  const metadata = JSON.parse(await readFile(join(root, `review/${codec}-metadata.json`), 'utf8'));
  const crateRecords = [];
  const directory = join(root, `rebuild/${codec}-codec`);
  const vendorArchive = join(output, `sources/${codec}-rust-vendor.tar.gz`);
  execFileSync('/usr/bin/tar', ['-czf', vendorArchive, '-C', directory, 'Cargo.toml', 'Cargo.lock', 'src', 'vendor']);
  const vendorBytes = await readFile(vendorArchive);
  records.push({ path: relative(output, vendorArchive), bytes: vendorBytes.length, sha256: digest(vendorBytes) });
  for (const pkg of metadata.packages.filter((entry) => entry.source)) {
    const crate = join(directory, `vendor/${pkg.name}-${pkg.version}`);
    const notices = (await readdir(crate)).filter((name) => /^(LICENSE|LICENCE|COPYING|NOTICE|COPYRIGHT)/i.test(name));
    let selectedLicense;
    if (pkg.name === 'wasm_sync' && pkg.version === '0.1.2' && pkg.license === 'MIT OR Apache-2.0' && !notices.length) {
      selectedLicense = 'Apache-2.0';
      await copy(join(root, 'review/apache-2.0.txt'), `notices/rust/${codec}/${pkg.name}-${pkg.version}/LICENSE-APACHE-2.0.txt`);
      await copy(join(crate, 'Cargo.toml.orig'), `notices/rust/${codec}/${pkg.name}-${pkg.version}/DECLARED-LICENSE-Cargo.toml`);
    } else if (!pkg.license || !notices.length) throw new Error(`Unreviewed Rust license: ${pkg.name}`);
    for (const notice of notices) await copy(join(crate, notice), `notices/rust/${codec}/${pkg.name}-${pkg.version}/${notice}`);
    const checksum = JSON.parse(await readFile(join(crate, '.cargo-checksum.json'), 'utf8'));
    crateRecords.push({ name: pkg.name, version: pkg.version, license: pkg.license, selectedLicense, selectedLicenseSource: selectedLicense ? 'https://www.apache.org/licenses/LICENSE-2.0.txt' : undefined, checksum: checksum.package, notices });
  }
  rust.push({ codec, crates: crateRecords });
}
await cp(fileURLToPath(new URL('.', import.meta.url)), join(output, 'application-source/image-codecs'), { recursive: true });
await copy(fileURLToPath(new URL('../../package.json', import.meta.url)), 'application-source/package.json');
await copy(fileURLToPath(new URL('../../pnpm-lock.yaml', import.meta.url)), 'application-source/pnpm-lock.yaml');
const rebuilt = JSON.parse(await readFile(join(root, 'rebuild/build-manifest.json'), 'utf8'));
const replacement = JSON.parse(await readFile(join(root, 'results-rebuilt.json'), 'utf8'));
if (!rebuilt.browserReplacementVerified || !replacement.replacement?.hostUnchanged || replacement.replacement.sha256 !== rebuilt.artifact.sha256 || replacement.errors.length) throw new Error('Successful independent browser replacement evidence required');
await copy(join(root, 'rebuild/libheif-rebuilt.js'), 'decoder/libheif-rebuilt.js', rebuilt.artifact.sha256);
await copy(join(root, 'rebuild/build-manifest.json'), 'decoder/build-manifest.json');
await copy(join(root, 'results-rebuilt.json'), 'decoder/results-rebuilt.json');
await cp(join(root, 'dist'), join(output, 'browser-experiment'), { recursive: true });
const notice = `# Experimental image codec materials\n\nThis software is based in part on the work of the Independent JPEG Group.\n\nheic-to and the libheif/libde265 decoder are LGPL-3.0-or-later as stated in their source notices. Complete GPLv3/LGPLv3 texts are included in upstream COPYING/LICENSE files. Other components retain their exact Apache, BSD, MIT, zlib, 0BSD and Unicode notices below.\n\nThe standalone HEIC module may be modified and replaced for your own use. Reverse engineering for debugging such modifications is permitted; no application term here restricts LGPL rights. Sources and rebuild/replacement instructions accompany these materials. No technical integrity check in the host rejects an interface-compatible replacement. This is an experimental local distribution bundle, not a published website or legal certification.\n\nSee manifest.json for original source refs, checksums and every collected notice. See application-source/image-codecs/DEPENDENCIES.md for findings and limitations.\n`;
await writeFile(join(output, 'THIRD_PARTY_NOTICES.md'), notice);
async function index(directory = output) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) await index(location);
    else if (entry.isFile() && !records.some((record) => record.path === relative(output, location))) {
      const bytes = await readFile(location);
      records.push({ path: relative(output, location), bytes: bytes.length, sha256: digest(bytes) });
    }
  }
}
await index();
await writeFile(join(output, 'manifest.json'), JSON.stringify({ publicReleaseApproved: false, replacement: replacement.replacement, build: { emscripten: rebuilt.emscripten, cmake: rebuilt.cmake, artifact: rebuilt.artifact }, sources: sources.downloaded.map(({ notices, ...source }) => source), packages, rust, materials: records }, null, 2) + '\n');
console.log(JSON.stringify({ sourceArchives: sources.downloaded.length, npmPackages: packages.length, rustCrates: rust.map((entry) => ({ codec: entry.codec, count: entry.crates.length })), materials: records.length, publicReleaseApproved: false }));
