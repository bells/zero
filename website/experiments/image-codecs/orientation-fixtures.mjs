import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
// This mutates only the synthetic corpus; never parse or rewrite visitor input here.
export async function addOrientationFixtures(root) {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const bytes = await readFile(new URL('synthetic-12mp.heic', root));
  function children(start, end) {
    const boxes = [];
    for (let offset = start; offset < end;) {
      const size = bytes.readUInt32BE(offset);
      if (size < 8 || offset + size > end) throw new Error('Unexpected synthetic box layout');
      boxes.push({ offset, size, type: bytes.toString('ascii', offset + 4, offset + 8) });
      offset += size;
    }
    return boxes;
  }
  // Stop before mdat: ImageIO uses an extended-size data box.
  const metaOffset = bytes.readUInt32BE(0);
  if (bytes.toString('ascii', metaOffset + 4, metaOffset + 8) !== 'meta') throw new Error('Missing synthetic meta');
  const meta = children(metaOffset + 12, metaOffset + bytes.readUInt32BE(metaOffset));
  const pitm = meta.find((box) => box.type === 'pitm');
  const iprp = meta.find((box) => box.type === 'iprp');
  if (!pitm || !iprp || bytes[pitm.offset + 8] !== 0) throw new Error('Unexpected primary layout');
  const primary = bytes.readUInt16BE(pitm.offset + 12);
  const properties = children(iprp.offset + 8, iprp.offset + iprp.size);
  const ipco = properties.find((box) => box.type === 'ipco');
  const ipma = properties.find((box) => box.type === 'ipma');
  if (!ipco || !ipma || bytes.readUInt32BE(ipma.offset + 8) !== 0) throw new Error('Unexpected association layout');
  const items = children(ipco.offset + 8, ipco.offset + ipco.size);
  const rotation = items.findIndex((box) => box.type === 'irot');
  if (rotation < 0 || items[rotation].size !== 9) throw new Error('Missing one-byte irot');
  let associated = false, cursor = ipma.offset + 16;
  for (let index = 0; index < bytes.readUInt32BE(ipma.offset + 12); index++) {
    const id = bytes.readUInt16BE(cursor), count = bytes[cursor + 2];
    cursor += 3;
    const indices = [...bytes.subarray(cursor, cursor + count)].map((value) => value & 127);
    if (id === primary && indices.includes(rotation + 1)) associated = true;
    cursor += count;
  }
  if (!associated) throw new Error('irot is not associated with primary');
  const names = ['underreported.heic', 'damaged.heic', ...[1, 2, 3].map((turn) => `heic-rotate-${turn}.heic`)];
  manifest.files = manifest.files.filter((entry) => !names.includes(entry.name));
  async function save(name, data, details) {
    await writeFile(new URL(name, root), data);
    manifest.files.push({ name, source: 'synthetic: Apple ImageIO encoded quadrants; associated primary irot changed without reencoding',
      cameraOriginal: false, ...details, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), signature: data.subarray(0, 16).toString('hex') });
  }
  for (const turn of [1, 2, 3]) {
    const rotated = Buffer.from(bytes);
    rotated[items[rotation].offset + 8] = turn;
    await save(`heic-rotate-${turn}.heic`, rotated, { tags: ['heic-orientation'], quarterTurnsCCW: turn,
      width: turn % 2 ? 3024 : 4032, height: turn % 2 ? 4032 : 3024, expected: 'apply associated irot exactly once; rotated quadrant samples match baseline' });
  }
  const underreported = Buffer.from(bytes);
  for (const item of items.filter((box) => box.type === 'ispe')) {
    underreported.writeUInt32BE(96, item.offset + 12);
    underreported.writeUInt32BE(64, item.offset + 16);
  }
  await save('underreported.heic', underreported, { source: 'synthetic: Apple ImageIO HEIC; ispe properties deliberately underreport encoded grid dimensions', tags: ['heic-adversarial'], width: 4032, height: 3024, probedWidth: 96, probedHeight: 64, expected: 'both header readers underreport; candidate decode must fail, never output success; internal allocation not bounded by ispe' });
  await save('damaged.heic', bytes.subarray(0, 128), { tags: ['damaged', 'heic-invalid'], expected: 'reject malformed HEIC without output' });
  await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await addOrientationFixtures(new URL('../../output/image-codecs/fixtures/', import.meta.url));
}
