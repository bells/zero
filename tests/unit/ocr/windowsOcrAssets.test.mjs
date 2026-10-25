import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const modulePath = path.resolve('scripts/prepare-windows-ocr.mjs');
const load = async () => {
  assert.ok(fs.existsSync(modulePath), 'Windows OCR resource verifier must exist');
  return import(modulePath);
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-ocr-assets-'));
  const bytes = Buffer.from('synthetic model resource');
  fs.writeFileSync(path.join(root, 'model.onnx'), bytes);
  return { root, manifest: { schemaVersion: 1, files: [{ path: 'model.onnx', bytes: bytes.length, sha256: digest(bytes) }] } };
}

test('Windows OCR build fails closed for missing, corrupt and symlink resources', async () => {
  const { verifyWindowsOcrAssets } = await load();
  const { root, manifest } = fixture();
  try {
    assert.equal(verifyWindowsOcrAssets(root, manifest).bytes, 24);
    fs.writeFileSync(path.join(root, 'model.onnx'), 'corrupt');
    assert.throws(() => verifyWindowsOcrAssets(root, manifest), /size|digest/i);
    fs.unlinkSync(path.join(root, 'model.onnx'));
    assert.throws(() => verifyWindowsOcrAssets(root, manifest), /missing/i);
    const outside = path.join(root, 'outside');
    fs.writeFileSync(outside, 'synthetic model resource');
    fs.symlinkSync(outside, path.join(root, 'model.onnx'));
    assert.throws(() => verifyWindowsOcrAssets(root, manifest), /regular|symlink/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Windows OCR verifier rejects traversal and unpinned resources', async () => {
  const { verifyWindowsOcrAssets } = await load();
  const { root, manifest } = fixture();
  try {
    for (const invalid of ['../escape', '/tmp/model.onnx', 'C:\\evil.onnx', 'sub/../../escape']) {
      assert.throws(() => verifyWindowsOcrAssets(root, { ...manifest, files: [{ ...manifest.files[0], path: invalid }] }), /path/i);
    }
    assert.throws(() => verifyWindowsOcrAssets(root, { ...manifest, files: [{ ...manifest.files[0], sha256: null }] }), /digest/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('OCR target selection skips native resources outside Windows Snap profiles', async () => {
  const { windowsOcrRequired } = await load();
  assert.equal(windowsOcrRequired({ platform: 'darwin', target: undefined, tools: ['snap'] }), false);
  assert.equal(windowsOcrRequired({ platform: 'darwin', target: 'x86_64-pc-windows-msvc', tools: ['snap'] }), true);
  assert.equal(windowsOcrRequired({ platform: 'win32', tools: [] }), false);
  assert.equal(windowsOcrRequired({ platform: 'win32', tools: ['snap'] }), true);
});
