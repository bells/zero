import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validatePluginManifest } from '/private/tmp/zero-tests/core/pluginHost/validation.js';

const directories = ['screenshot', 'caffeine', 'bingWallpaper', 'quickLauncher', 'file'];
test('bundled metadata shares one source and passes complete version and manifest validation', () => {
  const ids = new Set();
  const contributions = new Set();
  const native = fs.readFileSync('src-tauri/src/bundled_metadata.rs', 'utf8');
  for (const dir of directories) {
    const manifest = JSON.parse(fs.readFileSync(`src/plugins/${dir}/metadata.json`, 'utf8'));
    const report = validatePluginManifest(manifest);
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    assert.equal(ids.has(manifest.id), false);
    ids.add(manifest.id);
    assert.equal(manifest.id, manifest.name);
    assert.ok(native.includes(`src/plugins/${dir}/metadata.json`));
    assert.match(fs.readFileSync(`src/plugins/${dir}/plugin.tsx`, 'utf8'), /import metadata from "\.\/metadata.json"/);
    for (const key of ['views', 'commands', 'statusBarItems']) {
      for (const c of manifest.contributes?.[key] ?? []) {
        assert.equal(contributions.has(c.id), false);
        assert.ok(c.id.startsWith(`${manifest.id}.`));
        contributions.add(c.id);
      }
    }
  }
  assert.deepEqual([...ids].sort(), ['zero.awake', 'zero.file', 'zero.launch', 'zero.paper', 'zero.snap']);
});
