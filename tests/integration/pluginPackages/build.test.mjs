import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { buildPluginPackage, checkPluginPackage } from '../../../scripts/plugin-packages/build.mjs';

async function fixture(t, source = `import { greeting } from '@zero/sdk'; document.body.textContent = greeting;`) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-package-boundary-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pluginRoot = path.join(root, 'tool');
  const sdkRoot = path.join(root, 'sdk');
  await fs.mkdir(pluginRoot); await fs.mkdir(sdkRoot);
  const manifest = {
    schemaVersion: 2, name: 'zero.fixture', id: 'zero.fixture', displayName: 'Fixture', description: 'Synthetic fixture',
    author: 'Test', version: '1.0.0', engines: { zero: '>=0.2.0 <0.3.0', api: '^1.0.0' },
    platforms: ['macos'], runtime: 'webview', main: 'index.html', permissions: [],
    contributes: { views: [{ id: 'zero.fixture.main', title: 'Fixture', surface: 'main' }] },
    activationEvents: ['onView:zero.fixture.main'],
  };
  await fs.writeFile(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(pluginRoot, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module', dependencies: {} }));
  await fs.writeFile(path.join(pluginRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  await fs.writeFile(path.join(pluginRoot, 'index.html'), '<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>');
  await fs.writeFile(path.join(pluginRoot, 'main.ts'), source);
  await fs.writeFile(path.join(sdkRoot, 'package.json'), JSON.stringify({ name: '@zero/sdk', type: 'module', dependencies: {} }));
  await fs.writeFile(path.join(sdkRoot, 'index.ts'), 'export const greeting = "independent-sdk";');
  await fs.mkdir(path.join(root, 'host')); await fs.mkdir(path.join(root, 'peer'));
  await fs.writeFile(path.join(root, 'host/private.ts'), 'export const secret = "host-private";');
  await fs.writeFile(path.join(root, 'peer/private.ts'), 'export const secret = "peer-private";');
  return { root, pluginRoot, sdkRoot, outputDir: path.join(root, 'out'), manifest };
}
async function setManifest(f, changes) {
  await fs.writeFile(path.join(f.pluginRoot, 'manifest.json'), JSON.stringify({ ...f.manifest, ...changes }));
}

test('builds one real HTML/SDK module archive, checks compressed contents and produces identical bytes', async t => {
  const f = await fixture(t);
  const first = await buildPluginPackage(f);
  const bytes = await fs.readFile(first.output);
  const archive = await JSZip.loadAsync(bytes);
  assert.ok(archive.file('manifest.json'));
  assert.ok(archive.file('index.html'));
  assert.ok(Object.keys(archive.files).some(name => name.endsWith('.js')));
  assert.ok(Object.keys(archive.files).every(name => !name.startsWith('zero.fixture/')));
  const js = await Promise.all(Object.values(archive.files).filter(file => file.name.endsWith('.js')).map(file => file.async('string')));
  assert.ok(js.join('').includes('independent-sdk'));
  assert.ok(!js.join('').includes('host-private'));
  assert.equal((await checkPluginPackage({ bytes })).manifest.id, 'zero.fixture');
  const second = await buildPluginPackage(f);
  assert.equal(second.sha256, first.sha256);
  assert.deepEqual(await fs.readFile(second.output), bytes);
});

for (const [name, source] of [
  ['host source', `import { secret } from '../host/private'; console.log(secret);`],
  ['peer source', `export { secret } from '../peer/private';`],
  ['private Tauri', `import { invoke } from '@tauri-apps/api/core'; void invoke('anything');`],
  ['dynamic peer import', `void import('../peer/private').then(console.log);`],
  ['computed import', `const name = './local'; void import(name);`],
  ['require escape', `const secret = require('../host/private'); console.log(secret);`],
  ['type-only private import', `import type { secret } from '../host/private'; console.log('type-only');`],
]) test(`rejects ${name} before archive creation`, async t => {
  const f = await fixture(t, source);
  await assert.rejects(buildPluginPackage(f), /boundary|private|dynamic|require/i);
  await assert.rejects(fs.stat(f.outputDir), { code: 'ENOENT' });
});

test('rejects transitive alias from a local module into host source', async t => {
  const f = await fixture(t, `import './nested';`);
  await fs.writeFile(path.join(f.pluginRoot, 'nested.ts'), `export { secret } from '@host/private';`);
  await fs.writeFile(path.join(f.pluginRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@host/*': ['../host/*'] } } }));
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

test('rejects an SDK that transitively imports private host source', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.sdkRoot, 'index.ts'), `export { secret as greeting } from '../host/private';`);
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

test('bundles a declared node_modules library and its declared transitive dependency', async t => {
  const f = await fixture(t, `import { value } from 'tiny-lib'; console.log(value);`);
  await fs.writeFile(path.join(f.pluginRoot, 'package.json'), JSON.stringify({ dependencies: { 'tiny-lib': '1.0.0' } }));
  for (const [name, dependencies, body] of [
    ['tiny-lib', { 'tiny-inner': '1.0.0' }, `import { inner } from 'tiny-inner'; export const value = inner;`],
    ['tiny-inner', {}, `export const inner = 'declared-transitive-value';`],
  ]) {
    const dir = path.join(f.pluginRoot, 'node_modules', name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.js', dependencies }));
    await fs.writeFile(path.join(dir, 'index.js'), body);
  }
  const result = await buildPluginPackage(f);
  const zip = await JSZip.loadAsync(await fs.readFile(result.output));
  const js = await Promise.all(Object.values(zip.files).filter(file => file.name.endsWith('.js')).map(file => file.async('string')));
  assert.match(js.join(''), /declared-transitive-value/);
});

test('rejects an undeclared library even when installed', async t => {
  const f = await fixture(t, `import 'unlisted';`);
  const dir = path.join(f.pluginRoot, 'node_modules/unlisted'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'unlisted', main: 'index.js' }));
  await fs.writeFile(path.join(dir, 'index.js'), 'console.log(1);');
  await assert.rejects(buildPluginPackage(f), /undeclared/i);
});

test('rejects a node_modules symlink pointing to private host source', async t => {
  const f = await fixture(t, `import { secret } from 'sneaky'; console.log(secret);`);
  await fs.writeFile(path.join(f.pluginRoot, 'package.json'), JSON.stringify({ dependencies: { sneaky: '1.0.0' } }));
  await fs.writeFile(path.join(f.root, 'host/package.json'), JSON.stringify({ name: 'sneaky', main: 'private.ts' }));
  await fs.mkdir(path.join(f.pluginRoot, 'node_modules')); await fs.symlink(path.join(f.root, 'host'), path.join(f.pluginRoot, 'node_modules/sneaky'));
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

for (const main of ['../escape.html', '/absolute.html', 'C:\\escape.html', 'https://example.com/index.html', 'a%2fb.html']) {
  test(`rejects unsafe manifest main ${main}`, async t => {
    const f = await fixture(t); await setManifest(f, { main });
    await assert.rejects(buildPluginPackage(f), /main|entry|path/i);
  });
}

test('builds the declared background module under its manifest path', async t => {
  const f = await fixture(t);
  await setManifest(f, { background: { main: 'background.js', events: ['daily'] } });
  await fs.writeFile(path.join(f.pluginRoot, 'background.js'), `import { greeting } from '@zero/sdk'; console.log(greeting);`);
  const result = await buildPluginPackage(f);
  const archive = await JSZip.loadAsync(await fs.readFile(result.output));
  assert.ok(archive.file('background.js'));
  const script = await archive.file('background.js').async('string');
  assert.match(script, /console\.log/);
  const imported = /from"([^"]+)"/.exec(script)?.[1];
  if (imported) assert.match(await archive.file(imported.replace(/^\.\//, '')).async('string'), /independent-sdk/);
  else assert.match(script, /independent-sdk/);
});

test('rejects unsafe compressed archive paths and oversized expanded entries', async () => {
  const zip = new JSZip(); zip.file('../escape.js', 'boom');
  await assert.rejects(checkPluginPackage({ bytes: await zip.generateAsync({ type: 'nodebuffer' }) }), /path/i);
  const large = new JSZip(); large.file('large.txt', 'a'.repeat(10000));
  await assert.rejects(checkPluginPackage({ bytes: await large.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), limits: { maxUnpackedBytes: 10 } }), /limit/i);
});

test('rejects missing output entry and symlinked HTML assets', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.pluginRoot, 'index.html'), '<img src="./leak.svg"><script type="module" src="./main.ts"></script>');
  await fs.writeFile(path.join(f.root, 'host/private.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await fs.symlink(path.join(f.root, 'host/private.svg'), path.join(f.pluginRoot, 'leak.svg'));
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

test('honors cancellation and source/artifact resource limits without producing an archive', async t => {
  const f = await fixture(t);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(buildPluginPackage({ ...f, signal: controller.signal }), /cancel/i);
  await assert.rejects(buildPluginPackage({ ...f, limits: { maxSourceBytes: 8 } }), /limit/i);
  await assert.rejects(buildPluginPackage({ ...f, limits: { maxUnpackedBytes: 10 } }), /limit/i);
});


test('bundles a legal local alias and literal dynamic import', async t => {
  const f = await fixture(t, `import { label } from '@local/domain'; console.log(label); void import('./lazy').then(console.log);`);
  await fs.writeFile(path.join(f.pluginRoot, 'domain.ts'), `export const label = 'local-domain-value';`);
  await fs.writeFile(path.join(f.pluginRoot, 'lazy.ts'), `export const lazy = 'local-lazy-value';`);
  await fs.writeFile(path.join(f.pluginRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@local/*': ['./*'] } } }));
  const result = await buildPluginPackage(f);
  const zip = await JSZip.loadAsync(await fs.readFile(result.output));
  const scripts = await Promise.all(Object.values(zip.files).filter(file => file.name.endsWith('.js')).map(file => file.async('string')));
  assert.match(scripts.join(''), /local-domain-value/);
  assert.match(scripts.join(''), /local-lazy-value/);
});

test('rejects a declared dependency whose transitive source imports Tauri', async t => {
  const f = await fixture(t, `import 'tiny-lib';`);
  await fs.writeFile(path.join(f.pluginRoot, 'package.json'), JSON.stringify({ dependencies: { 'tiny-lib': '1.0.0' } }));
  const dir = path.join(f.pluginRoot, 'node_modules/tiny-lib'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'tiny-lib', main: 'index.js', dependencies: { '@tauri-apps/api': '2.0.0' } }));
  await fs.writeFile(path.join(dir, 'index.js'), `import { invoke } from '@tauri-apps/api/core'; void invoke('secret');`);
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

test('rejects a relative dependency import that bypasses declared dependencies', async t => {
  const f = await fixture(t, `import './node_modules/unlisted/index.js';`);
  const dir = path.join(f.pluginRoot, 'node_modules/unlisted'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'unlisted', main: 'index.js' }));
  await fs.writeFile(path.join(dir, 'index.js'), 'console.log(1);');
  await assert.rejects(buildPluginPackage(f), /undeclared/i);
});

for (const [kind, content] of [
  ['html', '<img src="../host/private.svg"><script type="module" src="./main.ts"></script>'],
  ['css', '@import "../host/private.css";'],
]) test(`rejects ${kind} asset resolution outside owned roots`, async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'host/private.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await fs.writeFile(path.join(f.root, 'host/private.css'), 'body {color: red}');
  if (kind === 'html') await fs.writeFile(path.join(f.pluginRoot, 'index.html'), content);
  else {
    await fs.writeFile(path.join(f.pluginRoot, 'main.ts'), `import './style.css';`);
    await fs.writeFile(path.join(f.pluginRoot, 'style.css'), content);
  }
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

test('rejects archives missing their root main entry', async () => {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ schemaVersion: 2, name: 'example.fixture', id: 'example.fixture',
    displayName: 'Fixture', description: 'Fixture', author: 'Test', version: '1.0.0', engines: { zero: '^0.2.0', api: '^1.0.0' },
    platforms: ['macos'], runtime: 'webview', main: 'index.html', permissions: [], contributes: { views: [{ id: 'example.fixture.main', title: 'Main', surface: 'main' }] }, activationEvents: ['onView:example.fixture.main'] }));
  await assert.rejects(checkPluginPackage({ bytes: await zip.generateAsync({ type: 'nodebuffer' }) }), /entry missing/i);
});

test('bundles declared React from the installed locked dependency without private source', async t => {
  const f = await fixture(t, `import React from 'react'; console.log(React.createElement('p', null, 'fixture-react'));`);
  await fs.writeFile(path.join(f.pluginRoot, 'package.json'), JSON.stringify({ dependencies: { react: '19.2.4' } }));
  await fs.mkdir(path.join(f.pluginRoot, 'node_modules'));
  const react = await fs.realpath(new URL('../../../node_modules/react', import.meta.url));
  await fs.symlink(react, path.join(f.pluginRoot, 'node_modules/react'));
  const result = await buildPluginPackage(f);
  const zip = await JSZip.loadAsync(await fs.readFile(result.output));
  const scripts = await Promise.all(Object.values(zip.files).filter(file => file.name.endsWith('.js')).map(file => file.async('string')));
  assert.match(scripts.join(''), /fixture-react/);
  assert.match(scripts.join(''), /createElement/);
});

test('uses a typed library runtime entry rather than bundling its declaration file', async t => {
  const f = await fixture(t, `import { value } from 'typed-lib'; console.log(value);`);
  await fs.writeFile(path.join(f.pluginRoot, 'package.json'), JSON.stringify({ dependencies: { 'typed-lib': '1.0.0' } }));
  const dir = path.join(f.pluginRoot, 'node_modules/typed-lib'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'typed-lib', version: '1.0.0', type: 'module', main: 'index.js', types: 'index.d.ts' }));
  await fs.writeFile(path.join(dir, 'index.d.ts'), 'export declare const value: string;');
  await fs.writeFile(path.join(dir, 'index.js'), `export const value = 'actual-typed-runtime';`);
  const result = await buildPluginPackage(f);
  const zip = await JSZip.loadAsync(await fs.readFile(result.output));
  const scripts = await Promise.all(Object.values(zip.files).filter(file => file.name.endsWith('.js')).map(file => file.async('string')));
  assert.match(scripts.join(''), /actual-typed-runtime/);
});

test('rejects new URL asset transformation that would read private host files', async t => {
  const f = await fixture(t, `const asset = new URL('../host/private.ts', import.meta.url); console.log(asset.href);`);
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

test('rejects a worker entry with a transitive peer import', async t => {
  const f = await fixture(t, `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });`);
  await fs.writeFile(path.join(f.pluginRoot, 'worker.ts'), `import { secret } from '../peer/private'; console.log(secret);`);
  await assert.rejects(buildPluginPackage(f), /boundary/i);
});

test('builds a fixture against the actual self-contained public SDK source root', async t => {
  const f = await fixture(t, `import { compareCapabilities } from '@zero/sdk'; console.log(compareCapabilities([], []));`);
  const result = await buildPluginPackage({ ...f, sdkRoot: await fs.realpath(new URL('../../../src/sdk', import.meta.url)) });
  assert.equal((await checkPluginPackage({ archivePath: result.output })).manifest.id, 'zero.fixture');
  assert.ok(result.sourceFiles.every(file => !file.includes('/src/core/')));
});

for (const [label, html] of [
  ['meta content', '<meta property="og:image" content="../peer/private.svg">'],
  ['link imagesrcset', '<link rel="preload" as="image" imagesrcset="../peer/private.svg 1x">'],
]) test(`rejects ${label} before Vite can embed peer asset bytes`, async t => {
  const f = await fixture(t);
  const marker = 'PRIVATE-PEER-ARTIFACT-PAYLOAD';
  await fs.writeFile(path.join(f.root, 'peer/private.svg'), `<svg xmlns="http://www.w3.org/2000/svg"><text>${marker}</text></svg>`);
  await fs.writeFile(path.join(f.pluginRoot, 'index.html'), `${html}<script type="module" src="./main.ts"></script>`);
  let result;
  try { result = await buildPluginPackage(f); }
  catch (error) { assert.match(error.message, /boundary/i); return; }
  const zip = await JSZip.loadAsync(await fs.readFile(result.output));
  const artifacts = await Promise.all(Object.values(zip.files).filter(entry => !entry.dir).map(entry => entry.async('string')));
  assert.equal(artifacts.join('').includes(marker), false,
    `${label} copied private peer bytes into the compressed archive (sourceFiles records peer: ${result.sourceFiles.some(file => file.includes('/peer/'))})`);
  assert.fail(`${label} must reject before artifact publication`);
});

test('rejects peer paths across the complete locked Vite HTML asset-source matrix', async t => {
  const references = [
    '<audio src="VALUE"></audio>', '<embed src="VALUE">', '<img src="VALUE">', '<img srcset="VALUE 1x">',
    '<svg><image href="VALUE"></image></svg>', '<svg><image xlink:href="VALUE"></image></svg>',
    '<input src="VALUE">', '<link href="VALUE">', '<link imagesrcset="VALUE 1x">', '<object data="VALUE"></object>',
    '<source src="VALUE">', '<source srcset="VALUE 1x">', '<track src="VALUE">',
    '<svg><use href="VALUE"></use></svg>', '<svg><use xlink:href="VALUE"></use></svg>',
    '<video src="VALUE"></video>', '<video poster="VALUE"></video>',
    ...['msapplication-tileimage', 'msapplication-square70x70logo', 'msapplication-square150x150logo',
      'msapplication-wide310x150logo', 'msapplication-square310x310logo', 'msapplication-config', 'twitter:image']
      .map(name => `<meta name="${name}" content="VALUE">`),
    ...['og:image', 'og:image:url', 'og:image:secure_url', 'og:audio', 'og:audio:secure_url', 'og:video', 'og:video:secure_url']
      .map(property => `<meta property="${property}" content="VALUE">`),
    '<template><meta property="og:image" content="VALUE"></template>',
    '<img style="background: &#117;rl(VALUE)">',
  ];
  for (const reference of references) await t.test(reference, async inner => {
    const f = await fixture(inner);
    await fs.writeFile(path.join(f.root, 'peer/private.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>PRIVATE-PEER</text></svg>');
    await fs.writeFile(path.join(f.pluginRoot, 'index.html'), `${reference.replace('VALUE', '../peer/private.svg')}<script type="module" src="./main.ts"></script>`);
    await assert.rejects(buildPluginPackage(f), /boundary/i);
    await assert.rejects(fs.stat(f.outputDir), { code: 'ENOENT' });
  });
});

test('keeps non-asset metadata and ordinary local HTML assets buildable', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.pluginRoot, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>OWNED-ICON</text></svg>');
  await fs.writeFile(path.join(f.pluginRoot, 'index.html'), '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="A tool"><img src="./icon.svg"><script type="module" src="./main.ts"></script>');
  const result = await buildPluginPackage(f);
  const zip = await JSZip.loadAsync(await fs.readFile(result.output));
  const artifacts = await Promise.all(Object.values(zip.files).filter(entry => !entry.dir).map(entry => entry.async('string')));
  assert.match(artifacts.join(''), /OWNED-ICON/);
  assert.ok(result.sourceFiles.includes(await fs.realpath(path.join(f.pluginRoot, 'icon.svg'))));
});
