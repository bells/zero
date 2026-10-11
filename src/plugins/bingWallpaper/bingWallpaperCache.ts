import type { BingWallpaperService } from "./bingWallpaperServiceCore.js";
import type { BingWallpaperSnapshot } from "./contracts.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PREVIEWS = 10;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;

interface CachedPreview {
  blob: Blob;
  expiresAt: number;
}

// Keep encoded previews across panel remounts; each visible owner still revokes its URL.
export function createBingWallpaperCache(
  service: BingWallpaperService,
  now: () => number = Date.now,
) {
  const previews = new Map<string, CachedPreview>();
  const pending = new Map<string, Promise<Blob>>();
  let refreshed: BingWallpaperSnapshot | undefined;
  let refreshedAt = 0;
  let refreshPending: Promise<BingWallpaperSnapshot> | undefined;

  function prune() {
    for (const [id, entry] of previews) {
      if (entry.expiresAt <= now()) previews.delete(id);
    }
  }

  function peek(id: string) {
    prune();
    const entry = previews.get(id);
    if (!entry) return undefined;
    previews.delete(id);
    previews.set(id, entry);
    return entry.blob;
  }

  async function load(id: string) {
    const descriptor = await service.preview({ wallpaperId: id });
    try {
      const bytes = new Uint8Array(await service.readPreview({ token: descriptor.token }));
      if (descriptor.wallpaperId !== id || descriptor.mimeType !== "image/jpeg"
        || bytes.byteLength === 0 || bytes.byteLength !== descriptor.byteLength
        || bytes.byteLength > MAX_PREVIEW_BYTES) {
        throw new Error("Wallpaper preview bytes did not match their descriptor.");
      }
      const blob = new Blob([bytes], { type: descriptor.mimeType });
      prune();
      let total = [...previews.values()].reduce((sum, entry) => sum + entry.blob.size, 0);
      while (previews.size >= MAX_PREVIEWS || total + blob.size > MAX_CACHE_BYTES) {
        const oldest = previews.keys().next().value;
        if (oldest === undefined) break;
        total -= previews.get(oldest)!.blob.size;
        previews.delete(oldest);
      }
      previews.set(id, { blob, expiresAt: now() + CACHE_TTL_MS });
      return blob;
    } finally {
      await service.releasePreview({ token: descriptor.token }).catch(() => undefined);
    }
  }

  return {
    peek,
    preview(id: string) {
      const cached = peek(id);
      if (cached) return Promise.resolve(cached);
      const existing = pending.get(id);
      if (existing) return existing;
      if (pending.size >= MAX_PREVIEWS) {
        return Promise.reject(new Error("Too many wallpaper previews are loading."));
      }
      const request = load(id).finally(() => pending.delete(id));
      pending.set(id, request);
      return request;
    },
    refresh(force = false) {
      // Bing zh-CN rolls over at midnight in China, even with an English UI.
      const marketDay = (timestamp: number) => Math.floor((timestamp + 8 * 3600 * 1000) / 86400000);
      if (!force && refreshed && now() - refreshedAt < CACHE_TTL_MS
        && marketDay(now()) === marketDay(refreshedAt)) {
        return Promise.resolve(refreshed);
      }
      if (refreshPending) return refreshPending;
      refreshPending = service.refresh().then((snapshot) => {
        if (!snapshot.error && !snapshot.stale) {
          refreshed = snapshot;
          refreshedAt = now();
          const ids = new Set(snapshot.items.map((item) => item.id));
          for (const id of previews.keys()) {
            if (!ids.has(id)) previews.delete(id);
          }
        } else {
          refreshed = undefined;
        }
        return snapshot;
      }).finally(() => { refreshPending = undefined; });
      return refreshPending;
    },
  };
}

const caches = new WeakMap<BingWallpaperService, ReturnType<typeof createBingWallpaperCache>>();

export function getBingWallpaperCache(service: BingWallpaperService) {
  let cache = caches.get(service);
  if (!cache) {
    cache = createBingWallpaperCache(service);
    caches.set(service, cache);
  }
  return cache;
}
