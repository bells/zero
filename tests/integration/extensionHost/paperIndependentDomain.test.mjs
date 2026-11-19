import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = path.resolve('src/plugins/bingWallpaper/package');
const modules = new Map();
async function load(name) {
  if (!modules.has(name)) modules.set(name, (async () => {
    const source = path.join(root, `${name}.ts`);
    assert.equal(await fs.access(source).then(() => true, () => false), true, `package-owned ${name} domain is required`);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-paper-domain-'));
    try {
      execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), source,
        '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--target', 'ES2022',
        '--module', 'ES2022', '--moduleResolution', 'bundler', '--lib', 'ES2022,DOM',
        '--skipLibCheck', '--outDir', temp], {stdio: 'pipe'});
      await fs.writeFile(path.join(temp, 'package.json'), '{"type":"module"}');
      return await import(pathToFileURL(path.join(temp, `${name}.js`)).href);
    } finally { await fs.rm(temp, {recursive: true, force: true}); }
  })());
  return modules.get(name);
}
const now = Date.parse('2026-10-31T20:00:00Z');

test('Paper market day crosses month/year/leap boundaries in UTC+8 regardless of UI timezone', async () => {
  const p = await load('policy');
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/New_York', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      for (const [at, day, midnight] of [
        ['2026-10-31T15:59:59Z', '2026-10-31', '2026-10-31T16:00:00.000Z'],
        ['2026-10-31T16:00:00Z', '2026-11-01', '2026-11-01T16:00:00.000Z'],
        ['2026-12-31T16:00:00Z', '2027-01-01', '2027-01-01T16:00:00.000Z'],
        ['2024-02-28T16:00:00Z', '2024-02-29', '2024-02-29T16:00:00.000Z'],
        ['2024-02-29T16:00:00Z', '2024-03-01', '2024-03-01T16:00:00.000Z'],
      ]) {
        assert.equal(p.marketDay(Date.parse(at)), day);
        assert.equal(new Date(p.nextMidnight(Date.parse(at))).toISOString(), midnight);
      }
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  assert.throws(() => p.marketDay(NaN), RangeError);
});

test('Paper publication dates prefer explicit display date without invalid/future fallback', async () => {
  const p = await load('policy');
  assert.equal(p.publicationDate('20261031', '20261030', now), '2026-10-31');
  assert.equal(p.publicationDate(undefined, '20261030', now), '2026-10-30');
  assert.equal(p.publicationDate('20240229', '20261030', now), '2024-02-29');
  for (const value of ['20260230', '20261102', '2026103', '2026-10-31', '', '20230229', '00000101']) {
    assert.equal(p.publicationDate(value, '20261030', now), null, value);
  }
  assert.equal(p.publicationDate(undefined, '20260230', now), null);
});

test('Paper bounded retry coalesces to next market midnight', async () => {
  const p = await load('policy');
  assert.deepEqual([0, 1, 2, 3, 4, 100].map(p.retrySeconds), [60, 300, 900, 1800, 1800, 1800]);
  assert.equal(new Date(p.retryAt(Date.parse('2026-10-31T15:59:50Z'), 3)).toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(new Date(p.retryAt(Date.parse('2026-10-31T00:00:00Z'), 1)).toISOString(), '2026-10-31T00:05:00.000Z');
  for (const attempt of [-1, 0.5, NaN, Infinity]) assert.throws(() => p.retrySeconds(attempt), RangeError);
});

const image = (overrides = {}) => ({
  startdate: '20261030', fullstartdate: '202610301600',
  title: '  Mountain lake  ', copyright: 'Mountain lake (© Photographer)',
  copyrightlink: '/search?q=lake', url: '/th?id=OHR.Lake_ZH-CN_1920x1080.jpg&rf=LaDigue_1920x1080.jpg',
  hsh: 'bing-stable-id', ...overrides,
});

test('Paper archive preserves Bing identity, UTC publication metadata and title fallback', async () => {
  const a = await load('archive');
  const result = await a.parseArchive({images: [image(), image({hsh: undefined, title: ' '})]}, now);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  const item = result.items.find(item => item.id === 'bing-stable-id');
  assert.equal(item.title, 'Mountain lake');
  assert.equal(item.startDate, '20261030');
  assert.equal(item.displayDate, '20261031');
  assert.equal(item.publicationDate, '2026-10-31');
  assert.equal(item.remoteUrl, 'https://www.bing.com/th?id=OHR.Lake_ZH-CN_1920x1080.jpg&rf=LaDigue_1920x1080.jpg');
  assert.equal(item.copyrightUrl, 'https://www.bing.com/search?q=lake');
  const fallback = result.items.find(item => item.id !== 'bing-stable-id');
  // SHA256 of the literal normalized URL above, first 8 bytes; independently checked with node:crypto.
  assert.equal(fallback.id, 'bb357ff696f71472');
  assert.equal(fallback.title, 'Mountain lake');
  const base = await a.parseArchive({images: [image({url: '', urlbase: '/th?id=OHR.Base_ZH-CN'})]}, now);
  assert.equal(base.items[0].remoteUrl, 'https://www.bing.com/th?id=OHR.Base_ZH-CN_1920x1080.jpg');
  const malformedHash = await a.parseArchive({images: [image({hsh: '../not-an-id'})]}, now);
  assert.equal(malformedHash.items[0].id, 'bb357ff696f71472');
});

test('Paper archive rejects unsafe origins, credentials, fragments and endpoint/path injection', async () => {
  const a = await load('archive');
  for (const url of [
    'http://www.bing.com/th?id=x', 'https://bing.com/th?id=x', 'https://www.bing.com.evil.test/th?id=x',
    'https://www.bing.com:444/th?id=x', '//evil.test/th?id=x',
    'https://user:pass@www.bing.com/th?id=x', '/th?id=x#fragment', '/search?id=x', '/th?x=id', '/th?id=',
    '/other/../th?id=x', '/%2e%2e/th?id=x', '/\\evil.test/th?id=x', '/th?i\nd=x',
  ]) {
    const result = await a.parseArchive({images: [image({url})]}, now);
    assert.equal(result.ok, false, url);
    assert.equal(result.error.code, 'bing.no_valid_items', url);
  }
  const valid = await a.parseArchive({images: [image({copyrightlink: 'https://user@www.bing.com/search?q=x'})]}, now);
  assert.equal(valid.ok, true);
  assert.equal(valid.items[0].copyrightUrl, undefined);
});

test('Paper archive fails malformed/oversized input explicitly and skips invalid entries', async () => {
  const a = await load('archive');
  for (const input of [null, [], {}, {images: 'bad'}, {images: []}]) {
    assert.equal((await a.parseArchive(input, now)).ok, false);
  }
  for (const overrides of [
    {startdate: '20260230'}, {startdate: 'bad20261030'}, {startdate: '20261102'},
    {fullstartdate: '202602301600'}, {fullstartdate: '202611021600'}, {fullstartdate: ''},
    {fullstartdate: '202610302460'}, {title: 3}, {title: 'x'.repeat(1025)},
    {copyright: 'x'.repeat(4097)}, {url: '/th?id=' + 'x'.repeat(2048)},
  ]) {
    const result = await a.parseArchive({images: [image(overrides), image()]}, now);
    assert.equal(result.ok, true);
    assert.equal(result.items.length, 1);
    assert.equal(result.rejectedEntries, 1);
  }
  const result = await a.parseArchive({images: [image({fullstartdate: undefined})]}, now);
  assert.equal(result.items[0].publicationDate, '2026-10-30');
  assert.equal((await a.parseArchiveJson('{"images":', now)).error.code, 'bing.response_invalid');
  assert.equal((await a.parseArchiveJson(' '.repeat(1024 * 1024 + 1), now)).error.code, 'bing.response_limit');
  assert.equal((await a.parseArchive({images: [image()], ignored: 'x'.repeat(1024 * 1024)}, now)).error.code, 'bing.response_limit');
});

test('Paper archive sorts and deduplicates deterministically before retaining latest ten', async () => {
  const a = await load('archive');
  const images = Array.from({length: 12}, (_, i) => image({startdate: `202610${String(i + 1).padStart(2, '0')}`, fullstartdate: undefined, hsh: `id-${i}`}));
  const result = await a.parseArchive({images: [...images, images[11], image({hsh: 'id-11'})]}, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.map(item => item.id), ['id-11', 'id-10', 'id-9', 'id-8', 'id-7', 'id-6', 'id-5', 'id-4', 'id-3', 'id-2']);
  const ties = await a.parseArchive({images: [image({hsh:'b'}), image({hsh:'a'})]}, now);
  assert.deepEqual(ties.items.map(item => item.id), ['a', 'b']);
});

const wallpaper = (id, startDate, overrides = {}) => ({id, startDate, title: `Title ${id}`, attribution: `Attribution ${id}`, ...overrides});
test('Paper entering and Latest follow newest while manual history survives refresh within a session', async () => {
  const s = await load('selection');
  const cached = [wallpaper('oct28', '20261028'), wallpaper('oct27', '20261027')];
  const remote = [wallpaper('oct31', '20261031'), ...cached];
  const session = s.createSelectionSession();
  assert.equal(session.accept(cached), 'oct28');
  assert.equal(session.accept(remote), 'oct31');
  session.choose('oct27');
  assert.equal(session.accept(remote), 'oct27');
  session.latest();
  assert.equal(session.accept(remote), 'oct31');
  session.choose('oct27');
  assert.equal(session.accept([remote[0]]), 'oct31');
  session.choose('oct28');
  session.open();
  assert.equal(session.accept(remote), 'oct31');
  assert.equal(session.accept([]), null);
  assert.equal(session.accept(cached), 'oct28');
});

test('Paper stable order, navigation boundaries and display-title fallback remain package owned', async () => {
  const s = await load('selection');
  const items = [wallpaper('b', '20261030'), wallpaper('old', '20261029'), wallpaper('a', '20261030')];
  assert.deepEqual(s.sortWallpapers(items).map(item => item.id), ['a', 'b', 'old']);
  assert.equal(items[0].id, 'b');
  assert.equal(s.navigation(items, null).selected.id, 'a');
  assert.equal(s.selectOlder(items, 'a'), 'b');
  assert.equal(s.selectOlder(items, 'old'), 'old');
  assert.equal(s.selectNewer(items, 'old'), 'b');
  assert.equal(s.selectNewer(items, 'a'), 'a');
  assert.deepEqual(s.navigation([], 'missing'), {selected: null, selectedIndex: -1, canSelectOlder: false, canSelectNewer: false});
  assert.equal(s.displayTitle(wallpaper('x', '20261030', {title:' ', attribution:'Mountain lake (© Author)'}), 'Wallpaper'), 'Mountain lake');
  assert.equal(s.displayTitle(wallpaper('x', '20261030', {title:' ', attribution:' '}), 'Wallpaper'), 'Wallpaper');
  assert.equal(s.displayTitle(null, 'Wallpaper'), 'Wallpaper');
});

test('Paper daily automation requires explicit opt-in and rejects unknown configuration instead of resetting', async () => {
  const a = await load('automation');
  const state = a.createAutomationState();
  assert.deepEqual(state.settings, {version: 1, autoChangeDaily: false});
  assert.equal(a.decideCheck(state, true), 'off');
  assert.deepEqual(a.readSettings({version:1, autoChangeDaily:true}), {version:1, autoChangeDaily:true});
  for (const input of [null, {}, {version:2, autoChangeDaily:true}, {version:1, autoChangeDaily:'true'}, {version:1, autoChangeDaily:true, startup:true}]) {
    assert.throws(() => a.readSettings(input));
  }
  assert.throws(() => a.updateSettings(state, {autoChangeDaily:true, startup:true}));
  const enabled = a.updateSettings(state, {autoChangeDaily:true});
  assert.equal(enabled.explicitEnable, true);
  assert.equal(a.decideCheck(enabled.state, true), 'check');
  assert.equal(a.decideCheck(enabled.state, false), 'off');
  assert.equal(state.settings.autoChangeDaily, false);
  assert.equal(a.updateSettings(enabled.state, {autoChangeDaily:true}).explicitEnable, false);
});

test('Paper automatic decisions retain same-ID dedupe, explicit-enable history exception and fresh-data checks', async () => {
  const a = await load('automation');
  const enabled = a.updateSettings(a.createAutomationState(), {autoChangeDaily:true}).state;
  const latest = {id:'latest', startDate:'20261031', displayDate:'20261101'};
  const context = {now, toolEnabled:true, platformSupported:true, stale:false, hasError:false, items:[latest], explicitEnable:false, retryAttempt:0};
  assert.equal(a.decideApply(enabled, context).kind, 'apply');
  assert.equal(a.decideApply(enabled, {...context, toolEnabled:false}).kind, 'off');
  assert.equal(a.decideApply(enabled, {...context, platformSupported:false}).kind, 'unsupported');
  assert.equal(a.decideApply(enabled, {...context, hasError:true, stale:true}).kind, 'refreshError');
  assert.equal(a.decideApply(enabled, {...context, hasError:true}).kind, 'apply');
  assert.equal(a.decideApply(enabled, {...context, items:[]}).kind, 'idle');
  const old = {id:'old', startDate:'20261030'};
  assert.equal(a.decideApply(enabled, {...context, items:[old]}).kind, 'retryWaiting');
  assert.equal(a.decideApply(enabled, {...context, items:[old], explicitEnable:true}).kind, 'apply');
  for (const displayDate of ['20261102', '20260230', '']) {
    assert.equal(a.decideApply(enabled, {...context, items:[{...latest, displayDate}], explicitEnable:true}).kind, 'retryWaiting');
  }
  const pending = a.prepareApply(enabled, {operationId:'once', item:latest, origin:'automatic'}, now);
  const applied = a.settleApply(pending, 'once', 'applied', now, '2026-11-01');
  assert.equal(a.decideApply(applied, context).kind, 'idle');
  // Existing Rust suppresses the same stable ID even if the archive later changes its date.
  assert.equal(a.decideApply(applied, {...context, items:[{...latest, displayDate:'20261031'}], explicitEnable:true}).kind, 'retryWaiting');
});

test('Paper manual historic wallpaper protects the market day and releases exactly at next midnight', async () => {
  const a = await load('automation');
  const enabled = a.updateSettings(a.createAutomationState(), {autoChangeDaily:true}).state;
  const pending = a.prepareApply(enabled, {operationId:'manual', item:{id:'old',startDate:'20261030'}, origin:'manual'}, now);
  const applied = a.settleApply(pending, 'manual', 'applied', now, '2026-11-01');
  assert.equal(new Date(applied.manualOverrideUntil).toISOString(), '2026-11-01T16:00:00.000Z');
  const context = {now, toolEnabled:true, platformSupported:true, stale:false, hasError:false, items:[{id:'latest',startDate:'20261101'}], explicitEnable:false, retryAttempt:0};
  assert.equal(a.decideApply(applied, context).kind, 'pausedForManual');
  assert.equal(a.decideApply(applied, {...context, now:Date.parse('2026-11-01T15:59:59Z')}).kind, 'pausedForManual');
  assert.equal(a.decideApply(applied, {...context, now:Date.parse('2026-11-01T16:00:00Z'), items:[{id:'next',startDate:'20261102'}]}).kind, 'apply');
  const off = a.updateSettings(applied, {autoChangeDaily:false}).state;
  const on = a.updateSettings(off, {autoChangeDaily:true});
  assert.equal(on.state.manualOverrideUntil, null);
  assert.equal(on.explicitEnable, true);
  const unprotected = a.settleApply(a.prepareApply(a.createAutomationState(), {operationId:'off',item:{id:'old',startDate:'20261030'},origin:'manual'},now), 'off', 'applied', now, '2026-11-01');
  assert.equal(unprotected.manualOverrideUntil, null);
});

test('Paper uncertain outcome and unpersisted completion cannot be automatically replayed', async () => {
  const a = await load('automation');
  const enabled = a.updateSettings(a.createAutomationState(), {autoChangeDaily:true}).state;
  const intent = {operationId:'op-1', item:{id:'latest',startDate:'20261101'}, origin:'automatic'};
  const durablePending = a.prepareApply(enabled, intent, now);
  assert.equal(enabled.pendingIntent, null);
  assert.equal(a.decideCheck(durablePending, true), 'blockedUncertain');
  assert.throws(() => a.prepareApply(durablePending, {...intent, operationId:'duplicate'}, now));
  assert.throws(() => a.prepareApply(a.createAutomationState(), intent, now));
  assert.equal(a.settleApply(durablePending, 'op-1', 'uncertain', now, '2026-11-01'), durablePending);
  assert.throws(() => a.settleApply(durablePending, 'different-op', 'applied', now, '2026-11-01'));
  const proposedCompletion = a.settleApply(durablePending, 'op-1', 'applied', now, '2026-11-01');
  assert.equal(proposedCompletion.pendingIntent, null);
  // Persistence failure leaves the original durable value authoritative.
  assert.equal(a.decideCheck(a.readAutomationState(JSON.parse(JSON.stringify(durablePending))), true), 'blockedUncertain');
  assert.equal(a.updateSettings(durablePending, {autoChangeDaily:true}).state.pendingIntent.operationId, 'op-1');
  const off = a.updateSettings(durablePending, {autoChangeDaily:false}).state;
  const recovered = a.updateSettings(off, {autoChangeDaily:true}).state;
  assert.equal(recovered.pendingIntent, null);
  assert.equal(recovered.recoveryIntent.operationId, 'op-1');
  assert.equal(a.decideCheck(recovered, true), 'check');
  const failed = a.settleApply(durablePending, 'op-1', 'failed', now, '2026-11-01');
  assert.equal(failed.pendingIntent, null);
  assert.equal(failed.lastApplied, null);
});

test('Paper persisted safety contract rejects unsupported versions and malformed pending state', async () => {
  const a = await load('automation');
  const state = a.createAutomationState();
  assert.deepEqual(a.readAutomationState(JSON.parse(JSON.stringify(state))), state);
  for (const input of [null, {...state,schemaVersion:2}, {...state,manualOverrideUntil:'tomorrow'}, {...state,extra:true},
    {...state,pendingIntent:{operationId:'x',wallpaperId:'x',origin:'automatic',publicationDate:'2026-02-30',startedAt:now}},
    {...state,pendingIntent:{operationId:'',wallpaperId:'x',origin:'automatic',publicationDate:null,startedAt:now}}]) {
    assert.throws(() => a.readAutomationState(input));
  }
});

test('Paper unrecognized completion cannot clear a pending intent or claim wallpaper success', async () => {
  const a = await load('automation');
  const state = a.prepareApply(a.createAutomationState(), {operationId:'receipt',item:{id:'x',startDate:'20261030'},origin:'manual'}, now);
  assert.throws(() => a.settleApply(state, 'receipt', 'unrecognized-provider-result', now, null));
  assert.equal(state.pendingIntent.operationId, 'receipt');
  assert.equal(state.lastApplied, null);
});
