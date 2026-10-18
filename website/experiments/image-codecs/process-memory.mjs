import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export function processTreeRss(text, rootPid) {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0 || !text.trim()) throw new Error('Invalid process sample');
  const rows = text.trim().split('\n').map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
    if (!match) throw new Error('Invalid process sample');
    const [pid, ppid, rssKiB] = match.slice(1).map(Number);
    if (![pid, ppid, rssKiB].every(Number.isSafeInteger) || pid <= 0) throw new Error('Invalid process sample');
    return { pid, ppid, rssBytes: rssKiB * 1024 };
  });
  if (new Set(rows.map((row) => row.pid)).size !== rows.length) throw new Error('Duplicate process in sample');
  if (!rows.some((row) => row.pid === rootPid)) return { rootAlive: false, rssBytes: null, processes: [] };
  const included = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (included.has(row.ppid) && !included.has(row.pid)) { included.add(row.pid); changed = true; }
  }
  const processes = rows.filter((row) => included.has(row.pid));
  return { rootAlive: true, rssBytes: processes.reduce((total, row) => total + row.rssBytes, 0), processes };
}
export async function sampleBrowserRss(rootPid) {
  // Collect numeric columns only. Never collect unrelated process arguments or URLs.
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,ppid=,rss='], { timeout: 3000, maxBuffer: 1024 * 1024 });
  return processTreeRss(stdout, rootPid);
}
