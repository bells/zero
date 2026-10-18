import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function materialPath(raw) {
  if (!raw.startsWith('/image-lab/') || /[%?#\\\x00-\x20]/.test(raw)) return null;
  const rest = raw.slice('/image-lab/'.length);
  if (rest.split('/').some((part) => part === '.' || part === '..')) return null;
  if (!rest) return 'browser-experiment/index.html';
  return rest.startsWith('materials/') ? rest.slice('materials/'.length) : `browser-experiment/${rest}`;
}
export async function createLabServer({ host = '127.0.0.1', port = 4325, root = fileURLToPath(new URL('../../output/image-codecs/license-materials/', import.meta.url)) } = {}) {
  const manifestBytes = await readFile(join(root, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (!manifest.replacement?.hostUnchanged) throw new Error('Verified replaceable decoder materials required');
  const allowed = new Map(manifest.materials.map((entry) => [entry.path, entry]));
  allowed.set('manifest.json', { sha256: digest(manifestBytes) });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.heic': 'image/heic' };
  const authority = `${host}:${port}`;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (request.headers.host !== authority || (request.headers.origin && request.headers.origin !== `http://${authority}`)) { response.writeHead(403).end(); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const path = materialPath(request.url || '');
    const record = path && allowed.get(path);
    if (!record) { response.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(join(root, path));
      // Library replacement must remain possible without an application integrity veto.
      if (!/^browser-experiment\/assets\/libheif[^/]*\.js$/.test(path) && digest(bytes) !== record.sha256) { response.writeHead(409).end('Material changed; regenerate verified bundle.'); return; }
      const suffix = path.slice(path.lastIndexOf('.'));
      response.setHeader('Content-Type', types[suffix] || 'application/octet-stream');
      response.setHeader('Content-Length', bytes.length);
      if (request.method === 'HEAD') response.end(); else response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  return server;
}
function lanHost() {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, entries]) => (entries || []).filter((entry) => entry.family === 'IPv4' && !entry.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)).map((entry) => ({ name, address: entry.address })));
  const wifi = candidates.filter((entry) => entry.name === 'en0');
  const selected = wifi.length === 1 ? wifi : candidates;
  if (selected.length !== 1) throw new Error('One private LAN interface required; set IMAGE_LAB_HOST to an assigned local IPv4 address.');
  return selected[0].address;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const host = process.env.IMAGE_LAB_HOST || (process.argv.includes('--lan') ? lanHost() : '127.0.0.1');
  const assigned = Object.values(networkInterfaces()).flat().some((entry) => entry?.family === 'IPv4' && entry.address === host);
  if (!assigned || (host !== '127.0.0.1' && !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host))) throw new Error('Bind only loopback or an assigned private LAN IPv4 address');
  const server = await createLabServer({ host });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4325, host, resolve); });
  console.log(`Image lab: http://${host}:4325/image-lab/`);
  console.log('GET/HEAD only; indexed verified experiment/material files only; no upload endpoint or request log. Stop with Ctrl+C.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
