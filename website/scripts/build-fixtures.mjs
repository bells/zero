import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { catalogSchema } from '../src/content/catalog.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../output/fixtures/', import.meta.url);
await mkdir(output, { recursive: true });
const packageEntry = {
  version: '0.1.0', releasedAt: '2026-10-11', verifiedAt: '2026-10-11', channel: 'trial', visibility: 'published', profile: 'standard',
  tools: ['zero.awake', 'zero.paper', 'zero.snap', 'zero.launch'], platform: 'macos', architecture: 'aarch64', format: 'dmg',
  url: 'https://github.com/bells/zero/releases/download/v0.1.0/Zero-standard-aarch64.dmg', sha256: 'a'.repeat(64), bytes: 1000000,
  signing: 'ad-hoc', source: 'https://github.com/bells/zero/releases/tag/v0.1.0',
};
const fixture = catalogSchema.parse({ verifiedAt: '2026-10-11', source: 'https://api.github.com/repos/bells/zero/releases', state: 'published', packages: [
  packageEntry,
  { ...packageEntry, architecture: 'x86_64', url: packageEntry.url.replace('aarch64', 'x86_64') },
  { ...packageEntry, channel: 'stable', profile: 'core', tools: [], platform: 'windows', architecture: 'x86_64', format: 'msi', signing: 'unsigned', url: packageEntry.url.replace('standard-aarch64.dmg', 'core-x86_64.msi') },
] });

// Build copied sources so test installers can never enter the real catalog or production output.
const workspace = await mkdtemp(new URL('build-', output));
try {
  for (const entry of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) await cp(`${root}${entry}`, `${workspace}/${entry}`, { recursive: true });
  await symlink(`${root}node_modules`, `${workspace}/node_modules`, 'dir');
  await writeFile(`${workspace}/src/content/releases.json`, JSON.stringify(fixture));
  execFileSync(process.execPath, [`${root}node_modules/astro/bin/astro.mjs`, 'build'], { cwd: workspace, env: { ...process.env, SITE_BASE: '/', SITE_PREVIEW: '0', VERCEL_ENV: 'production' }, stdio: 'pipe' });
  await cp(`${workspace}/dist`, new URL('catalog/', output), { recursive: true });
  const html = await readFile(`${workspace}/dist/download/index.html`, 'utf8');
  assert.match(html, /content="index, follow"/, 'SITE_PREVIEW=0 must stay indexable');
  assert.ok(html.includes('application/ld+json'), 'Production fixture must include its entity graph');
  assert.equal((html.match(/class="package-entry"/g) || []).length, 3);
  assert.ok(html.includes('Apple Silicon') && html.includes('Intel') && html.includes('trial') && html.includes('stable'));
  await writeFile(`${workspace}/src/content/releases.json`, await readFile(`${root}src/content/releases.json`));
  execFileSync(process.execPath, [`${root}node_modules/astro/bin/astro.mjs`, 'build'], { cwd: workspace, env: { ...process.env, SITE_BASE: '/zero-preview/', SITE_PREVIEW: '1' }, stdio: 'pipe' });
  await cp(`${workspace}/dist`, new URL('preview/', output), { recursive: true });
  for (const route of ['', 'en/', 'download/', 'en/download/', 'tools/snap/', 'en/tools/snap/', 'guide/install/', 'en/guide/install/', 'faq/', 'en/faq/', 'tools/', 'en/tools/', 'tools/timestamp/', 'en/tools/timestamp/', 'tools/json/', 'en/tools/json/', 'tools/base64/', 'en/tools/base64/', 'tools/diff/', 'en/tools/diff/']) {
    const page = await readFile(`${workspace}/dist/${route}index.html`, 'utf8');
    assert.match(page, /content="noindex, nofollow"/);
    assert.ok(page.includes(`https://www.usezero.cn/zero-preview/${route}`));
    assert.ok(page.includes('/zero-preview/brand/zero.svg'));
    assert.equal(/(?:src|href)="\/(?!zero-preview\/)/.test(page), false, `Unprefixed resource on ${route}`);
    assert.equal(page.includes('application/ld+json'), false, `Preview entity graph on ${route}`);
  }
  for (const file of ['llms.txt', 'llms-full.txt']) {
    const text = await readFile(`${workspace}/dist/${file}`, 'utf8');
    assert.match(text, /Discovery index is disabled/);
    assert.equal(text.includes('https://www.usezero.cn'), false);
  }
  assert.match(await readFile(`${workspace}/dist/robots.txt`, 'utf8'), /Disallow: \//);
  assert.ok((await readFile(`${workspace}/dist/sitemap-0.xml`, 'utf8')).includes('https://www.usezero.cn/zero-preview/en/download/'));
  execFileSync(process.execPath, [`${root}node_modules/astro/bin/astro.mjs`, 'build'], { cwd: workspace, env: { ...process.env, SITE_BASE: '/', SITE_PREVIEW: '0', VERCEL_ENV: 'preview' }, stdio: 'pipe' });
  assert.match(await readFile(`${workspace}/dist/index.html`, 'utf8'), /content="noindex, nofollow"/, 'Vercel preview must opt out of indexing automatically');
  assert.match(await readFile(`${workspace}/dist/robots.txt`, 'utf8'), /Disallow: \//);
  assert.match(await readFile(`${workspace}/dist/llms.txt`, 'utf8'), /Discovery index is disabled/);
  execFileSync(process.execPath, [`${root}node_modules/astro/bin/astro.mjs`, 'build'], { cwd: workspace, env: { ...process.env, SITE_BASE: '/feedback-review/', SITE_PREVIEW: '1', VERCEL_ENV: 'preview', PUBLIC_FEEDBACK_ENABLED: '1', PUBLIC_FEEDBACK_ORIGIN: 'https://production-feedback.example.invalid', PUBLIC_FEEDBACK_PREVIEW_ORIGIN: 'http://127.0.0.1:4323', FEEDBACK_ALLOWED_ORIGINS: 'http://127.0.0.1:4323', FEEDBACK_LOCAL_TEST: '1' }, stdio: 'pipe' });
  await cp(`${workspace}/dist`, new URL('feedback/', output), { recursive: true });
  for (const prefix of ['', 'en/']) for (const tool of ['', 'timestamp/', 'json/', 'base64/', 'diff/']) {
    const page = await readFile(`${workspace}/dist/${prefix}tools/${tool}index.html`, 'utf8');
    assert.ok(page.includes(`data-thread="tools${tool ? `/${tool.slice(0,-1)}` : ''}"`));
    assert.ok(page.includes('data-origin="http://127.0.0.1:4323"'));
    assert.ok(page.includes('frame-src http://127.0.0.1:4323'));
    assert.equal(page.includes('<iframe'), false, 'Frames must only be created after activation');
    assert.equal(page.includes('production-feedback.example.invalid'), false);
  }
  for (const slug of ['snap','awake','paper','launch','file']) assert.equal((await readFile(`${workspace}/dist/tools/${slug}/index.html`, 'utf8')).includes('data-feedback='),false);
  console.log('Isolated catalog fixtures and noindex/base-path builds passed. Fictional test packages remain in ignored output only.');
} finally { await rm(workspace, { recursive: true, force: true }); }
