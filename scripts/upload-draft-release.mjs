import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const tag = process.env.GITHUB_REF_NAME;
const repository = process.env.GITHUB_REPOSITORY;
if (!tag?.startsWith('v') || !repository) throw new Error('A repository version tag is required');
const view = spawnSync('gh', ['release', 'view', tag, '--repo', repository, '--json', 'isDraft'], { encoding: 'utf8' });
if (view.status === 0) {
  if (!JSON.parse(view.stdout).isDraft) throw new Error('Refusing to replace assets on a published release');
} else {
  const body = 'Zero trial installers. core: host without bundled tools. standard: Awake, Paper, Snap and Launch. File is excluded. These trial builds are not notarized or developer-signed. Compare the same platform and architecture using sizes.md; verify downloads using SHA256SUMS.txt.\n';
  fs.writeFileSync('build/release-body.md', body);
  execFileSync('gh', ['release', 'create', tag, '--repo', repository, '--verify-tag', '--draft', '--title', `Zero ${tag}`, '--notes-file', 'build/release-body.md'], { stdio: 'inherit' });
}
execFileSync('gh', ['release', 'upload', tag, '--repo', repository, '--clobber', ...fs.readdirSync('build/release-assets').map(file => path.join('build/release-assets', file))], { stdio: 'inherit' });
