import assert from "node:assert/strict";
import test from "node:test";
import { createBingWallpaperCache } from "/private/tmp/zero-tests/plugins/bingWallpaper/bingWallpaperCache.js";

function fixture(size = 3) {
  const calls = { preview: 0, read: 0, release: 0, refresh: 0 };
  const service = {
    preview: async ({ wallpaperId }) => {
      calls.preview++;
      return { wallpaperId, token: wallpaperId, byteLength: size, mimeType: "image/jpeg" };
    },
    readPreview: async () => { calls.read++; return new Uint8Array(size).buffer; },
    releasePreview: async () => { calls.release++; },
    refresh: async () => {
      calls.refresh++;
      return { items: [], stale: false };
    },
  };
  return { calls, service };
}

test("reuses encoded previews across owners and deduplicates concurrent reads", async () => {
  const { service, calls } = fixture();
  const cache = createBingWallpaperCache(service);
  const [first, second] = await Promise.all([cache.preview("a"), cache.preview("a")]);
  assert.equal(first, second);
  assert.equal(await cache.preview("a"), first);
  assert.deepEqual(calls, { preview: 1, read: 1, release: 1, refresh: 0 });
});

test("preview cache expires and evicts by count and least recent access", async () => {
  const { service, calls } = fixture();
  let clock = 0;
  const cache = createBingWallpaperCache(service, () => clock);
  for (let i = 0; i < 10; i++) await cache.preview(String(i));
  cache.peek("0");
  await cache.preview("10");
  assert.ok(cache.peek("0"));
  assert.equal(cache.peek("1"), undefined);
  clock = 300001;
  assert.equal(cache.peek("0"), undefined);
  await cache.preview("0");
  assert.equal(calls.read, 12);
});

test("preview byte budget stays at eight MiB", async () => {
  const { service } = fixture(2 * 1024 * 1024);
  const cache = createBingWallpaperCache(service);
  for (let i = 0; i < 5; i++) await cache.preview(String(i));
  assert.equal(cache.peek("0"), undefined);
  for (let i = 1; i < 5; i++) assert.ok(cache.peek(String(i)));
});

test("mismatched bytes release the native lease and failures remain retryable", async () => {
  const { service, calls } = fixture();
  service.readPreview = async () => new Uint8Array(2).buffer;
  const cache = createBingWallpaperCache(service);
  await assert.rejects(cache.preview("a"), /did not match/);
  assert.equal(calls.release, 1);
  assert.equal(cache.peek("a"), undefined);
  service.readPreview = async () => new Uint8Array(3).buffer;
  assert.ok(await cache.preview("a"));
  assert.equal(calls.release, 2);
});

test("metadata refresh is coalesced, throttled, forced by retry, and renewed at China midnight", async () => {
  const { service, calls } = fixture();
  let clock = Date.UTC(2026, 9, 10, 15, 59);
  const cache = createBingWallpaperCache(service, () => clock);
  await Promise.all([cache.refresh(), cache.refresh()]);
  await cache.refresh();
  assert.equal(calls.refresh, 1);
  clock += 60000;
  await cache.refresh();
  assert.equal(calls.refresh, 2);
  await cache.refresh(true);
  assert.equal(calls.refresh, 3);
  clock += 300001;
  await cache.refresh();
  assert.equal(calls.refresh, 4);
});

test("failed metadata refresh is retried and preserves its stale snapshot", async () => {
  const { service, calls } = fixture();
  service.refresh = async () => { calls.refresh++; return { items: [], stale: true, error: { message: "offline" } }; };
  const cache = createBingWallpaperCache(service);
  assert.equal((await cache.refresh()).stale, true);
  await cache.refresh();
  assert.equal(calls.refresh, 2);
});
