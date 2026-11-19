import {calendarDate, marketDay, publicationDate} from './policy.js';

export interface PaperWallpaper {
  id: string;
  startDate: string;
  displayDate?: string;
  publicationDate: string;
  title: string;
  attribution: string;
  copyrightUrl?: string;
  remoteUrl: string;
}
export interface PaperArchiveError {
  code: 'bing.response_invalid' | 'bing.response_limit' | 'bing.no_valid_items';
  message: string;
  retryable: true;
}
export type PaperArchiveResult =
  | {ok: true; items: PaperWallpaper[]; rejectedEntries: number}
  | {ok: false; error: PaperArchiveError};

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_CANDIDATES = 1024;
const MAX_URL_LENGTH = 2048;
const BING_ORIGIN = 'https://www.bing.com';

function failure(code: PaperArchiveError['code']): PaperArchiveResult {
  return {ok: false, error: {code, message: code === 'bing.response_limit'
    ? 'Bing archive exceeds the metadata limit.'
    : code === 'bing.no_valid_items' ? 'Bing response did not contain a valid wallpaper item.'
      : 'Bing archive metadata is malformed.', retryable: true}};
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function optionalString(value: unknown, limit: number): boolean {
  return value === undefined || value === null || typeof value === 'string' && value.length <= limit;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function bingUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH || /[\\\u0000-\u0020\u007f]/.test(trimmed)) return undefined;
  const absolute = trimmed.startsWith('/') ? `${BING_ORIGIN}${trimmed}` : trimmed;
  // URL normalizes dot segments before exposing pathname; reject those before parsing.
  const rawPath = absolute.replace(/^https:\/\/[^/]+/i, '').split(/[?#]/, 1)[0] ?? '';
  if (rawPath.split('/').some(segment => /^(?:\.|%2e){1,2}$/i.test(segment))) return undefined;
  try {
    const parsed = new URL(absolute);
    if (parsed.origin !== BING_ORIGIN || parsed.username || parsed.password || parsed.hash || absolute.includes('#')) return undefined;
    return parsed.href;
  } catch { return undefined; }
}
function imageUrl(image: Record<string, unknown>): string | undefined {
  const value = text(image.url) || (text(image.urlbase) ? `${text(image.urlbase)}_1920x1080.jpg` : '');
  const normalized = bingUrl(value);
  if (!normalized) return undefined;
  const parsed = new URL(normalized);
  if (parsed.pathname !== '/th' || !parsed.searchParams.getAll('id').some(id => id.trim())) return undefined;
  return normalized;
}
function displayDate(value: string): string | undefined {
  if (!/^\d{12}$/.test(value) || !calendarDate(value.slice(0, 8))) return undefined;
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  if (hour > 23 || minute > 59) return undefined;
  return marketDay(Date.parse(`${calendarDate(value.slice(0, 8))}T${value.slice(8, 10)}:${value.slice(10, 12)}:00Z`)).replaceAll('-', '');
}
async function identifier(image: Record<string, unknown>, remoteUrl: string): Promise<string> {
  const hsh = text(image.hsh);
  if (/^[A-Za-z0-9_-]{1,128}$/.test(hsh)) return hsh;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(remoteUrl));
  return Array.from(new Uint8Array(digest).slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function parseItem(value: unknown, now: number): Promise<PaperWallpaper | null> {
  if (!record(value) || typeof value.startdate !== 'string' || !calendarDate(value.startdate)) return null;
  for (const [key, limit] of [['url', MAX_URL_LENGTH], ['urlbase', MAX_URL_LENGTH], ['copyrightlink', MAX_URL_LENGTH],
    ['title', 1024], ['copyright', 4096], ['fullstartdate', 12], ['hsh', 128]] as const) {
    if (!optionalString(value[key], limit)) return null;
  }
  const remoteUrl = imageUrl(value);
  if (!remoteUrl || !publicationDate(undefined, value.startdate, now)) return null;
  const display = typeof value.fullstartdate === 'string' ? displayDate(value.fullstartdate) : undefined;
  if (typeof value.fullstartdate === 'string' && display === undefined) return null;
  const publication = publicationDate(display, value.startdate, now);
  if (!publication) return null;
  const attribution = text(value.copyright);
  const title = text(value.title) || attribution.split(' (')[0]?.trim() || '';
  const copyrightUrl = bingUrl(text(value.copyrightlink));
  return {id: await identifier(value, remoteUrl), startDate: value.startdate,
    ...(display === undefined ? {} : {displayDate: display}), publicationDate: publication,
    title, attribution, ...(copyrightUrl === undefined ? {} : {copyrightUrl}), remoteUrl};
}

export async function parseArchive(input: unknown, now: number): Promise<PaperArchiveResult> {
  // Validate caller time independently of input so a bad clock cannot look like an empty archive.
  marketDay(now);
  let encoded: string | undefined;
  try { encoded = JSON.stringify(input); } catch { return failure('bing.response_invalid'); }
  if (encoded === undefined) return failure('bing.response_invalid');
  if (new TextEncoder().encode(encoded).byteLength > MAX_RESPONSE_BYTES) return failure('bing.response_limit');
  if (!record(input) || !Array.isArray(input.images)) return failure('bing.response_invalid');
  if (input.images.length > MAX_CANDIDATES) return failure('bing.response_limit');
  const items: PaperWallpaper[] = [];
  const seen = new Set<string>();
  let rejectedEntries = 0;
  for (const candidate of input.images) {
    const item = await parseItem(candidate, now);
    if (!item) { rejectedEntries++; continue; }
    if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
  }
  if (items.length === 0) return failure('bing.no_valid_items');
  items.sort((left, right) => right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id));
  return {ok: true, items: items.slice(0, 10), rejectedEntries};
}

export async function parseArchiveJson(json: string, now: number): Promise<PaperArchiveResult> {
  if (new TextEncoder().encode(json).byteLength > MAX_RESPONSE_BYTES) return failure('bing.response_limit');
  let input: unknown;
  try { input = JSON.parse(json); } catch { return failure('bing.response_invalid'); }
  return parseArchive(input, now);
}
