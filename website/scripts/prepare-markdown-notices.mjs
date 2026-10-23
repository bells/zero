import { readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Explicit offline maintenance step. No package installation or network access.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/markdown-notices');
const roots = ['@codemirror/lang-markdown', '@codemirror/search', 'decode-named-character-reference', 'highlight.js', 'lowlight', 'pdfmake', 'rehype-sanitize', 'rehype-stringify', 'remark-gfm', 'remark-parse', 'remark-rehype', 'unified', '@types/hast', '@types/mdast', '@types/pdfmake'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const records = [];
const sections = ['Zero Markdown third-party notices', '', 'This file preserves notices from installed packages, pinned upstream declarations and the exact pdfmake browser artifact.', 'It conservatively includes reused dependencies and development-only type declarations. Inclusion does not imply every package executes in the browser.', 'Font notices are included here and also remain beside the actual font files.', ''];
const seenText = new Map();
function add(record, text) {
  const sha256 = digest(text);
  let section = seenText.get(sha256);
  if (!section) {
    section = seenText.size + 1;
    seenText.set(sha256, section);
    sections.push(`===== Notice ${section}: ${record.package} ${record.version ?? ''} =====`, `Source: ${record.source}`, '', text.trimEnd(), '');
  }
  records.push({ ...record, sha256, section });
}
async function dependency(name, from) {
  for (let current = from; current !== path.dirname(current); current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', name);
    try { await stat(path.join(candidate, 'package.json')); return await realpath(candidate); } catch { /* Continue Node-style parent lookup. */ }
  }
  throw new Error(`Cannot resolve ${name} from installed Markdown dependencies`);
}
const visited = new Set();
async function collect(base) {
  if (visited.has(base)) return;
  visited.add(base);
  const pkg = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
  const files = (await readdir(base)).filter(file => /^(licen[cs]e|copying|notice)(?:[.\-_]|$)/i.test(file)).sort();
  for (const file of files) {
    if (!(await stat(path.join(base, file))).isFile()) continue;
    const text = await readFile(path.join(base, file), 'utf8');
    const tarball = `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').at(-1)}-${pkg.version}.tgz`;
    add({ package: pkg.name, version: pkg.version, license: pkg.license ?? (/MIT License/i.test(text) ? 'MIT (actual LICENSE)' : 'See notice'), kind: 'installed package notice', source: `${tarball}#package/${file}`, file }, text);
  }
  for (const name of Object.keys(pkg.dependencies ?? {}).sort()) await collect(await dependency(name, base));
}
for (const name of roots) await collect(await realpath(path.join(root, 'node_modules', name)));

const upstream = JSON.parse(await readFile(path.join(output, 'upstream/manifest.json'), 'utf8'));
for (const record of upstream) {
  const text = await readFile(path.join(output, 'upstream', record.file), 'utf8');
  if (digest(text) !== record.sha256) throw new Error(`Pinned upstream notice changed: ${record.file}`);
  add(record, text);
}

const pdfmake = await realpath(path.join(root, 'node_modules/pdfmake'));
const pkg = JSON.parse(await readFile(path.join(pdfmake, 'package.json'), 'utf8'));
const bundle = await readFile(path.join(pdfmake, 'build/pdfmake.js'));
const mapBytes = await readFile(path.join(pdfmake, 'build/pdfmake.js.map'));
const map = JSON.parse(mapBytes.toString('utf8'));
const bundledPackages = [...new Set(map.sources.map(source => source.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].sort();
const embedded = new Set();
for (let index = 0; index < map.sources.length; index++) {
  const text = map.sourcesContent[index];
  if (typeof text !== 'string') continue;
  // The upstream source map retains line comments removed from its browser bundle.
  const comments = [...text.matchAll(/\/\*[\s\S]*?\*\/|(?:^|\n)(?:[ \t]*\/\/[^\n]*(?:\n|$))+/g)].map(match => match[0].trim());
  for (const comment of comments) {
    if (!/copyright\s+(?:\([cC]\)|©|1[89]\d\d|20\d\d|Joyent)|@license|licensed under|public domain|permission is hereby|license\s*:/i.test(comment) || embedded.has(comment)) continue;
    embedded.add(comment);
    add({ package: 'pdfmake embedded source notice', version: pkg.version, kind: 'source-map preserved notice', source: `https://registry.npmjs.org/pdfmake/-/pdfmake-${pkg.version}.tgz#build/pdfmake.js.map:${map.sources[index]}` }, comment);
  }
}
add({ package: 'SVG-to-PDFKit (vendored in pdfmake)', version: 'b091ebd4e7b7d2310eb1003511cd5de480f7e0e1', license: 'MIT', kind: 'vendored license', source: 'https://github.com/alafr/SVG-to-PDFKit/blob/b091ebd4e7b7d2310eb1003511cd5de480f7e0e1/LICENSE' }, await readFile(path.join(pdfmake, 'src/3rd-party/svg-to-pdfkit/LICENSE'), 'utf8'));
add({ package: 'Noto Sans SC', version: '2.004-H2', license: 'OFL-1.1', kind: 'font notice', source: 'https://github.com/google/fonts/blob/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/OFL.txt' }, await readFile(path.join(root, 'public/markdown-fonts/OFL.txt'), 'utf8'));

const manifest = { format: 1, roots, resolvedPackageCount: visited.size, pdfmakeBrowserBundle: { version: pkg.version, sha256: digest(bundle), bytes: bundle.length, sourceMapSha256: digest(mapBytes), sourceMapPackages: bundledPackages }, notes: ['Three upstream projects omit standalone LICENSE files at their pinned tags. Their complete upstream README and package metadata preserve their MIT declaration without inventing copyright notices.', 'Full Apache-2.0, BSD-3-Clause, ISC, BlueOak-1.0.0, 0BSD and OFL text is preserved from actual license files; source-map notices retain embedded Google/QR/Node author notices.', 'Versions for seven separately vendored browser helpers are confirmed by exact source-map file matches in the integrity-verified npm artifacts recorded under upstream/.'], records };
const artifacts = { 'THIRD-PARTY-NOTICES.txt': sections.join('\n'), 'manifest.json': JSON.stringify(manifest, null, 2) + '\n' };
for (const [name, text] of Object.entries(artifacts)) {
  if (process.argv.includes('--check')) assert.equal(await readFile(path.join(output, name), 'utf8'), text, `Markdown notice artifact is stale: ${name}`);
  else await writeFile(path.join(output, name), text);
}
console.log(`Markdown notices: ${visited.size} resolved packages, ${records.length} records, ${seenText.size} distinct notice sections.`);
