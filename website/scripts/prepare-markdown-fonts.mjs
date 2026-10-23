import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Preparation is an explicit maintenance operation, never part of the site build.
const source = process.argv[2];
const python = process.env.MARKDOWN_FONT_PYTHON || 'python3';
if (!source) throw new Error('Usage: MARKDOWN_FONT_PYTHON=/path/to/python node scripts/prepare-markdown-fonts.mjs /path/to/NotoSansSC-variable.ttf');
const expected = 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da';
if (createHash('sha256').update(await readFile(source)).digest('hex') !== expected) throw new Error('Upstream font checksum does not match the reviewed source');
const directory = fileURLToPath(new URL('../public/markdown-fonts/', import.meta.url));
const script = `
import sys
import fontTools
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
if fontTools.__version__ != '4.60.1':
    raise RuntimeError('Preparation requires fonttools==4.60.1')
for weight, label in [(400, 'Regular'), (700, 'Bold')]:
    font = TTFont(sys.argv[1], recalcTimestamp=False)
    instantiateVariableFont(font, {'wght': weight}, inplace=True)
    font.save(sys.argv[2] + '/NotoSansSC-' + label + '.ttf')
`;
const result = spawnSync(python, ['-c', script, source, directory], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Font preparation failed');
for (const label of ['Regular', 'Bold']) {
  const name = `NotoSansSC-${label}.ttf`;
  const bytes = await readFile(`${directory}/${name}`);
  console.log(`${name}: ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
}
