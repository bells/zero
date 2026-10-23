import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { webTools } from '../src/content/web-tools.ts';

const origin = 'https://www.usezero.cn';
const docs = ['tools', 'tools/timestamp', 'tools/json', 'tools/base64', 'tools/diff', 'tools/image-converter', 'tools/image-watermark', 'tools/image-compressor', 'tools/markdown', 'tools/snap', 'tools/launch', 'tools/awake', 'tools/paper', 'tools/file', 'guide/install', 'faq'];
const routes = ['', 'download', ...docs].flatMap((page) => [page ? `/${page}/` : '/', `/en/${page ? `${page}/` : ''}`]);
const output = new URL('../dist/', import.meta.url);
const htmlFor = (route) => readFile(new URL(`${route.slice(1)}index.html`, output), 'utf8');
const graphFor = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] || 'null');

test('static delivery contains exactly 36 public pages and two localized error pages', async () => {
  const files = (await readdir(output, { recursive: true })).filter((file) => file.endsWith('.html') && !file.startsWith('image-codecs/materials/'));
  const expected = [...routes.map((route) => `${route.slice(1)}index.html`), '404.html', 'en/404/index.html'];
  assert.equal(files.length, 38);
  assert.deepEqual(files.sort(), expected.sort());
});

test('all public pages have useful, unique titles and reciprocal language metadata', async () => {
  assert.equal(routes.length, 36);
  const titles = new Set();
  for (const route of routes) {
    const html = await htmlFor(route);
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
    assert.ok(title?.includes('Zero'), `${route}: product identity`);
    assert.ok(!titles.has(title), `${route}: duplicate title`);
    titles.add(title);
    assert.ok(html.includes(`rel="canonical" href="${origin}${route}"`), route);
    const equivalent = route.startsWith('/en/') ? route.slice(3) : `/en${route}`;
    assert.ok(html.includes(`href="${origin}${equivalent}"`), `${route}: alternate language`);
    assert.match(html, /content="index, follow"/);
  }
  assert.match(await htmlFor('/'), /<title>.*macOS.*Windows.*桌面工具箱/);
  assert.match(await htmlFor('/en/'), /<title>.*[Dd]esktop toolbox/);
});

test('JSON-LD connects each page to stable software, website and source entities', async () => {
  for (const route of routes) {
    const graph = graphFor(await htmlFor(route));
    assert.ok(Array.isArray(graph?.['@graph']), `${route}: entity graph missing`);
    const nodes = graph['@graph'];
    const software = nodes.find((node) => node['@type'] === 'SoftwareApplication');
    assert.equal(software['@id'], `${origin}/#software`);
    assert.equal(software.codeRepository, undefined);
    assert.equal(software.offers, undefined);
    assert.equal(software.aggregateRating, undefined);
    const source = nodes.find((node) => node['@type'] === 'SoftwareSourceCode');
    assert.equal(source.codeRepository, 'https://github.com/bells/zero');
    const page = nodes.find((node) => node['@type'] === 'WebPage' || node['@type'] === 'CollectionPage');
    assert.equal(page.url, `${origin}${route}`);
    assert.equal(page.inLanguage, route.startsWith('/en/') ? 'en' : 'zh-CN');
    const web = /\/tools\/(timestamp|json|base64|diff|image-converter|image-watermark|image-compressor|markdown)\//.test(route);
    const directory = /\/tools\/$/.test(route);
    assert.equal(page.about['@id'], web ? `${origin}${route}#tool` : directory ? `${origin}${route}#list` : software['@id']);
    if (web) assert.equal(nodes.find((node) => node['@type'] === 'WebApplication').browserRequirements, 'JavaScript');
    if (directory) assert.equal(nodes.find((node) => node['@type'] === 'ItemList').itemListElement.length, 8);
    assert.equal(page.isPartOf['@id'], `${origin}/#website`);
  }
});

test('error HTML is excluded from indexing and product identity markup', async () => {
  for (const file of ['404.html', 'en/404/index.html']) {
    const html = await readFile(new URL(file, output), 'utf8');
    assert.match(html, /content="noindex, nofollow"/);
    assert.doesNotMatch(html, /rel="canonical"|hreflang=|application\/ld\+json/);
  }
});

test('web tool discovery includes searchable capabilities and shared executable guidance', async () => {
  const full = await readFile(new URL('llms-full.txt', output), 'utf8');
  for (const locale of ['zh', 'en']) {
    const prefix = locale === 'en' ? '/en' : '';
    const directory = await htmlFor(`${prefix}/tools/`);
    assert.match(directory.match(/<meta name="description" content="([^"]*)"/)?.[1] || '', /JSON.*Base64/);
    for (const tool of webTools[locale]) {
      assert.ok(tool.guide, `${locale}/${tool.slug}: shared guide missing`);
      const html = await htmlFor(`${prefix}/tools/${tool.slug}/`);
      assert.ok(html.includes(`<title>${tool.guide.searchTitle} | Zero</title>`));
      for (const anchor of ['usage', 'steps', 'examples', 'agent-usage']) assert.ok(html.includes(`id="${anchor}"`));
      for (const step of tool.guide.steps) assert.ok(full.includes(step), `${tool.slug}: step absent from AI index`);
      for (const example of tool.guide.examples) {
        assert.ok(full.includes(example.input), `${tool.slug}: input example absent from AI index`);
        assert.ok(full.includes(example.output), `${tool.slug}: output example absent from AI index`);
      }
      assert.ok(full.includes(tool.guide.agent.input));
      assert.ok(full.includes(tool.guide.agent.output));
      const app = graphFor(html)['@graph'].find((node) => node['@type'] === 'WebApplication');
      assert.deepEqual(app.featureList, tool.guide.agent.actions);
    }
  }
});

test('static tool guides stay out of browser executable assets', async () => {
  const directory = new URL('_astro/', output);
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.js')) continue;
    const script = await readFile(new URL(file, directory), 'utf8');
    for (const tool of webTools.en) assert.ok(!script.includes(tool.guide.searchTitle), `${file}: static guide was bundled as executable code`);
  }
});

test('sitemap lists all factual pages and omits error and text-index routes', async () => {
  const xml = await readFile(new URL('sitemap-0.xml', output), 'utf8');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls.sort(), routes.map((route) => `${origin}${route}`).sort());
  assert.doesNotMatch(xml, /404|llms/);
});

test('AI text indexes identify current facts and link only to existing canonical pages', async () => {
  for (const file of ['llms.txt', 'llms-full.txt']) {
    const body = await readFile(new URL(file, output), 'utf8');
    assert.match(body, /^# Zero/m);
    assert.match(body, /standard/);
    assert.match(body, /File/);
    assert.match(body, /2026-10-12/);
    assert.match(body, /尚无公开|no public release/i);
    for (const match of body.matchAll(/\]\((https:\/\/www\.usezero\.cn\/[^)]+)\)/g)) {
      const url = new URL(match[1]);
      await access(new URL(url.pathname.slice(1) + (url.pathname.endsWith('/') ? 'index.html' : ''), output));
    }
  }
});

test('all static internal page links and anchors resolve without client JavaScript', async () => {
  for (const route of routes) {
    const html = await htmlFor(route);
    for (const match of html.matchAll(/<a\b[^>]*href="([^" ]+)"/g)) {
      const href = match[1];
      if (!href.startsWith('/') && !href.startsWith('#')) continue;
      const target = new URL(href, `${origin}${route}`);
      const file = target.pathname.endsWith('/') ? `${target.pathname.slice(1)}index.html` : target.pathname.slice(1);
      const content = await readFile(new URL(file, output), 'utf8');
      if (target.hash) assert.ok(content.includes(`id="${target.hash.slice(1)}"`), `${route}: missing ${href}`);
    }
  }
});

test('Vercel error routes precede filesystem matching and target generated error HTML', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const boundary = config.routes.findIndex((route) => route.handle === 'filesystem');
  const errorPaths = ['/404', '/404/', '/404.html', '/en/404', '/en/404/', '/en/404.html', '/en/404/index.html'];
  for (const pathname of errorPaths) {
    const route = config.routes.slice(0, boundary).find((entry) => entry.src && new RegExp(entry.src).test(pathname));
    assert.ok(route, `${pathname}: direct error must precede filesystem`);
    assert.equal(route.status, 404);
    assert.equal(route.headers['X-Robots-Tag'], 'noindex, nofollow');
    await access(new URL(route.dest.slice(1), output));
  }
  for (const pathname of ['/missing/', '/en/missing/']) {
    const route = config.routes.slice(boundary + 1).find((entry) => new RegExp(entry.src).test(pathname));
    assert.equal(route.status, 404);
    await access(new URL(route.dest.slice(1), output));
    assert.equal(route.dest.startsWith('/en/'), pathname.startsWith('/en/'));
  }
});
