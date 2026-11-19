import type {PaperWallpaper} from './archive.js';
import {createAutomationState, readAutomationState, type PaperAutomationState} from './automation.js';
import {calendarDate, publicationDate} from './policy.js';
import {PaperError, type JsonValue, type PaperHostPort} from './ports.js';
export const PREFERENCES_KEY = 'paper.preferences.v1';
export const ARCHIVE_KEY = 'paper.archive.v1';
export function jsonValue(value: PaperAutomationState | PaperArchiveCache): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
export function decodeState(value: JsonValue): PaperAutomationState {
  try {return value === null ? createAutomationState() : readAutomationState(value);}
  catch {throw new PaperError('paper.storage');}
}
export async function readSaved(host: PaperHostPort): Promise<{raw: JsonValue; state: PaperAutomationState}> {
  try {const raw = await host.get(PREFERENCES_KEY); return {raw, state: decodeState(raw)};}
  catch {throw new PaperError('paper.storage');}
}
export async function mergeState(host: PaperHostPort, update: (state: PaperAutomationState) => PaperAutomationState): Promise<PaperAutomationState> {
  let {raw, state} = await readSaved(host);
  for (let attempt = 0; attempt < 5; attempt++) {
    const proposed = update(state);
    let result;
    try {result = await host.compareAndSet(PREFERENCES_KEY, raw, jsonValue(proposed));}
    catch {throw new PaperError('paper.storage');}
    if (result.swapped) return proposed;
    raw = result.currentValue; state = decodeState(raw);
  }
  throw new PaperError('paper.storage', true);
}
export interface PaperArchiveCache {schemaVersion: 1; savedAt: number; items: PaperWallpaper[]}
function record(value: unknown): value is Record<string, unknown> {return value !== null && typeof value === 'object' && !Array.isArray(value);}
function safeUrl(value: unknown, image: boolean): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
  try {const url = new URL(value); return url.origin === 'https://www.bing.com' && !url.username && !url.password && !value.includes('#')
    && !value.replace(/^https:\/\/[^/]+/, '').split(/[?#]/, 1)[0]?.split('/').some(part => /^(?:\.|%2e){1,2}$/i.test(part))
    && (!image || url.pathname === '/th' && !!url.searchParams.get('id')?.trim());} catch {return false;}
}
export function readArchiveCache(input: unknown, now: number): PaperArchiveCache | null {
  if (input === null) return null;
  const invalid = (): never => {throw new PaperError('paper.archive');};
  if (!record(input) || Object.keys(input).length !== 3 || input.schemaVersion !== 1 || typeof input.savedAt !== 'number'
    || !Number.isFinite(input.savedAt) || input.savedAt > now || !Number.isFinite(new Date(input.savedAt).getTime()) || !Array.isArray(input.items) || input.items.length > 10) invalid();
  const source = input as Record<string, unknown> & {savedAt: number; items: unknown[]};
  const items: PaperWallpaper[] = [], ids = new Set<string>();
  for (const value of source.items) {
    if (!record(value) || Object.keys(value).some(key => !['id','startDate','displayDate','publicationDate','title','attribution','copyrightUrl','remoteUrl'].includes(key))
      || typeof value.id !== 'string' || !/^[^\s\u0000-\u001f\u007f]{1,128}$/.test(value.id) || ids.has(value.id)
      || typeof value.startDate !== 'string' || !calendarDate(value.startDate)
      || value.displayDate !== undefined && typeof value.displayDate !== 'string'
      || typeof value.title !== 'string' || value.title.length > 1024 || typeof value.attribution !== 'string' || value.attribution.length > 4096
      || !safeUrl(value.remoteUrl, true) || value.copyrightUrl !== undefined && !safeUrl(value.copyrightUrl, false)) invalid();
    const item = value as unknown as PaperWallpaper;
    if (publicationDate(item.displayDate, item.startDate, now) !== item.publicationDate) invalid();
    ids.add(item.id); items.push({...item});
  }
  items.sort((a,b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id));
  return {schemaVersion: 1, savedAt: source.savedAt, items};
}
export async function cacheArchive(host: PaperHostPort, items: PaperWallpaper[], now: number): Promise<void> {
  const raw = await host.get(ARCHIVE_KEY);
  readArchiveCache(raw, now);
  const cache = readArchiveCache({schemaVersion: 1, savedAt: now, items}, now)!;
  await host.compareAndSet(ARCHIVE_KEY, raw, jsonValue(cache));
}
