// Candidate investigation only. Runs the released core with synthetic in-memory models.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const candidateRoot = resolve(process.env.WALINE_CANDIDATE_ROOT ?? '/tmp/zero-waline-probe/package');
const require = createRequire(import.meta.url);
const { createWalineCore } = require(`${candidateRoot}/node_modules/@waline/core/dist/index.cjs`);
const visitor = () => ({ headers: {}, state: {} });
const owner = () => ({ headers: {}, state: { userInfo: { objectId: 'owner', type: 'administrator', email: 'owner@example.invalid', display_name: 'Owner' } } });

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === '_logic') return true;
    if (key === '_complex') {
      const entries = Object.entries(value).filter(([field]) => field !== '_logic');
      return value._logic === 'or'
        ? entries.some(([field, condition]) => matches(row, { [field]: condition }))
        : entries.every(([field, condition]) => matches(row, { [field]: condition }));
    }
    if (!Array.isArray(value)) return row[key] === value;
    const [operator, expected] = value;
    switch (operator) {
      case 'IN': return expected.includes(row[key]);
      case 'NOT IN': return !expected.includes(row[key]);
      case '!=': return row[key] !== expected;
      case '>': return row[key] > expected;
      default: throw new Error(`Unsupported probe operator: ${operator}`);
    }
  });
}

function model() {
  const rows = [];
  return {
    rows,
    async select(where = {}, options = {}) {
      const selected = rows.filter((row) => matches(row, where));
      for (const { field, direction } of [...(options.order ?? [])].reverse()) {
        selected.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (direction === 'asc' ? 1 : -1));
      }
      return structuredClone(selected.slice(options.offset ?? 0, options.limit === undefined ? undefined : (options.offset ?? 0) + options.limit));
    },
    async count(where = {}) { return rows.filter((row) => matches(row, where)).length; },
    async add(data) {
      const row = { ...data, objectId: String(rows.length + 1) };
      rows.push(structuredClone(row));
      return structuredClone(row);
    },
    async update(data, where) {
      return rows.filter((row) => matches(row, where)).map((row) => {
        Object.assign(row, typeof data === 'function' ? data(row) : data);
        return structuredClone(row);
      });
    },
    async delete(where) {
      for (let index = rows.length - 1; index >= 0; index--) if (matches(rows[index], where)) rows.splice(index, 1);
    },
  };
}

function fixture() {
  const models = { Comment: model(), Counter: model(), Users: model() };
  const core = createWalineCore({ models, config: { audit: true, disableRegion: true, disableUserAgent: true } });
  return { core, models };
}

// These tests characterize the candidate; passing does not approve it for production.
test('fixed release has conflicting MIT metadata and GPL v2 files (adopted under GPL v2)', () => {
  const pkg = JSON.parse(readFileSync(`${candidateRoot}/package.json`, 'utf8'));
  assert.equal(pkg.version, '1.43.4');
  assert.equal(pkg.license, 'MIT');
  assert.match(readFileSync(`${candidateRoot}/LICENSE`, 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 2, June 1991/u);
  assert.match(readFileSync(`${candidateRoot}/node_modules/@waline/core/LICENSE`, 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 2, June 1991/u);
});

test('downloaded release matches registry sha512 integrity', () => {
  const tar = readFileSync(resolve(candidateRoot, '../waline.tgz'));
  assert.equal(createHash('sha512').update(tar).digest('base64'), 'g6qblq8i5H0ByDbsYRdPcsvauXicXfiLYhxIynwHpuYuawM1QuxAGkttQQgCOi+u960JFjbsQOmRzA0XHJfydw==');
});

test('empty personal details accepted; literal source retained; waiting content excluded from list/count', async () => {
  const { core, models } = fixture();
  const text = '<img src="https://media.example.invalid/private">\n![x](https://media.example.invalid/x)\n**literal** 😀';
  await core.comment.create({ comment: text, url: 'tools/json' }, visitor());
  assert.equal(models.Comment.rows[0].comment, text);
  assert.equal(models.Comment.rows[0].status, 'waiting');
  assert.equal((await core.comment.list({ path: 'tools/json' }, visitor())).data.length, 0);
  assert.deepEqual(await core.comment.count({ url: 'tools/json' }, visitor()), [0]);
});

test('owner moderation/reply and protected export operate in released core', async () => {
  const { core } = fixture();
  const pending = await core.comment.create({ comment: 'Suggestion', url: 'tools/json', mail: 'private@example.invalid' }, visitor());
  await assert.rejects(core.comment.update({ objectId: pending.objectId, data: { status: 'approved' } }, visitor()), { status: 401 });
  await assert.rejects(core.database.export({}, visitor()), { status: 401 });
  await core.comment.update({ objectId: pending.objectId, data: { status: 'approved' } }, owner());
  const reply = await core.comment.create({ comment: 'Reply', url: 'tools/json', pid: pending.objectId, rid: pending.objectId }, owner());
  assert.equal(reply.status, 'approved');
  const publicList = await core.comment.list({ path: 'tools/json' }, visitor());
  assert.equal(publicList.data.length, 1);
  assert.equal(publicList.data[0].children.length, 1);
  assert.equal(JSON.stringify(publicList).includes('private@example.invalid'), false);
  const exported = await core.database.export({}, owner());
  assert.equal(exported.data.Comment.length, 2);
  assert.equal(exported.data.Comment[0].mail, 'private@example.invalid');
});

test('native create accepts visitor parent references: facade must reject before dispatch', async () => {
  const { core, models } = fixture();
  await core.comment.create({ comment: 'Injected reply', url: 'tools/json', pid: 'arbitrary-parent', rid: 'arbitrary-parent' }, visitor());
  assert.equal(models.Comment.rows[0].pid, 'arbitrary-parent');
});

test('native reads retain UA and arbitrary stored fields: facade projection is required', async () => {
  const { core, models } = fixture();
  await models.Comment.add({ comment: 'Public', url: 'tools/json', insertedAt: new Date(), status: 'approved', ua: 'synthetic-private-UA', privateField: 'synthetic-private-field' });
  const page = await core.comment.list({ path: 'tools/json' }, visitor());
  assert.equal(page.data[0].ua, 'synthetic-private-UA');
  assert.equal(page.data[0].privateField, 'synthetic-private-field');
});

test('native registration has first-user administrator claiming, even with audit enabled', async () => {
  const models = { Comment: model(), Counter: model(), Users: model() };
  const core = createWalineCore({ models, config: { audit: true }, services: { password: { hash: async () => 'synthetic-hash' } } });
  await core.user.register({ email: 'claim@example.invalid', password: 'synthetic-only' }, visitor());
  assert.equal(models.Users.rows[0].type, 'administrator');
});

test('HTTP server performs OAuth discovery before plugin middleware and forces Markdown HTML on', () => {
  const middleware = readFileSync(`${candidateRoot}/src/config/middleware.js`, 'utf8');
  assert.ok(middleware.indexOf("handle: 'fetch-oauth-service'") < middleware.indexOf("handle: 'plugin'"));
  assert.match(readFileSync(`${candidateRoot}/src/middleware/fetch-oauth-service.js`, 'utf8'), /await fetch\(oauthUrl/u);
  assert.match(readFileSync(`${candidateRoot}/src/service/markdown/index.js`, 'utf8'), /\.\.\.config,[\s\S]*html: true/u);
});
