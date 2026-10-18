import test from 'node:test';
import assert from 'node:assert/strict';
import { materialPath } from './server.mjs';
test('lab server maps only experiment and explicit material paths without queries or traversal', () => {
  assert.equal(materialPath('/image-lab/'), 'browser-experiment/index.html');
  assert.equal(materialPath('/image-lab/assets/worker.js'), 'browser-experiment/assets/worker.js');
  assert.equal(materialPath('/image-lab/materials/sources/libheif.tar.gz'), 'sources/libheif.tar.gz');
  for (const path of ['/', '/package.json', '/image-lab/../secret', '/image-lab/%2e%2e/secret', '/image-lab/assets%2f..%2fsecret', '/image-lab/a?private=x', '/image-lab/a#private', '/image-lab/materials/../secret', '/image-lab/a\\b', '/image-lab/%00']) {
    assert.equal(materialPath(path), null, path);
  }
});
