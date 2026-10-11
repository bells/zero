import fs from 'node:fs';
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1];
if (version !== tauri || version !== cargo) throw new Error('Package, Tauri and Cargo versions must match');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error(`Tag must be v${version}`);
}
console.log(`Zero v${version}`);

if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
