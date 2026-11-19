import { readFile, writeFile } from 'node:fs/promises';

// The website snapshot is generated from the desktop's public market input.
const canonical = new URL('../../market.json', import.meta.url);
const snapshot = new URL('../src/content/plugin-market.json', import.meta.url);
const content = await readFile(canonical, 'utf8');
JSON.parse(content);
if (process.argv.includes('--check')) {
  if (await readFile(snapshot, 'utf8') !== content) throw new Error('Plugin market snapshot is stale; run node scripts/prepare-plugin-market.mjs from website.');
} else {
  await writeFile(snapshot, content);
}
