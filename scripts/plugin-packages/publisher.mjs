import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createPublicKey, sign, verify, timingSafeEqual, randomUUID } from 'node:crypto';
import { valid } from 'semver';
import ts from 'typescript';
import { checkPluginPackage } from './build.mjs';

const DEFAULT_TRUST = fileURLToPath(new URL('../../src-tauri/plugin-publishers.json', import.meta.url));
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const ENVELOPE_FIELDS = ['schemaVersion', 'keyId', 'pluginId', 'pluginVersion', 'sha256', 'signature'];
const keyIdValid = value => typeof value === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(value);
const pluginIdValid = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{1,63}$/.test(value);

function exactFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    throw new Error('Malformed fields or unknown schema in publisher metadata');
  }
}

// JSON.parse discards duplicate object members, unlike the Rust serde contract.
// Use the existing TypeScript JSON AST to reject them before parsing authority.
function strictJson(bytes) {
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(source);
    const pending = [ts.parseJsonText('publisher.json', source)];
    while (pending.length) {
      const node = pending.pop();
      if (ts.isObjectLiteralExpression(node)) {
        const names = new Set();
        for (const property of node.properties) {
          const name = property.name?.text;
          if (names.has(name)) throw new Error('Duplicate publisher metadata field');
          names.add(name);
        }
      }
      ts.forEachChild(node, child => { pending.push(child); });
    }
    return value;
  } catch { throw new Error('Invalid or duplicate publisher metadata fields'); }
}

async function boundedFile(file, maxBytes) {
  if (typeof file !== 'string' || !file) throw new Error('An explicit file path is required');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Publisher input file byte limit exceeded or not a regular file');
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > maxBytes) throw new Error('Publisher input file byte limit exceeded');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

function base64Bytes(value, size) {
  if (typeof value !== 'string' || value.length !== Math.ceil(size / 3) * 4) throw new Error('Invalid canonical base64 publisher field');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== size || bytes.toString('base64') !== value) throw new Error('Invalid canonical base64 publisher field');
  return bytes;
}

function publicKeyObject(bytes) {
  // Reject small-order encodings before OpenSSL verification, including alternate
  // sign-bit encodings. The constants are the standard libsodium small-order list:
  // https://github.com/jedisct1/libsodium/blob/master/src/libsodium/crypto_core/ed25519/ref10/ed25519_ref10.c
  const y = Buffer.from(bytes); y[31] &= 0x7f;
  const smallOrder = [
    '00'.repeat(32), `01${'00'.repeat(31)}`,
    `ec${'ff'.repeat(30)}7f`, `ed${'ff'.repeat(30)}7f`, `ee${'ff'.repeat(30)}7f`,
    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  ];
  if (smallOrder.includes(y.toString('hex'))) throw new Error('Invalid weak publisher public key in trust configuration');
  return createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), bytes]), format: 'der', type: 'spki' });
}

async function trustedPublishers(trustConfigFile = DEFAULT_TRUST) {
  const config = strictJson(await boundedFile(trustConfigFile, MAX_METADATA_BYTES));
  exactFields(config, ['schemaVersion', 'publishers']);
  if (config.schemaVersion !== 1 || !Array.isArray(config.publishers) || config.publishers.length > 32) throw new Error('Invalid trust configuration schema');
  const keys = new Set();
  return config.publishers.map(publisher => {
    exactFields(publisher, ['keyId', 'publicKey', 'allowedPluginIds']);
    if (!keyIdValid(publisher.keyId) || keys.has(publisher.keyId) || !Array.isArray(publisher.allowedPluginIds)
      || publisher.allowedPluginIds.length < 1 || publisher.allowedPluginIds.length > 64) throw new Error('Invalid publisher trust configuration');
    keys.add(publisher.keyId);
    const ids = new Set();
    for (const id of publisher.allowedPluginIds) {
      if (!pluginIdValid(id) || !id.startsWith('zero.') || ids.has(id)) throw new Error('Invalid exact plugin ID in trust configuration');
      ids.add(id);
    }
    const bytes = base64Bytes(publisher.publicKey, 32);
    return { ...publisher, bytes, key: publicKeyObject(bytes) };
  });
}

/** Rust publisher.rs is the authority for this versioned, length-prefixed wire format. */
export function officialPackageSignaturePayload(envelope) {
  exactFields(envelope, ENVELOPE_FIELDS);
  if (envelope.schemaVersion !== 1) throw new Error('Unsupported publisher signature schema');
  if (!keyIdValid(envelope.keyId)) throw new Error('Invalid publisher key ID');
  if (!pluginIdValid(envelope.pluginId)) throw new Error('Invalid publisher plugin ID');
  if (typeof envelope.pluginVersion !== 'string' || envelope.pluginVersion.length > 256
    || !/^[0-9]/.test(envelope.pluginVersion) || envelope.pluginVersion.trim() !== envelope.pluginVersion || !valid(envelope.pluginVersion)) throw new Error('Invalid publisher SemVer');
  if (typeof envelope.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(envelope.sha256)) throw new Error('Invalid lowercase SHA-256 digest');
  const schema = Buffer.alloc(4); schema.writeUInt32BE(1);
  const parts = [Buffer.from('zero.official-plugin-package\0'), schema];
  for (const value of [envelope.keyId, envelope.pluginId, envelope.pluginVersion]) {
    const bytes = Buffer.from(value, 'utf8'); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    parts.push(size, bytes);
  }
  parts.push(Buffer.from(envelope.sha256, 'hex'));
  return Buffer.concat(parts);
}

async function measuredArchive(archivePath) {
  if (typeof archivePath !== 'string' || !archivePath.endsWith('.zplugin')) throw new Error('Select an explicit .zplugin archive');
  const bytes = await boundedFile(archivePath, MAX_ARCHIVE_BYTES);
  // Inspection and digest derive from this exact bounded snapshot, never a second path read.
  return checkPluginPackage({ bytes });
}

function authorizedPublisher(publishers, keyId, pluginId) {
  const publisher = publishers.find(entry => entry.keyId === keyId);
  if (!publisher) throw new Error('Publisher key is not trusted by the selected public configuration');
  if (!publisher.allowedPluginIds.includes(pluginId)) throw new Error('Publisher key is not authorized for this exact plugin ID');
  return publisher;
}

function verifyEnvelope(envelope, report, publishers) {
  const payload = officialPackageSignaturePayload(envelope);
  if (envelope.pluginId !== report.manifest.id || envelope.pluginVersion !== report.manifest.version || envelope.sha256 !== report.sha256) {
    throw new Error('Publisher signature does not match measured archive identity, version or digest');
  }
  const publisher = authorizedPublisher(publishers, envelope.keyId, report.manifest.id);
  if (!verify(null, payload, publisher.key, base64Bytes(envelope.signature, 64))) throw new Error('Invalid Ed25519 publisher signature');
}

async function publishSidecar(sidecarPath, content) {
  const staging = path.join(path.dirname(sidecarPath), `.publisher-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(staging, content, { flag: 'wx', mode: 0o644 });
    try { await fs.link(staging, sidecarPath); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await fs.lstat(sidecarPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Existing signature sidecar conflicts (symlink or non-file)');
      if (!(await boundedFile(sidecarPath, MAX_METADATA_BYTES)).equals(content)) throw new Error('Existing signature sidecar conflicts; refusing overwrite');
    }
  } finally { await fs.unlink(staging).catch(() => {}); }
}

/** Only an explicit future invocation reads a user-selected private key file. */
export async function signPluginPackage({ archivePath, keyId, privateKeyFile, trustConfigFile } = {}) {
  if (!keyIdValid(keyId) || typeof privateKeyFile !== 'string' || !privateKeyFile) throw new Error('Explicit keyId and privateKeyFile are required');
  const report = await measuredArchive(archivePath);
  const publishers = await trustedPublishers(trustConfigFile);
  const publisher = authorizedPublisher(publishers, keyId, report.manifest.id);
  let privateKey;
  let privateBytes;
  try {
    privateBytes = await boundedFile(privateKeyFile, MAX_METADATA_BYTES);
    privateKey = createPrivateKey(privateBytes);
  } catch { throw new Error('Cannot load private key: expected a bounded PEM private key file (16 KiB limit)'); }
  finally { privateBytes?.fill(0); }
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Private key algorithm must be Ed25519');
  const derived = Buffer.from(createPublicKey(privateKey).export({ format: 'jwk' }).x, 'base64url');
  if (!timingSafeEqual(derived, publisher.bytes)) throw new Error('Private key does not match trusted publisher public key');
  const envelope = { schemaVersion: 1, keyId, pluginId: report.manifest.id, pluginVersion: report.manifest.version, sha256: report.sha256, signature: '' };
  envelope.signature = sign(null, officialPackageSignaturePayload(envelope), privateKey).toString('base64');
  verifyEnvelope(envelope, report, publishers);
  const sidecarPath = `${archivePath}.signature.json`;
  await publishSidecar(sidecarPath, Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`));
  return { sidecarPath, envelope, archiveBytes: report.archiveBytes, publisherVerified: true, releaseApproved: false };
}

/** Public-only verification measures the archive again; no private key is needed. */
export async function verifyPluginPackage({ archivePath, trustConfigFile } = {}) {
  const report = await measuredArchive(archivePath);
  const publishers = await trustedPublishers(trustConfigFile);
  const sidecarPath = `${archivePath}.signature.json`;
  const envelope = strictJson(await boundedFile(sidecarPath, MAX_METADATA_BYTES));
  verifyEnvelope(envelope, report, publishers);
  return { sidecarPath, envelope, archiveBytes: report.archiveBytes, publisherVerified: true, releaseApproved: false };
}
