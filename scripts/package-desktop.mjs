import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveBuildProfile } from './build-profile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const profileIndex = args.indexOf('--profile');
if (profileIndex < 0 || !args[profileIndex + 1]) throw new Error('Use --profile core or --profile standard');
const profile = resolveBuildProfile(args[profileIndex + 1]);
args.splice(profileIndex, 2);
if (args.some(arg => /^(?:--features|--no-default-features|--config|-c|-f)(?:=|$)/.test(arg))) {
  throw new Error('Features/config are owned by the build profile');
}
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? args[targetIndex + 1] : null;
if (targetIndex >= 0 && !target) throw new Error('--target requires a target triple');
const targetDir = path.join(root, 'src-tauri', 'target');
const output = path.join(root, 'build', 'packages', profile.name);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const frontendDist = profile.name === 'full' ? '../dist' : `../build/frontend/${profile.name}`;
const config = { build: { frontendDist }, ...(process.platform === 'darwin' ? { bundle: { macOS: { signingIdentity: process.env.APPLE_SIGNING_IDENTITY ?? '-' } } } : {}) };
if (target?.includes('windows') || (!target && process.platform === 'win32')) {
  config.bundle = { resources: profile.tools.includes('snap') ? { '../node_modules/.cache/zero-windows-ocr/resources/': 'windows-ocr/' } : [] };
}
const buildArgs = ['tauri', 'build', '--config', JSON.stringify(config)];
if (profile.features.length) buildArgs.push('--features', profile.features.join(','));
buildArgs.push(...args, '--', '--no-default-features', '--locked');
const startedAt = Date.now();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run this script through pnpm package:desktop');
// Invoke the package-manager JS entry directly so cmd.exe cannot strip JSON config quotes.
const result = spawnSync(process.execPath, [pnpmCli, ...buildArgs], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, ZERO_BUILD_PROFILE: profile.name, ...(target ? { ZERO_TARGET_TRIPLE: target } : {}), CARGO_TARGET_DIR: targetDir },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const bundleRoot = path.join(targetDir, ...(target ? [target] : []), 'release', 'bundle');
const files = fs.readdirSync(bundleRoot, { recursive: true }).map(file => path.join(bundleRoot, file))
  .filter(file => fs.statSync(file).isFile() && /\.(dmg|msi|exe)$/.test(file) && fs.statSync(file).mtimeMs >= startedAt - 1000);
if (!files.length) throw new Error(`No installers found in ${bundleRoot}`);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const platform = process.platform === 'darwin' ? 'macos' : process.platform;
const arch = target?.split('-')[0] ?? process.arch;
const assets = files.map(file => {
  const extension = path.extname(file);
  const kind = path.basename(path.dirname(file));
  const name = `Zero_${version}_${profile.name}_${platform}_${arch}_${kind}${extension}`;
  const destination = path.join(output, name);
  fs.copyFileSync(file, destination);
  return { name, bytes: fs.statSync(destination).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex') };
});
function directoryBytes(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const file = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? directoryBytes(file) : entry.isSymbolicLink() ? 0 : fs.statSync(file).size);
  }, 0);
}
const appDirectory = path.join(bundleRoot, 'macos', 'Zero.app');
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--verify', '--deep', '--strict', appDirectory], { stdio: 'inherit' });
}
const installedAppBytes = fs.existsSync(appDirectory) ? directoryBytes(appDirectory) : null;
const manifest = { version, profile: profile.name, tools: profile.tools, platform, arch, installedAppBytes, assets };
fs.writeFileSync(path.join(output, 'sizes.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), assets.map(a => `${a.sha256}  ${a.name}\n`).join(''));
const summary = `Zero v${version} / ${profile.name} / ${platform} ${arch}\n\n| Installer | Bytes | MiB |\n| --- | ---: | ---: |\n` +
  assets.map(a => `| ${a.name} | ${a.bytes} | ${(a.bytes / 1048576).toFixed(2)} |\n`).join('') +
  (installedAppBytes === null ? '' : `\nInstalled .app: ${(installedAppBytes / 1048576).toFixed(2)} MiB (${installedAppBytes} bytes).\n`);
fs.writeFileSync(path.join(output, 'sizes.md'), summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
console.log(`Installers: ${output}`);
