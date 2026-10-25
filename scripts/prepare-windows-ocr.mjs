import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function windowsOcrRequired({ platform = process.platform, target, tools }) {
  return tools.includes('snap') && (target ? target.includes('windows') : platform === 'win32');
}
function checkedPath(root, relative) {
  if (typeof relative !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(relative) || relative === '.' || relative === '..') throw new Error('Invalid OCR resource path');
  return path.join(root, relative);
}
function checkBytes(bytes, item) {
  if (!Number.isSafeInteger(item.bytes) || item.bytes < 1 || bytes.length !== item.bytes) throw new Error(`OCR resource size mismatch: ${item.path}`);
  if (!/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || digest(bytes) !== item.sha256) throw new Error(`OCR resource digest mismatch: ${item.path}`);
}
export function verifyWindowsOcrAssets(root, manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid OCR manifest');
  let bytes = 0;
  const names = new Set();
  for (const item of manifest.files) {
    const absolute = checkedPath(root, item.path);
    if (names.has(item.path)) throw new Error('Duplicate OCR resource path');
    names.add(item.path);
    let stat;
    try { stat = fs.lstatSync(absolute); } catch { throw new Error(`Missing OCR resource: ${item.path}`); }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`OCR resource must be a regular file, not symlink: ${item.path}`);
    checkBytes(fs.readFileSync(absolute), item);
    bytes += stat.size;
  }
  return { bytes, files: names.size };
}
async function archiveBytes(archive, cache) {
  const absolute = path.join(cache, `${archive.sha256}.zip`);
  if (fs.existsSync(absolute)) {
    const bytes = fs.readFileSync(absolute);
    if (digest(bytes) === archive.sha256) return bytes;
  }
  const response = await fetch(archive.url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`OCR archive download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== archive.bytes || digest(bytes) !== archive.sha256) throw new Error('OCR archive size or digest mismatch');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(absolute, bytes);
  return bytes;
}
export async function prepareWindowsOcr({ root = ROOT, download = false } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/ocr-assets.json'), 'utf8'));
  const output = path.join(root, 'node_modules/.cache/zero-windows-ocr/resources');
  try { return verifyWindowsOcrAssets(output, manifest); } catch (error) { if (!download) throw error; }
  const cache = path.join(root, 'node_modules/.cache/zero-windows-ocr');
  fs.mkdirSync(output, { recursive: true });
  for (const archive of manifest.archives) {
    const zip = await JSZip.loadAsync(await archiveBytes(archive, cache), { checkCRC32: true });
    for (const item of manifest.files.filter(item => item.archive === archive.id)) {
      const entry = zip.file(item.member);
      if (!entry) throw new Error(`Missing OCR archive member: ${item.path}`);
      const bytes = await entry.async('nodebuffer');
      checkBytes(bytes, item);
      const destination = checkedPath(output, item.path);
      if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('OCR output may not be a symlink');
      fs.writeFileSync(destination, bytes);
    }
  }
  for (const item of manifest.files.filter(item => item.source)) {
    const bytes = fs.readFileSync(path.join(root, item.source));
    checkBytes(bytes, item);
    fs.copyFileSync(path.join(root, item.source), checkedPath(output, item.path));
  }
  return verifyWindowsOcrAssets(output, manifest);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareWindowsOcr({ download: process.argv.includes('--download') });
  console.log(`Windows OCR resources verified: ${result.files} files, ${result.bytes} bytes`);
}
