import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const directory = new URL('public/markdown-fonts/', root);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
assert.equal(manifest.fonts.length, 2);
for (const font of manifest.fonts) {
  assert.match(font.file, /^NotoSansSC-(?:Regular|Bold)\.ttf$/);
  const bytes = await readFile(new URL(font.file, directory));
  assert.equal(bytes.length, font.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), font.sha256);
}
assert.equal(createHash('sha256').update(await readFile(new URL('OFL.txt', directory))).digest('hex'), manifest.licenseSha256);
const notices = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/prepare-markdown-notices.mjs', root)), '--check'], { stdio: 'inherit' });
assert.equal(notices.status, 0, 'Markdown license artifacts must match the installed pinned dependency closure');
console.log('Markdown fonts, hashes and offline third-party notices verified.');
