import fs from 'node:fs';
import path from 'node:path';
import { resolveBuildProfile } from './build-profile.mjs';
const profile = resolveBuildProfile(process.argv[2] ?? process.env.ZERO_BUILD_PROFILE);
const dist = profile.name === 'full' ? 'dist' : `build/frontend/${profile.name}`;
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(dist, 'build-profile.json'), 'utf8'));
if (evidence.profile !== profile.name || JSON.stringify(evidence.tools) !== JSON.stringify(profile.tools)) throw new Error('Profile evidence mismatch');
const modules = [...Object.keys(manifest), ...evidence.modules];
if (!profile.tools.includes('file') && (modules.some(key => /plugins\/file|pdfToDocx|FileEngine|pdf\.worker/.test(key)) || fs.existsSync(path.join(dist, 'file-engine')))) {
  throw new Error('Excluded File code/assets leaked into the profile bundle');
}
if (profile.name === 'core' && modules.some(key => /src\/plugins\//.test(key))) {
  throw new Error('Tool modules leaked into core');
}
const report = { profile: profile.name, tools: profile.tools, chunks: modules, frontendBytes: fs.readdirSync(dist, { recursive: true }).reduce((total, file) => {
  const info = fs.statSync(path.join(dist, file));
  return total + (info.isFile() ? info.size : 0);
}, 0) };
console.log(JSON.stringify({ profile: report.profile, tools: report.tools, frontendBytes: report.frontendBytes, moduleCount: evidence.modules.length }, null, 2));
