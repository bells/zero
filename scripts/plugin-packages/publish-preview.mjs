import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validVersion } from '../lib/plugin-protocol.mjs';
import { checkPluginPackage } from './build.mjs';

const REPOSITORY = 'bells/zero';
const BRANCH = 'plugin-preview';
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const TOOLS = ['snap', 'awake', 'paper', 'launch', 'file'];
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_INDEX_BYTES = 128 * 1024;

export function previewPublicationContext(env) {
  const {
    GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: event, GITHUB_REF: ref,
    GITHUB_SHA: commit, GITHUB_RUN_ID: run, GITHUB_RUN_ATTEMPT: attempt,
    ZERO_PLUGIN_PUBLISH_PREVIEW: approved, ZERO_PLUGIN_PUBLISH_SELECTION: selected,
  } = env;
  if (repository !== REPOSITORY || event !== 'workflow_dispatch' || ref !== 'refs/heads/main'
    || approved !== 'true' || selected !== 'all'
    || !/^[0-9a-f]{40}$/.test(commit ?? '')
    || !/^[1-9][0-9]{0,19}$/.test(run ?? '') || !/^[1-9][0-9]{0,9}$/.test(attempt ?? '')) {
    throw new Error('Preview publication requires a manual, explicitly enabled all-tools build on bells/zero main');
  }
  return { commit, tag: `plugin-preview-${run}-${attempt}` };
}

async function readBounded(file, maxBytes) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) {
      throw new Error('Preview input is empty, oversized, or not a regular file');
    }
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== stat.size) throw new Error('Preview input changed while reading');
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

export async function preparePreviewPublication(downloadsRoot, indexPath, tag) {
  const indexBytes = await readBounded(indexPath, MAX_INDEX_BYTES);
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (index.schemaVersion !== 1 || !Array.isArray(index.plugins) || index.plugins.length !== TOOLS.length) {
    throw new Error('The preview index must contain exactly five plugins');
  }
  const releaseUrl = `${REPOSITORY_URL}/releases/tag/${tag}`;
  const archives = [];
  for (const tool of TOOLS) {
    const id = `example.${tool}`;
    const entry = index.plugins.find(item => item?.name === id);
    if (!entry || !validVersion(entry.version) || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')
      || entry.publisherSignature !== undefined || entry.repository !== REPOSITORY_URL || entry.releaseUrl !== releaseUrl) {
      throw new Error(`Invalid preview market entry for ${id}`);
    }
    const name = `${id}-${entry.version}.zplugin`;
    const downloadUrl = `${REPOSITORY_URL}/releases/download/${tag}/${encodeURIComponent(name)}`;
    if (entry.downloadUrl !== downloadUrl) throw new Error(`Unexpected preview download URL for ${id}`);
    const bytes = await readBounded(path.join(downloadsRoot, `Zero-plugin-${tool}`, 'preview', name), MAX_ARCHIVE_BYTES);
    const report = await checkPluginPackage({ bytes });
    if (report.manifest.id !== id || report.manifest.version !== entry.version || report.sha256 !== entry.sha256
      || report.manifest.author !== entry.author || !samePermissions(report.manifest.permissions, entry.permissions)) {
      throw new Error(`Preview archive does not match the index for ${id}`);
    }
    archives.push({ name, bytes, sha256: report.sha256, downloadUrl });
  }
  return { archives, indexBytes };
}

function samePermissions(actual, indexed) {
  if (!Array.isArray(indexed) || indexed.length !== actual.length) return false;
  const ordered = [...indexed].sort();
  return [...actual].sort().every((permission, index) => permission === ordered[index]);
}

function githubClient(token) {
  if (!token) throw new Error('The preview job requires its GitHub token');
  return async (method, endpoint, options = {}) => {
    const host = options.upload ? 'uploads.github.com' : 'api.github.com';
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const response = await fetch(`https://${host}/repos/${REPOSITORY}${endpoint}`, {
      method,
      headers: options.body === undefined ? headers : {
        ...headers,
        'Content-Type': options.upload ? 'application/octet-stream' : 'application/json',
      },
      body: options.upload ? options.body : JSON.stringify(options.body),
      redirect: 'error',
      signal: AbortSignal.timeout(options.upload ? 120_000 : 30_000),
    });
    if (options.missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${endpoint} returned HTTP ${response.status}`);
    return response.json();
  };
}

async function requireMainCommit(request, commit) {
  const main = await request('GET', '/git/ref/heads/main');
  if (main?.object?.type !== 'commit' || main.object.sha !== commit) {
    throw new Error('GitHub main advanced beyond this preview build');
  }
}

function releaseMatches(release, tag, draft) {
  return release?.tag_name === tag && release.draft === draft && release.prerelease === true;
}

function verifiedAssets(assets, archives, requirePublicDownloadUrl) {
  return Array.isArray(assets) && assets.length === archives.length && archives.every(archive => {
    const matches = assets.filter(asset => asset.name === archive.name);
    return matches.length === 1 && matches[0].state === 'uploaded' && matches[0].size === archive.bytes.length
      && matches[0].digest === `sha256:${archive.sha256}`
      && (!requirePublicDownloadUrl || matches[0].browser_download_url === archive.downloadUrl);
  });
}

async function pushPreviewIndex(request, { commit, tag, indexBytes }) {
  const branch = await request('GET', `/git/ref/heads/${BRANCH}`, { missing: true });
  if (branch && branch.object?.type !== 'commit') throw new Error('The preview branch does not point to a commit');
  const parent = branch?.object.sha ?? commit;
  const base = await request('GET', `/git/commits/${parent}`);
  const tree = await request('POST', '/git/trees', { body: {
    base_tree: base.tree.sha,
    tree: [{ path: 'market.json', mode: '100644', type: 'blob', content: indexBytes.toString('utf8') }],
  } });
  const next = await request('POST', '/git/commits', { body: {
    message: `Publish plugin preview ${tag}`, tree: tree.sha, parents: [parent],
  } });
  await requireMainCommit(request, commit);
  const updated = branch
    ? await request('PATCH', `/git/refs/heads/${BRANCH}`, { body: { sha: next.sha, force: false } })
    : await request('POST', '/git/refs', { body: { ref: `refs/heads/${BRANCH}`, sha: next.sha } });
  if (updated?.object?.sha !== next.sha) throw new Error('GitHub did not confirm the new preview index commit');
}

export async function publishPluginPreview({ commit, tag, indexBytes, archives, request }) {
  await requireMainCommit(request, commit);
  const existing = await request('GET', `/git/ref/tags/${tag}`, { missing: true });
  if (existing) throw new Error('The immutable GitHub preview tag already exists');

  const release = await request('POST', '/releases', { body: {
    tag_name: tag, target_commitish: commit, name: `Zero plugin preview ${tag}`,
    body: 'Development plugin packages for the isolated Zero Core debug host.',
    draft: true, prerelease: true, make_latest: 'false',
  } });
  if (!releaseMatches(release, tag, true) || !Number.isSafeInteger(release.id) || release.id <= 0) {
    throw new Error('GitHub did not create the expected preview draft');
  }

  const releasePath = `/releases/${release.id}`;
  for (const archive of archives) {
    if (createHash('sha256').update(archive.bytes).digest('hex') !== archive.sha256) {
      throw new Error('The preview archive changed before upload');
    }
    await request('POST', `${releasePath}/assets?name=${encodeURIComponent(archive.name)}`, {
      upload: true, body: archive.bytes,
    });
  }
  const assetsPath = `${releasePath}/assets?per_page=100`;
  const staged = await request('GET', assetsPath);
  if (!verifiedAssets(staged, archives, false)) throw new Error('GitHub draft assets do not match the measured preview archives');
  await requireMainCommit(request, commit);
  const published = await request('PATCH', releasePath, { body: {
    draft: false, prerelease: true, make_latest: 'false',
  } });
  if (!releaseMatches(published, tag, false)) throw new Error('GitHub did not publish the expected preview release');
  const ref = await request('GET', `/git/ref/tags/${tag}`);
  const target = ref?.object?.type === 'tag'
    ? (await request('GET', `/git/tags/${ref.object.sha}`)).object
    : ref?.object;
  if (target?.type !== 'commit' || target.sha !== commit) {
    throw new Error('The published preview tag does not point to the built main commit');
  }
  const publishedAssets = await request('GET', assetsPath);
  if (!verifiedAssets(publishedAssets, archives, true)) throw new Error('Published GitHub assets do not match the measured preview archives');

  await pushPreviewIndex(request, { commit, tag, indexBytes });
}

async function run() {
  const [downloadsRoot, indexPath, ...rest] = process.argv.slice(2);
  if (!downloadsRoot || !indexPath || rest.length) {
    throw new Error('Usage: node scripts/plugin-packages/publish-preview.mjs <artifact directory> <market index>');
  }
  const context = previewPublicationContext(process.env);
  const prepared = await preparePreviewPublication(downloadsRoot, indexPath, context.tag);
  await publishPluginPreview({ ...context, ...prepared, request: githubClient(process.env.GH_TOKEN) });
  console.log(`Published ${prepared.archives.length} verified development packages at ${REPOSITORY_URL}/releases/tag/${context.tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
