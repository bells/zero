import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
const files=['scripts/validate-plugin-protocol.mjs','scripts/lib/plugin-protocol.mjs','schemas/plugin-manifest-v2.schema.json'];
const root=path.resolve('build/plugin-author-tools');
fs.mkdirSync(root,{recursive:true});
const manifest={name:'zero-plugin-author-tools',version:'0.1.0',private:true,type:'module',engines:{node:'>=22.13.0'},scripts:{validate:'node scripts/validate-plugin-protocol.mjs'},dependencies:{ajv:'8.20.0',semver:'7.8.5'}};
fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,'README.md'),'# Zero plugin author tools (preview)\n\nRun `npm install`, then `npm run validate -- /path/to/manifest.json 0.2.0 1.0.0`. Only Node and these two dependencies are needed; no Zero checkout, Rust, React or Tauri is required. This validates the manifest, not installation approval or platform support. Public API 1.0 has not been frozen.\n');
for(const file of files){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(file,path.join(root,file));}
const zip=new JSZip();for(const file of [...files,'package.json','README.md'])zip.file(file,fs.readFileSync(path.join(root,file)),{date:new Date('2026-01-01T00:00:00Z')});
fs.writeFileSync('build/plugin-author-tools.zip',await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log('build/plugin-author-tools.zip');
