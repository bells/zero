import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPrivateKey, createPublicKey, createHash, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';

// Publicly known synthetic seed, used only in temporary test workspaces.
const syntheticKey = seed => createPrivateKey({ key: Buffer.concat([
  Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, seed),
]), format: 'der', type: 'pkcs8' });
const key = syntheticKey(42);
const publicKey = createPublicKey(key).export({ format: 'jwk' }).x;
const config = () => ({ schemaVersion: 1, publishers: [{ keyId: 'synthetic-only',
  publicKey: Buffer.from(publicKey, 'base64url').toString('base64'), allowedPluginIds: ['zero.fixture'] }] });
const cli = (...args) => spawnSync(process.execPath, ['scripts/plugin-packages/sign.mjs', ...args], { encoding: 'utf8' });

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-publisher-synthetic-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifest = { schemaVersion: 2, name: 'zero.fixture', id: 'zero.fixture', displayName: 'Synthetic fixture',
    description: 'Not a release', author: 'Test', version: '1.2.3', engines: { zero: '>=0.2.0 <0.3.0', api: '^1.0.0' },
    platforms: ['macos'], runtime: 'webview', main: 'index.html', permissions: [],
    contributes: { views: [{ id: 'zero.fixture.main', title: 'Fixture', surface: 'main' }] },
    activationEvents: ['onView:zero.fixture.main'] };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest)); zip.file('index.html', '<p>Synthetic fixture only</p>');
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const archivePath = path.join(root, 'fixture.zplugin');
  const trustConfigFile = path.join(root, 'public-trust.json');
  const privateKeyFile = path.join(root, 'synthetic-private.pem');
  await fs.writeFile(archivePath, bytes);
  await fs.writeFile(trustConfigFile, JSON.stringify(config()));
  await fs.writeFile(privateKeyFile, key.export({ format: 'pem', type: 'pkcs8' }));
  return { root, bytes, manifest, archivePath, trustConfigFile, privateKeyFile, keyId: 'synthetic-only' };
}
const api = () => import('../../../scripts/plugin-packages/publisher.mjs');

test('CLI signs the measured archive and verifies the public sidecar without revealing a private key', async t => {
  const f = await fixture(t);
  const result = cli('sign', f.archivePath, '--key-id', f.keyId, '--private-key-file', f.privateKeyFile, '--trust-config', f.trustConfigFile);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.publisherVerified, true); assert.equal(output.releaseApproved, false);
  const envelope = JSON.parse(await fs.readFile(`${f.archivePath}.signature.json`, 'utf8'));
  assert.equal(envelope.pluginId, f.manifest.id);
  assert.equal(envelope.pluginVersion, '1.2.3');
  assert.equal(envelope.sha256, createHash('sha256').update(f.bytes).digest('hex'));
  assert.deepEqual(Object.keys(envelope).sort(), ['schemaVersion', 'keyId', 'pluginId', 'pluginVersion', 'sha256', 'signature'].sort());
  assert.equal(envelope.signature.length, 88);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE KEY|302e0201/);
  assert.equal(cli('verify', f.archivePath, '--trust-config', f.trustConfigFile).status, 0);
});

test('default empty host trust refuses a synthetic signer and creates no sidecar', async t => {
  const f = await fixture(t);
  const result = cli('sign', f.archivePath, '--key-id', f.keyId, '--private-key-file', f.privateKeyFile);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /trusted/i);
  await assert.rejects(fs.stat(`${f.archivePath}.signature.json`), { code: 'ENOENT' });
});

test('signing refuses an unauthorized exact ID or a different private key', async t => {
  const f = await fixture(t); const { signPluginPackage } = await api();
  const bad = config(); bad.publishers[0].allowedPluginIds = ['zero.fixture.extra'];
  await fs.writeFile(f.trustConfigFile, JSON.stringify(bad));
  await assert.rejects(signPluginPackage(f), /authorized|exact/i);
  await fs.writeFile(f.trustConfigFile, JSON.stringify(config()));
  await fs.writeFile(f.privateKeyFile, syntheticKey(43).export({ format: 'pem', type: 'pkcs8' }));
  await assert.rejects(signPluginPackage(f), /match|key/i);
  await assert.rejects(fs.stat(`${f.archivePath}.signature.json`), { code: 'ENOENT' });
});

test('public verification binds the signed envelope to actual archive identity, version and bytes', async t => {
  const f = await fixture(t); const { signPluginPackage, verifyPluginPackage } = await api();
  await signPluginPackage(f);
  const sidecar = `${f.archivePath}.signature.json`;
  const good = JSON.parse(await fs.readFile(sidecar, 'utf8'));
  for (const changes of [{ pluginId: 'zero.other' }, { pluginVersion: '1.2.4' }, { sha256: 'ab'.repeat(32) },
    { keyId: 'unknown' }, { signature: Buffer.alloc(64).toString('base64') }, { schemaVersion: 2 },
    { signature: good.signature.slice(0, -1) }, { extra: true }, { sha256: good.sha256.toUpperCase() }]) {
    await fs.writeFile(sidecar, JSON.stringify({ ...good, ...changes }));
    await assert.rejects(verifyPluginPackage(f));
  }
  await fs.writeFile(sidecar, JSON.stringify(good));
  const zip = await JSZip.loadAsync(f.bytes); zip.file('index.html', '<p>Changed archive</p>');
  await fs.writeFile(f.archivePath, await zip.generateAsync({ type: 'nodebuffer' }));
  await assert.rejects(verifyPluginPackage(f), /match|digest/i);
});

test('signing only publishes an identical sidecar idempotently and preserves conflicting files or symlinks', async t => {
  const f = await fixture(t); const { signPluginPackage } = await api();
  await signPluginPackage(f); const sidecar = `${f.archivePath}.signature.json`;
  const original = await fs.readFile(sidecar);
  await signPluginPackage(f); assert.deepEqual(await fs.readFile(sidecar), original);
  await fs.writeFile(sidecar, 'existing owner data');
  await assert.rejects(signPluginPackage(f), /conflict|exist/i);
  assert.equal(await fs.readFile(sidecar, 'utf8'), 'existing owner data');
  await fs.unlink(sidecar); const target = path.join(f.root, 'unrelated'); await fs.writeFile(target, original);
  await fs.symlink(target, sidecar);
  await assert.rejects(signPluginPackage(f), /symlink|exist|conflict/i);
  assert.deepEqual(await fs.readFile(target), original);
});

test('rejects unsafe or malformed public trust before any sidecar is created', async t => {
  const f = await fixture(t); const { signPluginPackage } = await api();
  const changes = [c => c.schemaVersion = 2, c => c.extra = true,
    c => c.publishers.push(c.publishers[0]), c => c.publishers[0].allowedPluginIds.push('zero.fixture'),
    c => c.publishers[0].allowedPluginIds = ['zero.*'], c => c.publishers[0].privateKey = 'not authority',
    c => c.publishers[0].keyId = 'key/invalid', c => c.publishers[0].publicKey += '\n',
    c => c.publishers[0].publicKey = Buffer.alloc(32).toString('base64'),
    c => c.publishers[0].publicKey = Buffer.alloc(31).toString('base64')];
  for (const change of changes) {
    const value = config(); change(value); await fs.writeFile(f.trustConfigFile, JSON.stringify(value));
    await assert.rejects(signPluginPackage(f));
  }
  await fs.writeFile(f.trustConfigFile, JSON.stringify(config()).replace('{', '{"schemaVersion":1,'));
  await assert.rejects(signPluginPackage(f), /duplicate|configuration/i);
  await assert.rejects(fs.stat(`${f.archivePath}.signature.json`), { code: 'ENOENT' });
});

test('bounded reads and package validation reject oversized files, invalid archives, and public keys as private keys', async t => {
  const f = await fixture(t); const { signPluginPackage } = await api();
  await fs.writeFile(f.privateKeyFile, createPublicKey(key).export({ format: 'pem', type: 'spki' }));
  await assert.rejects(signPluginPackage(f), /private|key/i);
  await fs.writeFile(f.privateKeyFile, key.export({ format: 'pem', type: 'pkcs8' }));
  await fs.truncate(f.archivePath, 16 * 1024 * 1024 + 1);
  await assert.rejects(signPluginPackage(f), /limit|large/i);
  await fs.writeFile(f.archivePath, 'not a ZIP'); await assert.rejects(signPluginPackage(f));
  await fs.writeFile(f.archivePath, f.bytes);
  await fs.truncate(f.privateKeyFile, 16 * 1024 + 1);
  await assert.rejects(signPluginPackage(f), /limit|large/i);
  await assert.rejects(fs.stat(`${f.archivePath}.signature.json`), { code: 'ENOENT' });
});

test('CLI rejects missing, duplicate, unknown, and misleading authority options without writing output', async t => {
  const f = await fixture(t);
  for (const args of [[], ['sign', f.archivePath], ['verify'], ['wat', f.archivePath],
    ['sign', f.archivePath, '--public-key', 'override'], ['verify', f.archivePath, '--trust-config', f.trustConfigFile, '--trust-config', f.trustConfigFile],
    ['sign', f.archivePath, '--key-id', f.keyId, '--private-key-file'], ['verify', f.archivePath, '--sha256', 'ab'.repeat(32)]]) {
    const result = cli(...args); assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /BEGIN PRIVATE KEY/);
  }
  await assert.rejects(fs.stat(`${f.archivePath}.signature.json`), { code: 'ENOENT' });
});

test('Node consumes the fixed shared public Rust wire fixture', async () => {
  const { officialPackageSignaturePayload, verifyPluginPackage } = await api();
  const shared = JSON.parse(await fs.readFile(new URL('../../fixtures/plugin-publisher/wire-v1.json', import.meta.url), 'utf8'));
  assert.equal(officialPackageSignaturePayload(shared.envelope).toString('hex'), shared.payloadHex);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-public-wire-'));
  try {
    const archivePath = path.join(root, 'public.zplugin'); const trustConfigFile = path.join(root, 'trust.json');
    await fs.writeFile(archivePath, Buffer.from(shared.archiveBase64, 'base64'));
    await fs.writeFile(`${archivePath}.signature.json`, JSON.stringify(shared.envelope));
    await fs.writeFile(trustConfigFile, JSON.stringify(shared.trust));
    assert.equal((await verifyPluginPackage({ archivePath, trustConfigFile })).publisherVerified, true);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


test('rejects another key algorithm even when the PEM is valid', async t => {
  const f = await fixture(t); const { signPluginPackage } = await api();
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
  await fs.writeFile(f.privateKeyFile, ec.export({ format: 'pem', type: 'pkcs8' }));
  await assert.rejects(signPluginPackage(f), /Ed25519/);
  await assert.rejects(fs.stat(`${f.archivePath}.signature.json`), { code: 'ENOENT' });
});

test('public verification refuses duplicate JSON, oversized metadata and a replacement trusted key', async t => {
  const f = await fixture(t); const { signPluginPackage, verifyPluginPackage } = await api();
  await signPluginPackage(f); const sidecar = `${f.archivePath}.signature.json`;
  const original = await fs.readFile(sidecar, 'utf8');
  await fs.writeFile(sidecar, original.replace('{', '{"schemaVersion":1,'));
  await assert.rejects(verifyPluginPackage(f), /duplicate/);
  await fs.writeFile(sidecar, ' '.repeat(16 * 1024 + 1));
  await assert.rejects(verifyPluginPackage(f), /limit/);
  await fs.writeFile(sidecar, original);
  const replacement = config(); replacement.publishers[0].publicKey =
    Buffer.from(createPublicKey(syntheticKey(43)).export({ format: 'jwk' }).x, 'base64url').toString('base64');
  await fs.writeFile(f.trustConfigFile, JSON.stringify(replacement));
  await assert.rejects(verifyPluginPackage(f), /signature/);
  await fs.writeFile(f.trustConfigFile, ' '.repeat(16 * 1024 + 1));
  await assert.rejects(verifyPluginPackage(f), /limit/);
});

test('payload refuses noncanonical identity, version, schema and digest before signing', async () => {
  const { officialPackageSignaturePayload } = await api();
  const shared = JSON.parse(await fs.readFile(new URL('../../fixtures/plugin-publisher/wire-v1.json', import.meta.url), 'utf8'));
  for (const changes of [{ pluginId: '../zero.fixture' }, { pluginId: 'Zero.fixture' }, { keyId: 'key/one' },
    { pluginVersion: 'v1.2.3' }, { pluginVersion: '1.2.3\n' }, { pluginVersion: '01.2.3' },
    { pluginVersion: '9007199254740992.0.0' }, { schemaVersion: '1' }, { sha256: 'gg'.repeat(32) }]) {
    assert.throws(() => officialPackageSignaturePayload({ ...shared.envelope, ...changes }));
  }
});

test('public verification follows Rust strict rejection of a cryptographically matching small-order R', async t => {
  const f = await fixture(t); const { verifyPluginPackage } = await api();
  const shared = JSON.parse(await fs.readFile(new URL('../../fixtures/plugin-publisher/wire-v1.json', import.meta.url), 'utf8'));
  await fs.writeFile(f.archivePath, Buffer.from(shared.archiveBase64, 'base64'));
  await fs.writeFile(`${f.archivePath}.signature.json`, JSON.stringify({ ...shared.envelope, signature: shared.weakRSignature }));
  await assert.rejects(verifyPluginPackage(f), /weak|signature/i);
});

test('signs an actual independently built source archive through the existing package builder', async t => {
  const f = await fixture(t); const { signPluginPackage, verifyPluginPackage } = await api();
  const { buildPluginPackage } = await import('../../../scripts/plugin-packages/build.mjs');
  const pluginRoot = path.join(f.root, 'tool'); const sdkRoot = path.join(f.root, 'sdk');
  await fs.mkdir(pluginRoot); await fs.mkdir(sdkRoot);
  await fs.writeFile(path.join(pluginRoot, 'manifest.json'), JSON.stringify(f.manifest));
  await fs.writeFile(path.join(pluginRoot, 'package.json'), JSON.stringify({ name: 'synthetic-only', type: 'module', dependencies: {} }));
  await fs.writeFile(path.join(pluginRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  await fs.writeFile(path.join(pluginRoot, 'index.html'), '<script type="module" src="./main.ts"></script>');
  await fs.writeFile(path.join(pluginRoot, 'main.ts'), `import { label } from '@zero/sdk'; document.body.textContent = label;`);
  await fs.writeFile(path.join(sdkRoot, 'package.json'), JSON.stringify({ name: '@zero/sdk', type: 'module', dependencies: {} }));
  await fs.writeFile(path.join(sdkRoot, 'index.ts'), `export const label = 'independently-built-synthetic-fixture';`);
  const built = await buildPluginPackage({ pluginRoot, sdkRoot, outputDir: path.join(f.root, 'built') });
  const signed = await signPluginPackage({ ...f, archivePath: built.output });
  assert.equal(signed.envelope.sha256, built.sha256);
  assert.equal((await verifyPluginPackage({ ...f, archivePath: built.output })).publisherVerified, true);
});
