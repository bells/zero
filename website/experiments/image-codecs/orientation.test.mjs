import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../../output/image-codecs/fixtures/', import.meta.url);
test('HEIC rotations change an associated container irot property, retaining encoded image data', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const source = await readFile(new URL('synthetic-12mp.heic', root));
  for (const quarterTurns of [1, 2, 3]) {
    const entry = manifest.files.find((file) => file.name === `heic-rotate-${quarterTurns}.heic`);
    assert.ok(entry, `Missing HEIC rotation ${quarterTurns}`);
    const rotated = await readFile(new URL(entry.name, root));
    const differences = [...source.keys()].filter((index) => source[index] !== rotated[index]);
    assert.equal(rotated.length, source.length);
    assert.equal(differences.length, 1);
    const offset = differences[0];
    assert.equal(rotated.toString('ascii', offset - 4, offset), 'irot');
    assert.equal(rotated[offset], quarterTurns);
    assert.equal(entry.quarterTurnsCCW, quarterTurns);
    assert.equal(entry.width, quarterTurns % 2 ? 3024 : 4032);
    assert.equal(entry.height, quarterTurns % 2 ? 4032 : 3024);
  }
  assert.ok(manifest.files.some((file) => file.name === 'damaged.heic'));
});
