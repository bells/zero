import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { imageMeta } from 'image-meta';
import sharp from 'sharp';

const root = new URL('../../output/image-codecs/fixtures/', import.meta.url);
test('synthetic corpus has traceable real bytes and explicitly identified adversarial inputs', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.personalData, false);
  assert.match(manifest.generator, /generate-fixtures\.mjs/);
  for (const tag of ['jpeg', 'png', 'webp', 'alpha', 'orientation', 'gps', 'device', 'xmp', 'damaged', 'disguised', 'animation', 'heic-12mp', 'heic-48mp']) {
    assert.ok(manifest.files.some((entry) => entry.tags.includes(tag)), `Missing ${tag}`);
  }
  for (const entry of manifest.files) {
    assert.match(entry.source, /^synthetic:/);
    assert.equal(entry.name.includes('/'), false);
    const bytes = await readFile(new URL(entry.name, root));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.subarray(0, 16).toString('hex'), entry.signature);
    if (entry.width) {
      const meta = imageMeta(bytes);
      // HEIC container dimensions can describe a tile; primary dimensions are checked separately.
      if (!entry.tags.some((tag) => tag.startsWith('heic-'))) {
        assert.equal(meta.width, entry.width);
        assert.equal(meta.height, entry.height);
      } else {
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        assert.equal(entry.width * entry.height, entry.tags.includes('heic-48mp') ? 48_771_072 : 12_192_768);
        assert.match(entry.source, /Apple ImageIO/);
        assert.equal(entry.cameraOriginal, false);
      }
    }
  }
});
test('alpha reference, orientation, metadata and animation are present in actual fixture bytes', async () => {
  const pixels = await sharp(await readFile(new URL('alpha.png', root))).raw().toBuffer();
  assert.deepEqual(pixels, await readFile(new URL('alpha.rgba', root)));
  assert.equal(pixels[3], 0);
  assert.ok(pixels[0] > 0, 'Transparent RGB must be nonzero for optimizer regression');
  for (const orientation of [1, 3, 6, 8]) {
    const meta = await sharp(await readFile(new URL(`orientation-${orientation}.jpg`, root))).metadata();
    assert.equal(meta.orientation, orientation);
    assert.ok(meta.exif.includes(Buffer.from('ZERO_SYNTHETIC_DEVICE')));
    // TIFF GPS IFD pointer (0x8825), encoded little-endian by the fixture encoder.
    assert.ok(meta.exif.includes(Buffer.from([0x25, 0x88, 0x04, 0x00])));
  }
  const png = await sharp(await readFile(new URL('metadata.png', root))).metadata();
  assert.ok(png.exif.includes(Buffer.from('ZERO_SYNTHETIC_DEVICE')));
  assert.ok(png.xmp.includes(Buffer.from('ZERO_SYNTHETIC_XMP')));
  const animated = await sharp(await readFile(new URL('animated.webp', root)), { animated: true }).metadata();
  assert.equal(animated.pages, 2);
});
