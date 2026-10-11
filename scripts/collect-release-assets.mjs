import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const output = 'build/release-assets';
fs.mkdirSync(output, { recursive: true });
const manifests = [];
const checksums = [];
for (const directory of fs.readdirSync('build/downloads')) {
  const root = path.join('build/downloads', directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'sizes.json'), 'utf8'));
  manifests.push(manifest);
  for (const asset of manifest.assets) {
    const bytes = fs.readFileSync(path.join(root, asset.name));
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== asset.sha256 || bytes.length !== asset.bytes) throw new Error(`Asset mismatch: ${asset.name}`);
    fs.writeFileSync(path.join(output, asset.name), bytes);
    checksums.push(`${digest}  ${asset.name}`);
  }
}
fs.writeFileSync(path.join(output, 'sizes.json'), JSON.stringify(manifests, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
const summary = '| Profile | Platform / arch | Installer | MiB |\n| --- | --- | --- | ---: |\n' + manifests.flatMap(m => m.assets.map(a => `| ${m.profile} | ${m.platform} / ${m.arch} | ${a.name} | ${(a.bytes / 1048576).toFixed(2)} |`)).join('\n') + '\n';
fs.writeFileSync(path.join(output, 'sizes.md'), summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
