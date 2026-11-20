import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import {
  preparePreviewPublication, previewPublicationContext, publishPluginPreview,
} from '../../../scripts/plugin-packages/publish-preview.mjs';

const REPO = 'https://github.com/bells/zero';
const ENV = {
  GITHUB_REPOSITORY: 'bells/zero', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: '1'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
  ZERO_PLUGIN_PUBLISH_PREVIEW: 'true', ZERO_PLUGIN_PUBLISH_SELECTION: 'all',
};
const CONTEXT = previewPublicationContext(ENV);
const TOOLS = ['snap', 'awake', 'paper', 'launch', 'file'];
const releaseUrl = `${REPO}/releases/tag/${CONTEXT.tag}`;
const downloadUrl = name => `${REPO}/releases/download/${CONTEXT.tag}/${name}`;

async function fixture(t) {
  const downloads = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-preview-publish-'));
  t.after(() => fs.rm(downloads, { recursive: true, force: true }));
  const plugins = [];
  for (const tool of TOOLS) {
    const id = `example.${tool}`;
    const dir = path.join(downloads, `Zero-plugin-${tool}`, 'preview');
    const name = `${id}-0.1.0.zplugin`;
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      schemaVersion: 2, name: id, id, displayName: 'Preview', description: 'Synthetic',
      author: 'Test', version: '0.1.0', engines: { zero: '>=0.2.0 <0.3.0', api: '^1.0.0' },
      platforms: ['macos'], runtime: 'webview', main: 'index.html', permissions: ['ui.message'],
      contributes: { views: [{ id: `${id}.main`, title: 'Preview', surface: 'main' }] },
      activationEvents: [`onView:${id}.main`],
    }));
    zip.file('index.html', '<!doctype html><html><body>Preview</body></html>');
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), bytes);
    plugins.push({
      name: id, version: '0.1.0', author: 'Test', repository: REPO,
      releaseUrl, downloadUrl: downloadUrl(name),
      permissions: ['ui.message'],
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const indexPath = path.join(downloads, 'index.json');
  const saveIndex = () => fs.writeFile(indexPath, JSON.stringify({ schemaVersion: 1, plugins }));
  await saveIndex();
  const prepared = await preparePreviewPublication(downloads, indexPath, CONTEXT.tag);
  return { downloads, indexPath, saveIndex, plugins, ...prepared };
}

function mockGitHub(archives, { branchExists = false, badDigest = false, wrongTag = false } = {}) {
  const calls = [];
  const prior = '2'.repeat(40);
  const next = '3'.repeat(40);
  const releaseId = 1234;
  let draft = true;
  let created = false;
  const received = new Set();
  return {
    calls,
    request: async (method, endpoint, options = {}) => {
      calls.push({ method, endpoint, ...options });
      if (endpoint === '/git/ref/heads/main') return { object: { type: 'commit', sha: CONTEXT.commit } };
      if (endpoint === `/git/ref/tags/${CONTEXT.tag}`) {
        return draft ? null : { object: { type: 'commit', sha: wrongTag ? prior : CONTEXT.commit } };
      }
      if (endpoint === '/releases' && method === 'POST') {
        assert.equal(options.body.target_commitish, CONTEXT.commit);
        assert.equal(options.body.draft, true);
        assert.equal(options.body.prerelease, true);
        created = true;
        return { id: releaseId, tag_name: CONTEXT.tag, draft, prerelease: true };
      }
      if (endpoint.startsWith(`/releases/${releaseId}/assets?name=`)) {
        assert.ok(created && draft);
        assert.equal(options.upload, true);
        const name = new URLSearchParams(endpoint.split('?')[1]).get('name');
        const match = archives.find(archive => archive.name === name);
        assert.ok(match);
        assert.deepEqual(options.body, match.bytes);
        received.add(name);
        return {};
      }
      if (endpoint === `/releases/${releaseId}/assets?per_page=100`) {
        return archives.filter(archive => received.has(archive.name)).map(archive => ({
          name: archive.name, state: 'uploaded', size: archive.bytes.length,
          digest: `sha256:${badDigest ? '0'.repeat(64) : archive.sha256}`,
          browser_download_url: draft ? `${REPO}/releases/download/untagged-preview/${archive.name}` : archive.downloadUrl,
        }));
      }
      if (endpoint === `/releases/${releaseId}` && method === 'PATCH') {
        assert.equal(received.size, archives.length);
        assert.deepEqual(options.body, { draft: false, prerelease: true, make_latest: 'false' });
        draft = false;
        return { id: releaseId, tag_name: CONTEXT.tag, draft, prerelease: true };
      }
      if (endpoint === '/git/ref/heads/plugin-preview') {
        assert.equal(draft, false);
        return branchExists ? { object: { type: 'commit', sha: prior } } : null;
      }
      if (endpoint === `/git/commits/${branchExists ? prior : CONTEXT.commit}`) return { tree: { sha: 'tree' } };
      if (endpoint === '/git/trees') {
        assert.equal(options.body.base_tree, 'tree');
        assert.equal(options.body.tree.length, 1);
        assert.equal(options.body.tree[0].path, 'market.json');
        return { sha: 'new-tree' };
      }
      if (endpoint === '/git/commits') {
        assert.deepEqual(options.body.parents, [branchExists ? prior : CONTEXT.commit]);
        return { sha: next };
      }
      if (branchExists && endpoint === '/git/refs/heads/plugin-preview' && method === 'PATCH') {
        assert.deepEqual(options.body, { sha: next, force: false });
        return { object: { sha: next } };
      }
      if (!branchExists && endpoint === '/git/refs' && method === 'POST') {
        assert.deepEqual(options.body, { ref: 'refs/heads/plugin-preview', sha: next });
        return { object: { sha: next } };
      }
      assert.fail(`Unexpected request ${method} ${endpoint}`);
    },
  };
}

test('a preview publication requires one explicitly approved main all-tools dispatch', () => {
  assert.equal(CONTEXT.tag, 'plugin-preview-123-2');
  for (const override of [
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/plugin-preview' },
    { GITHUB_REPOSITORY: 'fork/zero' }, { ZERO_PLUGIN_PUBLISH_PREVIEW: 'false' },
    { ZERO_PLUGIN_PUBLISH_SELECTION: 'snap' }, { GITHUB_RUN_ID: '../../tag' },
  ]) {
    assert.throws(() => previewPublicationContext({ ...ENV, ...override }), /manual, explicitly enabled/);
  }
});

test('preview publication rejects wrong links and archives that disagree with the reviewed index', async t => {
  const prepared = await fixture(t);
  prepared.plugins[0].downloadUrl = 'https://github.com/fork/zero/releases/download/other/example.snap-0.1.0.zplugin';
  await prepared.saveIndex();
  await assert.rejects(preparePreviewPublication(prepared.downloads, prepared.indexPath, CONTEXT.tag), /download URL/);
  prepared.plugins[0].downloadUrl = downloadUrl('example.snap-0.1.0.zplugin');
  prepared.plugins[0].sha256 = '0'.repeat(64);
  await prepared.saveIndex();
  await assert.rejects(preparePreviewPublication(prepared.downloads, prepared.indexPath, CONTEXT.tag), /does not match the index/);
});

for (const branchExists of [false, true]) {
  test(`publishes verified assets before ${branchExists ? 'fast-forwarding' : 'creating'} the preview branch`, async t => {
    const { archives, indexBytes } = await fixture(t);
    const api = mockGitHub(archives, { branchExists });
    await publishPluginPreview({ ...CONTEXT, indexBytes, archives, request: api.request });
    const tree = api.calls.find(call => call.endpoint === '/git/trees');
    assert.equal(tree.body.tree[0].content, indexBytes.toString('utf8'));
    assert.equal(api.calls.at(-1).endpoint, branchExists ? '/git/refs/heads/plugin-preview' : '/git/refs');
    assert.notEqual(api.calls.at(-1).body.force, true);
  });
}

test('wrong release asset digests prevent public release and market index updates', async t => {
  const { archives, indexBytes } = await fixture(t);
  const api = mockGitHub(archives, { badDigest: true });
  await assert.rejects(publishPluginPreview({ ...CONTEXT, indexBytes, archives, request: api.request }), /draft assets/);
  assert.ok(!api.calls.some(call => call.method === 'PATCH'));
  assert.ok(!api.calls.some(call => call.endpoint === '/git/trees'));
});

test('an unexpected published tag target preserves the prior market index', async t => {
  const { archives, indexBytes } = await fixture(t);
  const api = mockGitHub(archives, { wrongTag: true });
  await assert.rejects(publishPluginPreview({ ...CONTEXT, indexBytes, archives, request: api.request }), /built main commit/);
  assert.ok(!api.calls.some(call => call.endpoint === '/git/trees'));
});
