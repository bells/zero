#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import { build } from 'vite';
import JSZip from 'jszip';
import { validateWebManifest } from '../lib/plugin-protocol.mjs';
import { inspectHtmlAssets } from './html-assets.mjs';

const DEFAULT_LIMITS = Object.freeze({ maxFiles: 1024, maxSourceBytes: 32 * 1024 * 1024,
  maxUnpackedBytes: 32 * 1024 * 1024, maxArchiveBytes: 16 * 1024 * 1024, timeoutMs: 60_000 });
const SDK_NAME = '@zero/sdk';
const inside = (root, target) => target === root || (!path.relative(root, target).startsWith(`..${path.sep}`)
  && path.relative(root, target) !== '..' && !path.isAbsolute(path.relative(root, target)));
function safePath(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    && !/[\\\0:%?#]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
}
function bounded(options) {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0 || value > DEFAULT_LIMITS[key]) {
    throw new Error(`Invalid resource limit: ${key}`);
  }
  const deadline = Date.now() + limits.timeoutMs;
  const check = () => {
    if (options.signal?.aborted) throw new Error('Package operation cancelled');
    if (Date.now() >= deadline) throw new Error('Package deadline limit exceeded');
  };
  check();
  return { limits, check };
}
function manifestIssues(manifest) {
  const issues = validateWebManifest(manifest).filter(issue => !(manifest?.name === manifest?.id
    && manifest.id.startsWith('zero.') && issue.path === 'id' && issue.message === 'Invalid or reserved identity'));
  if (issues.length) throw new Error(`Invalid manifest: ${JSON.stringify(issues)}`);
  if (!safePath(manifest.main) || !manifest.main.endsWith('.html')) throw new Error('Unsafe main entry path');
  if (manifest.background && (!safePath(manifest.background.main) || !manifest.background.main.endsWith('.js'))) {
    throw new Error('Unsafe background entry path; expected package-relative .js');
  }
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function cleanId(id) { return id.split('?')[0]; }
function packageName(id) { return id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]; }
function isBare(id) { return !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('\0'); }

// Each resolution is checked at its real path, including type-only and tree-shaken imports.
function sourceBoundary({ pluginRoot, sdkRoot, limits, check }) {
  const roots = [pluginRoot, sdkRoot];
  const packages = new Map();
  const visited = new Set();
  let sourceBytes = 0;
  const rootPackages = roots.map(root => readJson(path.join(root, 'package.json')));
  function owner(file) {
    if (file.split(path.sep).includes('node_modules')) {
      let dir = path.dirname(file);
      while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
          if (!packages.has(dir)) packages.set(dir, readJson(path.join(dir, 'package.json')));
          return { root: dir, manifest: packages.get(dir), dependency: true };
        }
        dir = path.dirname(dir);
      }
    }
    const index = roots.findIndex(root => inside(root, file));
    return index < 0 ? undefined : { root: roots[index], manifest: rootPackages[index], dependency: false };
  }
  function allowed(file) {
    check();
    const real = fs.realpathSync(cleanId(file));
    const current = owner(real);
    if (!current || current.manifest.name?.startsWith('@tauri-apps/')) throw new Error(`Source boundary violation: ${file}`);
    return real;
  }
  function compilerOptions(root) {
    const configFile = path.join(root, 'tsconfig.json');
    if (!fs.existsSync(configFile)) return { moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, resolveJsonModule: true };
    const config = ts.readConfigFile(configFile, ts.sys.readFile);
    if (config.error) throw new Error(`Invalid tsconfig in ${root}`);
    // Loading inherited host configs would itself violate independent-source ownership.
    if (config.config.extends) throw new Error('Source boundary: inherited tsconfig is unsupported; declare local compiler options');
    const result = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    return { ...result.options, moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, resolveJsonModule: true };
  }
  const configs = roots.map(compilerOptions);
  function resolve(specifier, importer, exact = false) {
    check();
    if (specifier.startsWith('@tauri-apps/') || /^(?:node:|https?:|file:|data:|\/\/)/i.test(specifier)) {
      throw new Error(`Private/native source boundary: ${specifier}`);
    }
    if (specifier === SDK_NAME || specifier.startsWith(`${SDK_NAME}/`)) {
      const relative = specifier === SDK_NAME ? 'index.ts' : specifier.slice(SDK_NAME.length + 1);
      if (!safePath(relative)) throw new Error(`SDK source boundary: ${specifier}`);
      const target = path.join(sdkRoot, relative);
      const resolved = ts.resolveModuleName(target, importer, configs[1], ts.sys).resolvedModule?.resolvedFileName
        ?? (fs.existsSync(target) ? target : undefined);
      if (!resolved || !inside(sdkRoot, allowed(resolved))) throw new Error(`SDK source boundary: ${specifier}`);
      return resolved;
    }
    const current = owner(allowed(importer));
    const config = configs[inside(sdkRoot, importer) ? 1 : 0];
    const resolved = ts.resolveModuleName(specifier, importer, config, ts.sys).resolvedModule?.resolvedFileName;
    // A TS paths alias must still resolve within this owner's source or a declared library.
    if (isBare(specifier)) {
      const name = packageName(specifier);
      const aliasedLocal = resolved && inside(current.root, fs.realpathSync(resolved))
        && !fs.realpathSync(resolved).split(path.sep).includes('node_modules');
      if (!aliasedLocal && !(name in (current.manifest.dependencies ?? {}))
        && !(name in (current.manifest.peerDependencies ?? {}))
        && !(/\.d\.[cm]?ts$/.test(resolved ?? '') && name in (current.manifest.devDependencies ?? {}))) {
        throw new Error(`Undeclared dependency source boundary: ${specifier}`);
      }
    }
    let target = exact && path.isAbsolute(specifier) && fs.existsSync(specifier) ? specifier : resolved;
    if (!target && (specifier.startsWith('.') || path.isAbsolute(specifier))) {
      const candidate = path.resolve(path.dirname(importer), specifier);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) target = candidate;
    }
    if (!target) throw new Error(`Unresolved source boundary import: ${specifier} in ${importer}`);
    const real = allowed(target);
    const targetOwner = owner(real);
    if (targetOwner.dependency && targetOwner.root !== current.root
      && !(targetOwner.manifest.name in (current.manifest.dependencies ?? {}))
      && !(targetOwner.manifest.name in (current.manifest.peerDependencies ?? {}))
      && !(/\.d\.[cm]?ts$/.test(real) && targetOwner.manifest.name in (current.manifest.devDependencies ?? {}))) {
      throw new Error(`Undeclared dependency source boundary: ${specifier}`);
    }
    if (!current.dependency && !inside(current.root, real) && !inside(sdkRoot, real)
      && !real.split(path.sep).includes('node_modules')) throw new Error(`Source boundary violation: ${specifier}`);
    if (current.dependency && !inside(current.root, real) && !real.split(path.sep).includes('node_modules')) {
      throw new Error(`Transitive source boundary violation: ${specifier}`);
    }
    return real;
  }
  function assetPath(value, file) {
    const specifier = value.trim();
    if (specifier.startsWith('#')) return;
    if (!specifier || /[\\&%?#]/.test(specifier) || /^(?:[a-z]+:|\/)/i.test(specifier)) {
      throw new Error(`Asset source boundary: unsupported nonlocal/encoded path in ${file}`);
    }
    visit(resolve(specifier.startsWith('.') ? specifier : `./${specifier}`, file));
  }
  function inspectAssets(real, text) {
    // Vite reads HTML/CSS URLs without passing each file through Rollup's loader.
    // HTML uses the locked Vite parser/asset registry; CSS syntax remains deliberately narrow.
    if (/\\/.test(text)) throw new Error(`Asset source boundary: escaped HTML/CSS paths are unsupported in ${real}`);
    if (/\.html$/.test(real)) {
      inspectHtmlAssets(text, { assetPath: value => assetPath(value, real), inlineStyle: value => inspectCssAssets(real, value) });
    }
    inspectCssAssets(real, text);
  }
  function inspectCssAssets(real, text) {
    for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
      assetPath(match[1] ?? match[2] ?? match[3], real);
    }
    for (const match of text.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) assetPath(match[1] ?? match[2], real);
  }
  function visit(file) {
    const real = allowed(file);
    if (visited.has(real)) return;
    visited.add(real);
    if (visited.size > limits.maxFiles) throw new Error('Source file count limit exceeded');
    sourceBytes += fs.statSync(real).size;
    if (sourceBytes > limits.maxSourceBytes) throw new Error('Source byte limit exceeded');
    if (/\.(?:html|css)$/.test(real)) { inspectAssets(real, fs.readFileSync(real, 'utf8')); return; }
    if (!/\.[cm]?[jt]sx?$/.test(real)) return;
    const source = ts.createSourceFile(real, fs.readFileSync(real, 'utf8'), ts.ScriptTarget.Latest, true);
    function inspect(node) {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) specifier = node.moduleSpecifier;
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) specifier = node.moduleReference.expression;
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL'
        && node.arguments?.[1]?.getText(source) === 'import.meta.url') {
        if (!ts.isStringLiteralLike(node.arguments[0])) throw new Error('Dynamic URL asset source boundary violation');
        assetPath(node.arguments[0].text, real);
      }
      if (ts.isCallExpression(node)) {
        const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const require = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        if (dynamic || require) {
          if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) throw new Error('Computed dynamic import/require source boundary violation');
          if (require && !owner(real).dependency) throw new Error('Private require source boundary violation; use static ESM imports');
          specifier = node.arguments[0];
        }
        if (ts.isPropertyAccessExpression(node.expression) && ts.isMetaProperty(node.expression.expression)
          && ['glob', 'globEager'].includes(node.expression.name.text)) {
          throw new Error('Dynamic glob source boundary violation; use explicit imports');
        }
      }
      if (specifier) {
        if (!ts.isStringLiteralLike(specifier)) throw new Error('Dynamic module source boundary violation');
        visit(resolve(specifier.text, real));
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  function walkSource(root) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      check();
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const file = path.join(root, entry.name);
      if (entry.isDirectory()) walkSource(file);
      else visit(file);
    }
  }
  roots.forEach(walkSource);
  return { visit, resolve, allowed, files: visited };
}

function readZipEntry(entry, budget, check) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const stream = entry.internalStream('nodebuffer');
    stream.on('data', chunk => {
      try {
        check(); total += chunk.length;
        if (total > budget) throw new Error('Expanded archive byte limit exceeded');
        chunks.push(chunk);
      } catch (error) { stream.pause(); reject(error); }
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks, total)));
    stream.resume();
  });
}

/** Structural archive inspection only; never grants publisher trust or runtime approval. */
export async function checkPluginPackage(options) {
  const { limits, check } = bounded(options);
  const bytes = options.bytes ?? await fsp.readFile(options.archivePath);
  if (bytes.length > limits.maxArchiveBytes) throw new Error('Compressed archive byte limit exceeded');
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > limits.maxFiles) throw new Error('Archive file count limit exceeded');
  const files = new Map();
  let expandedBytes = 0;
  for (const entry of entries) {
    check();
    const name = entry.dir ? entry.name.slice(0, -1) : entry.name;
    if (!safePath(name) || (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) throw new Error(`Unsafe archive path: ${entry.unsafeOriginalName ?? entry.name}`);
    if ((Number(entry.unixPermissions) & 0xf000) === 0xa000) throw new Error('Archive symlink path is forbidden');
    if (entry.dir) continue;
    if (entry._data.uncompressedSize > limits.maxUnpackedBytes - expandedBytes) throw new Error('Expanded archive byte limit exceeded');
    const data = await readZipEntry(entry, limits.maxUnpackedBytes - expandedBytes, check);
    expandedBytes += data.length;
    files.set(entry.name, data);
  }
  if (!files.has('manifest.json')) throw new Error('Root manifest.json is missing');
  const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
  manifestIssues(manifest);
  for (const entry of [manifest.main, manifest.background?.main].filter(Boolean)) {
    if (!files.has(entry)) throw new Error(`Manifest entry missing from archive: ${entry}`);
  }
  return { manifest, files: [...files.keys()], expandedBytes, archiveBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), publisherVerified: false, releaseApproved: false };
}

/** Build from one owned source root, explicit public SDK root and declared libraries. */
export async function buildPluginPackage(options) {
  const { limits, check } = bounded(options);
  const pluginRoot = await fsp.realpath(options.pluginRoot);
  const sdkRoot = await fsp.realpath(options.sdkRoot);
  if (inside(pluginRoot, sdkRoot) || inside(sdkRoot, pluginRoot)) throw new Error('Plugin and SDK source boundaries must be separate roots');
  const manifest = readJson(path.join(pluginRoot, 'manifest.json'));
  manifestIssues(manifest);
  if (!fs.existsSync(path.join(pluginRoot, 'pnpm-lock.yaml'))) throw new Error('Plugin pnpm-lock.yaml is required for independent locked dependencies');
  const boundary = sourceBoundary({ pluginRoot, sdkRoot, limits, check });
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'zero-plugin-build-'));
  const input = { main: path.join(pluginRoot, manifest.main) };
  if (manifest.background) input.background = path.join(pluginRoot, manifest.background.main);
  try {
    await build({
      configFile: false, envFile: false, root: pluginRoot, base: './', publicDir: false, logLevel: 'silent',
      css: { postcss: { plugins: [] } },
      plugins: [{
        name: 'zero-owned-source-boundary', enforce: 'pre',
        async resolveId(id, importer) {
          check();
          if (!importer || id.startsWith('\0') || id.startsWith('/@')) return null;
          const parent = cleanId(importer);
          if (!fs.existsSync(parent)) return null;
          if (id.startsWith('.') || isBare(id) || path.isAbsolute(id)) {
            let target = boundary.resolve(cleanId(id), parent);
            boundary.visit(target);
            if (/\.d\.[cm]?ts$/.test(target)) {
              const runtime = await this.resolve(id, importer, { skipSelf: true });
              if (!runtime || runtime.external) throw new Error(`Source boundary: missing library runtime for ${id}`);
              target = boundary.resolve(cleanId(runtime.id), parent, true);
              boundary.visit(target);
            }
            return target + (id.includes('?') ? `?${id.split('?').slice(1).join('?')}` : '');
          }
          return null;
        },
        load(id) {
          check();
          const file = cleanId(id);
          if (!id.startsWith('\0') && fs.existsSync(file)) boundary.visit(file);
          return null;
        },
        generateBundle(_options, bundle) {
          check();
          for (const artifact of Object.values(bundle)) {
            if (artifact.type === 'chunk') for (const file of Object.keys(artifact.modules)) {
              if (!file.startsWith('\0')) boundary.allowed(file);
            }
          }
        },
      }],
      build: { outDir: staging, emptyOutDir: true, target: 'es2020', sourcemap: false, assetsInlineLimit: 0, modulePreload: false,
        rollupOptions: { input, output: { entryFileNames(chunk) {
          return chunk.name === 'background' ? manifest.background.main : 'assets/[name]-[hash].js';
        } } } },
    });
    check();
    await fsp.writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const zip = new JSZip();
    let count = 0; let expanded = 0;
    async function collect(dir) {
      for (const entry of (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        check();
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { await collect(file); continue; }
        const name = path.relative(staging, file).split(path.sep).join('/');
        if (!entry.isFile() || !safePath(name)) throw new Error(`Unsafe output asset path: ${name}`);
        expanded += (await fsp.stat(file)).size;
        if (++count > limits.maxFiles || expanded > limits.maxUnpackedBytes) throw new Error('Output artifact resource limit exceeded');
        zip.file(name, await fsp.readFile(file), { date: new Date('2026-01-01T00:00:00Z'), createFolders: false, unixPermissions: 0o100644 });
      }
    }
    await collect(staging);
    const bytes = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE', compressionOptions: { level: 9 } }, check);
    const report = await checkPluginPackage({ bytes, limits, signal: options.signal });
    check();
    const outputDir = path.resolve(options.outputDir);
    await fsp.mkdir(outputDir, { recursive: true });
    const output = path.join(outputDir, `${manifest.id}-${manifest.version}.zplugin`);
    const pending = path.join(outputDir, `.${manifest.id}-${process.pid}-${randomUUID()}.tmp`);
    try { await fsp.writeFile(pending, bytes, { flag: 'wx' }); check(); await fsp.rename(pending, output); }
    finally { await fsp.rm(pending, { force: true }); }
    return { ...report, output, sourceFiles: [...boundary.files].sort() };
  } finally { await fsp.rm(staging, { recursive: true, force: true }); }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check' && args.length === 1) {
    console.log(JSON.stringify(await checkPluginPackage({ archivePath: path.resolve(args[0]) }), null, 2)); return;
  }
  if (command !== 'build' || args.length !== 3) throw new Error('Usage: node scripts/plugin-packages/build.mjs build <plugin-root> <sdk-root> <output-directory> | check <archive.zplugin>');
  const cancellation = new AbortController();
  process.once('SIGINT', () => cancellation.abort());
  const result = await buildPluginPackage({ pluginRoot: path.resolve(args[0]), sdkRoot: path.resolve(args[1]), outputDir: path.resolve(args[2]), signal: cancellation.signal });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
